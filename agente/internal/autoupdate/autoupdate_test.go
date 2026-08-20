package autoupdate

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
)

func TestIsNewerVersion(t *testing.T) {
	cases := []struct {
		remote, local string
		want          bool
	}{
		{"1.2.0", "1.1.0", true},
		{"1.1.0", "1.1.0", false},
		{"1.1.0", "1.2.0", false},
		{"1.10.0", "1.9.0", true},  // numérico, não lexicográfico
		{"2.0.0", "1.99.99", true},
		{"1.1.1", "1.1.0", true},
		{"v1.2.0", "1.1.0", true}, // prefixo "v" tolerado
		{"", "1.0.0", false},
	}
	for _, c := range cases {
		if got := isNewerVersion(c.remote, c.local); got != c.want {
			t.Errorf("isNewerVersion(%q, %q) = %v, want %v", c.remote, c.local, got, c.want)
		}
	}
}

func withManifestServer(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	orig := ManifestURL
	ManifestURL = srv.URL + "/latest.json"
	t.Cleanup(func() { ManifestURL = orig })
}

func TestCheckAndStage_DownloadsAndValidatesNewerVersion(t *testing.T) {
	binary := []byte("conteúdo do binário novo, versão fake pra teste")
	sum := sha256.Sum256(binary)
	checksum := hex.EncodeToString(sum[:])

	withManifestServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/latest.json":
			_ = json.NewEncoder(w).Encode(map[string]string{
				"version": "9.9.9",
				"url":     "/binary", // relativa, precisa resolver contra o manifesto
				"sha256":  checksum,
			})
		case "/binary":
			_, _ = w.Write(binary)
		default:
			http.NotFound(w, r)
		}
	})

	dir := t.TempDir()
	exePath := filepath.Join(dir, "agente")

	staged, err := CheckAndStage(exePath, "1.0.0")
	if err != nil {
		t.Fatalf("CheckAndStage: %v", err)
	}
	if !staged {
		t.Fatal("esperava staged=true pra versão mais nova")
	}
	if !HasStaged(exePath) {
		t.Fatal("esperava HasStaged=true depois de CheckAndStage")
	}

	got, err := os.ReadFile(stagedPath(exePath))
	if err != nil {
		t.Fatalf("lendo .new: %v", err)
	}
	if string(got) != string(binary) {
		t.Fatal("conteúdo do .new não bate com o binário baixado")
	}
}

func TestCheckAndStage_NotNewerSkips(t *testing.T) {
	withManifestServer(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"version": "1.0.0", "url": "/binary", "sha256": "irrelevante"})
	})

	dir := t.TempDir()
	exePath := filepath.Join(dir, "agente")

	staged, err := CheckAndStage(exePath, "1.0.0")
	if err != nil {
		t.Fatalf("CheckAndStage: %v", err)
	}
	if staged {
		t.Fatal("não esperava staged=true pra mesma versão")
	}
	if HasStaged(exePath) {
		t.Fatal("não esperava arquivo .new quando não há versão nova")
	}
}

func TestCheckAndStage_BadChecksumRejected(t *testing.T) {
	binary := []byte("binário adulterado ou corrompido no meio do caminho")

	withManifestServer(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/latest.json":
			_ = json.NewEncoder(w).Encode(map[string]string{
				"version": "9.9.9",
				"url":     "/binary",
				"sha256":  "0000000000000000000000000000000000000000000000000000000000000000",
			})
		case "/binary":
			_, _ = w.Write(binary)
		}
	})

	dir := t.TempDir()
	exePath := filepath.Join(dir, "agente")

	staged, err := CheckAndStage(exePath, "1.0.0")
	if err == nil {
		t.Fatal("esperava erro de checksum")
	}
	if staged {
		t.Fatal("não esperava staged=true com checksum inválido")
	}
	if HasStaged(exePath) {
		t.Fatal("não pode deixar .new pronto quando o checksum não bate")
	}
}

func TestCleanupStale(t *testing.T) {
	dir := t.TempDir()
	exePath := filepath.Join(dir, "agente")
	if err := os.WriteFile(oldPath(exePath), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(tmpPath(exePath), []byte("tmp"), 0o644); err != nil {
		t.Fatal(err)
	}
	CleanupStale(exePath)
	if _, err := os.Stat(oldPath(exePath)); !os.IsNotExist(err) {
		t.Error(".old não foi limpo")
	}
	if _, err := os.Stat(tmpPath(exePath)); !os.IsNotExist(err) {
		t.Error(".new.tmp não foi limpo")
	}
}

// TestApply_RollsBackWhenNewBinaryNeverAnswersHealth cobre a propriedade de
// segurança mais importante do pacote: uma versão nova quebrada não pode
// derrubar a impressão do restaurante. Usa scripts de shell reais (só roda
// fora do Windows — no Windows a troca em si usa os mesmos os.Rename, só a
// forma de "binário executável de teste" muda) pra simular um binário novo
// que nunca sobe a API.
func TestApply_RollsBackWhenNewBinaryNeverAnswersHealth(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("usa scripts de shell pra simular o binário — não aplicável no Windows")
	}

	origTimeout, origInterval := healthCheckTimeout, healthCheckInterval
	healthCheckTimeout = 800 * time.Millisecond
	healthCheckInterval = 100 * time.Millisecond
	t.Cleanup(func() {
		healthCheckTimeout, healthCheckInterval = origTimeout, origInterval
	})

	dir := t.TempDir()
	exePath := filepath.Join(dir, "agente")

	oldScript := "#!/bin/sh\nsleep 5\n"
	newScript := "#!/bin/sh\nsleep 5\n" // nunca abre porta nenhuma — simula build quebrado

	if err := os.WriteFile(exePath, []byte(oldScript), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(stagedPath(exePath), []byte(newScript), 0o755); err != nil {
		t.Fatal(err)
	}

	// Porta que ninguém vai responder de propósito.
	err := Apply(exePath, 18099)
	if err == nil {
		t.Fatal("esperava erro (rollback) quando a versão nova não responde /health")
	}

	restored, readErr := os.ReadFile(exePath)
	if readErr != nil {
		t.Fatalf("lendo exePath depois do rollback: %v", readErr)
	}
	if string(restored) != oldScript {
		t.Fatal("depois do rollback, exePath deveria ter o conteúdo antigo restaurado")
	}
	if HasStaged(exePath) {
		t.Error("não deveria sobrar .new depois do rollback")
	}
	if _, err := os.Stat(stagedPath(exePath) + ".broken"); err != nil {
		t.Error("esperava o binário quebrado preservado como .new.broken pra inspeção")
	}
}

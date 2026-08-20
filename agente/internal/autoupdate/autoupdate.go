// Package autoupdate faz o agente se atualizar sozinho, sem depender de
// alguém no restaurante lembrar de baixar e reinstalar o .exe a cada fix —
// foi exatamente a falta disso que fez o fix da allowlist de origem (ver
// CLAUDE.md, seção "Ticket printing") ficar parado em produção até alguém
// reinstalar manualmente.
//
// O mecanismo é deliberadamente simples, sem infra nova: um manifesto JSON
// estático (latest.json) publicado ao lado do próprio .exe, do mesmo jeito
// que o instalador já é publicado hoje (ver README, "Publicar uma versão
// nova"). O agente confere esse manifesto, baixa o binário se houver
// versão mais nova, confere o SHA-256 declarado nele, e só então troca o
// arquivo no lugar do processo atual.
//
// Isso não substitui um pipeline de release assinado — a integridade aqui
// depende de HTTPS + SHA-256 batendo com o que o manifesto (servido pelo
// mesmo domínio já confiável do app restaurante) declara, mesmo nível de
// confiança que o download manual já tinha. Não há verificação de
// assinatura de código; se isso vier a importar, é um passo futuro, não
// coberto aqui.
package autoupdate

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"pdv-sigma/agente/internal/httpapi"
)

// ManifestURL é onde o agente procura a versão mais recente publicada —
// mesmo domínio de produção do app restaurante (ver
// httpapi.defaultAllowedOrigins), servido como arquivo estático, sem
// processamento (mesma forma que o .exe em si já é publicado). Var (não
// const) só pra dar pra sobrescrever em teste.
var ManifestURL = "https://app.assessoriasigma.com.br/downloads/latest.json"

// Tempos ajustáveis em teste — em produção ficam nos valores abaixo.
var (
	httpTimeout         = 30 * time.Second
	downloadTimeout     = 2 * time.Minute
	healthCheckTimeout  = 15 * time.Second
	healthCheckInterval = 500 * time.Millisecond
)

// maxBinarySize é um teto generoso (o .exe hoje tem ~7MB) só pra uma
// resposta quebrada ou inesperada não estourar memória lendo o corpo todo.
const maxBinarySize = 64 << 20

// manifest é o JSON publicado junto do instalador (ver
// restaurante/public/downloads/latest.json).
type manifest struct {
	Version string `json:"version"`
	URL     string `json:"url"`    // absoluta ou relativa a ManifestURL
	SHA256  string `json:"sha256"` // hex, do conteúdo do .exe
}

// HasStaged diz se já existe uma versão nova baixada e validada, esperando
// pra ser aplicada (ver CheckAndStage/Apply).
func HasStaged(exePath string) bool {
	_, err := os.Stat(stagedPath(exePath))
	return err == nil
}

// CleanupStale remove sobras de uma troca anterior (o .old fica pra trás
// até o processo antigo soltar o arquivo, e um .new.tmp pode sobrar de um
// download interrompido). Sempre best-effort — chamado no início do
// processo, antes de qualquer outra coisa.
func CleanupStale(exePath string) {
	_ = os.Remove(oldPath(exePath))
	_ = os.Remove(tmpPath(exePath))
}

// CheckAndStage confere o manifesto publicado; se houver uma versão mais
// nova que currentVersion, baixa o binário, confere o SHA-256 declarado e
// deixa pronto em exePath+".new". Retorna staged=true só quando uma versão
// nova foi baixada e validada com sucesso. Erros de rede/manifesto fora do
// ar nunca travam o chamador — quem chama decide se segue com a versão
// atual (é sempre isso que se faz aqui).
func CheckAndStage(exePath, currentVersion string) (staged bool, err error) {
	m, err := fetchManifest()
	if err != nil {
		return false, fmt.Errorf("não foi possível ler o manifesto de versão: %w", err)
	}
	if m.Version == "" || !isNewerVersion(m.Version, currentVersion) {
		return false, nil
	}

	downloadURL, err := resolveURL(m.URL)
	if err != nil {
		return false, fmt.Errorf("URL de download inválida no manifesto: %w", err)
	}

	body, err := downloadBinary(downloadURL)
	if err != nil {
		return false, fmt.Errorf("não foi possível baixar a versão %s: %w", m.Version, err)
	}

	sum := sha256.Sum256(body)
	got := hex.EncodeToString(sum[:])
	want := strings.ToLower(strings.TrimSpace(m.SHA256))
	if want == "" || got != want {
		return false, fmt.Errorf("checksum da versão %s não confere (esperado %s, obtido %s) — atualização descartada", m.Version, want, got)
	}

	tmp := tmpPath(exePath)
	if err := os.WriteFile(tmp, body, 0o755); err != nil {
		return false, fmt.Errorf("não foi possível gravar o binário baixado: %w", err)
	}
	if err := os.Rename(tmp, stagedPath(exePath)); err != nil {
		_ = os.Remove(tmp)
		return false, fmt.Errorf("não foi possível deixar a atualização pronta: %w", err)
	}

	log.Printf("autoupdate: versão %s baixada e validada (atual: %s)", m.Version, currentVersion)
	return true, nil
}

// Apply troca o binário atual pela versão deixada pronta por CheckAndStage
// e relança o processo. Só deve ser chamada depois que o servidor HTTP e a
// bandeja já encerraram — ninguém mais segura o arquivo nem a porta (ver
// cmd/agente/main.go, que garante essa ordem).
//
// Depois de trocar, espera a versão nova responder em /health antes de
// desistir de vez do binário antigo: se a versão nova não subir (build
// quebrado, por exemplo), desfaz a troca e relança a versão antiga —
// preferível a derrubar a impressão do restaurante inteiro por causa de um
// build ruim.
func Apply(exePath string, healthPort int) error {
	newPath := stagedPath(exePath)
	if _, err := os.Stat(newPath); err != nil {
		return fmt.Errorf("nenhuma atualização pendente em %s: %w", newPath, err)
	}

	old := oldPath(exePath)
	_ = os.Remove(old) // sobra de uma troca anterior, se houver

	if err := os.Rename(exePath, old); err != nil {
		return fmt.Errorf("não foi possível mover o binário atual: %w", err)
	}
	if err := os.Rename(newPath, exePath); err != nil {
		if rbErr := os.Rename(old, exePath); rbErr != nil {
			return fmt.Errorf("não foi possível ativar o binário novo (%v) nem desfazer a troca (%v)", err, rbErr)
		}
		return fmt.Errorf("não foi possível ativar o binário novo: %w", err)
	}

	cmd := exec.Command(exePath)
	cmd.Dir = filepath.Dir(exePath)
	if err := cmd.Start(); err != nil {
		rollback(exePath, old, newPath)
		return fmt.Errorf("não foi possível iniciar o binário novo: %w", err)
	}

	if waitHealthy(healthPort) {
		return nil
	}

	log.Printf("autoupdate: versão nova não respondeu em /health a tempo — desfazendo a troca")
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	rollback(exePath, old, newPath)

	fallback := exec.Command(exePath)
	fallback.Dir = filepath.Dir(exePath)
	if err := fallback.Start(); err != nil {
		return fmt.Errorf("versão nova não respondeu e a versão anterior também não pôde ser relançada: %w", err)
	}
	return errors.New("versão nova não respondeu em /health — troca desfeita, versão anterior relançada")
}

// rollback desfaz a troca: o binário novo (que não respondeu) vira um
// ".broken" pra inspeção manual depois, e o antigo volta pro lugar.
func rollback(exePath, old, newPath string) {
	_ = os.Rename(exePath, newPath+".broken")
	_ = os.Rename(old, exePath)
}

func waitHealthy(port int) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(healthCheckTimeout)
	url := fmt.Sprintf("http://127.0.0.1:%d/health", port)
	for time.Now().Before(deadline) {
		req, err := http.NewRequest(http.MethodGet, url, nil)
		if err == nil {
			// Toda rota do agente exige Origin permitido, inclusive
			// /health (ver httpapi.Server.ServeHTTP).
			req.Header.Set("Origin", httpapi.SelfCheckOrigin)
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
				if resp.StatusCode == http.StatusOK {
					return true
				}
			}
		}
		time.Sleep(healthCheckInterval)
	}
	return false
}

// WatchPeriodic confere o manifesto a cada `interval` enquanto o agente
// roda. Ao achar e validar uma versão nova, chama requestQuit — a troca de
// fato só acontece depois que o processo atual encerrar de forma graciosa
// (main.go: RequestQuit dispara o mesmo caminho do "Sair" manual, que dá
// tempo de qualquer impressão em andamento terminar antes do shutdown).
// Nunca troca o binário enquanto ele ainda está rodando.
func WatchPeriodic(ctx context.Context, exePath, currentVersion string, interval time.Duration, requestQuit func()) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			staged, err := CheckAndStage(exePath, currentVersion)
			if err != nil {
				log.Printf("autoupdate: checagem periódica falhou: %v", err)
				continue
			}
			if staged {
				log.Printf("autoupdate: versão nova pronta — encerrando o agente pra aplicar")
				requestQuit()
				return
			}
		}
	}
}

func fetchManifest() (manifest, error) {
	client := &http.Client{Timeout: httpTimeout}
	resp, err := client.Get(ManifestURL)
	if err != nil {
		return manifest{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return manifest{}, fmt.Errorf("manifesto respondeu %d", resp.StatusCode)
	}
	var m manifest
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&m); err != nil {
		return manifest{}, err
	}
	return m, nil
}

func downloadBinary(rawURL string) ([]byte, error) {
	client := &http.Client{Timeout: downloadTimeout}
	resp, err := client.Get(rawURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download respondeu %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBinarySize+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxBinarySize {
		return nil, fmt.Errorf("binário maior que o limite de %d bytes", maxBinarySize)
	}
	return body, nil
}

func resolveURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.IsAbs() {
		return raw, nil
	}
	base, err := url.Parse(ManifestURL)
	if err != nil {
		return "", err
	}
	return base.ResolveReference(u).String(), nil
}

// isNewerVersion compara "major.minor.patch" numericamente (não como
// string — "1.9.0" precisa ser menor que "1.10.0"). Componente ausente ou
// não numérico vira 0.
func isNewerVersion(remote, local string) bool {
	rp := parseVersion(remote)
	lp := parseVersion(local)
	for i := 0; i < 3; i++ {
		if rp[i] != lp[i] {
			return rp[i] > lp[i]
		}
	}
	return false
}

func parseVersion(v string) [3]int {
	var out [3]int
	parts := strings.SplitN(strings.TrimPrefix(strings.TrimSpace(v), "v"), ".", 3)
	for i := 0; i < len(parts) && i < 3; i++ {
		n, _ := strconv.Atoi(strings.TrimSpace(parts[i]))
		out[i] = n
	}
	return out
}

func stagedPath(exePath string) string { return exePath + ".new" }
func oldPath(exePath string) string    { return exePath + ".old" }
func tmpPath(exePath string) string    { return exePath + ".new.tmp" }

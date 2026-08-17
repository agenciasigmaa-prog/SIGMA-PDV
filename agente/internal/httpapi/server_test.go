package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"pdv-sigma/agente/internal/config"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	store, err := config.Load(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}
	return New(store, NewQueue())
}

func TestHealthRejectsMissingOrigin(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("sem Origin devia dar 403, deu %d", rec.Code)
	}
}

func TestHealthRejectsUnknownOrigin(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://site-nao-configurado.example")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("origem não configurada devia dar 403, deu %d", rec.Code)
	}
}

func TestHealthAllowsKnownOrigin(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://localhost:5175")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("origem conhecida devia dar 200, deu %d: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5175" {
		t.Errorf("Access-Control-Allow-Origin = %q, want origem exata (nunca *)", got)
	}
}

func TestHealthAllowsExtraOrigin(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	// Simula config.json editado à mão com um domínio de produção.
	os.WriteFile(path, []byte(`{"extraOrigins":["https://restaurante.exemplo.com.br"]}`), 0o600)
	store, err := config.Load(path)
	if err != nil {
		t.Fatalf("config.Load: %v", err)
	}
	s := New(store, NewQueue())

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "https://restaurante.exemplo.com.br")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("origem extra do config.json devia ser aceita, deu %d", rec.Code)
	}
}

func TestOptionsPreflightAllowedOrigin(t *testing.T) {
	s := newTestServer(t)
	req := httptest.NewRequest(http.MethodOptions, "/print", nil)
	req.Header.Set("Origin", "http://localhost:5175")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("preflight de origem permitida devia dar 200, deu %d", rec.Code)
	}
}

func TestPrintFormatoPdfNotImplemented(t *testing.T) {
	s := newTestServer(t)
	body, _ := json.Marshal(map[string]any{
		"type":        "conta_mesa",
		"formato":     "pdf",
		"printerName": "Qualquer",
		"commands":    []map[string]any{{"op": "cut"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/print", bytes.NewReader(body))
	req.Header.Set("Origin", "http://localhost:5175")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("formato pdf devia dar 501, deu %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPrintRequiresPrinterName(t *testing.T) {
	s := newTestServer(t)
	body, _ := json.Marshal(map[string]any{
		"type":     "conta_mesa",
		"commands": []map[string]any{{"op": "cut"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/print", bytes.NewReader(body))
	req.Header.Set("Origin", "http://localhost:5175")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("sem impressora configurada devia dar 400, deu %d: %s", rec.Code, rec.Body.String())
	}
}

func TestPrintRequiresCommands(t *testing.T) {
	s := newTestServer(t)
	body, _ := json.Marshal(map[string]any{"type": "conta_mesa", "printerName": "Qualquer"})
	req := httptest.NewRequest(http.MethodPost, "/print", bytes.NewReader(body))
	req.Header.Set("Origin", "http://localhost:5175")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("sem commands devia dar 400, deu %d", rec.Code)
	}
}

func TestPrintSucceedsWithStubPrinter(t *testing.T) {
	s := newTestServer(t)
	body, _ := json.Marshal(map[string]any{
		"type":        "teste",
		"printerName": "Impressora de teste (dev, sem Windows)",
		"commands":    []map[string]any{{"op": "text", "value": "oi"}, {"op": "cut"}},
	})
	req := httptest.NewRequest(http.MethodPost, "/print", bytes.NewReader(body))
	req.Header.Set("Origin", "http://localhost:5175")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("impressão via stub devia dar 200, deu %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("resposta não é JSON válido: %v", err)
	}
	if resp["ok"] != true || resp["jobId"] == "" {
		t.Errorf("resposta inesperada: %v", resp)
	}
}

func TestConfigRoundTrip(t *testing.T) {
	s := newTestServer(t)

	put, _ := json.Marshal(map[string]any{
		"printerName": "EPSON TM-T20",
		"paperWidth":  58,
		"copies":      2,
		"autoPrint":   false,
	})
	req := httptest.NewRequest(http.MethodPut, "/config", bytes.NewReader(put))
	req.Header.Set("Origin", "http://localhost:5175")
	rec := httptest.NewRecorder()
	s.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT /config devia dar 200, deu %d: %s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/config", nil)
	req.Header.Set("Origin", "http://localhost:5175")
	rec = httptest.NewRecorder()
	s.ServeHTTP(rec, req)

	var cfg configBody
	if err := json.Unmarshal(rec.Body.Bytes(), &cfg); err != nil {
		t.Fatalf("resposta não é JSON válido: %v", err)
	}
	if cfg.PrinterName != "EPSON TM-T20" || cfg.PaperWidth != 58 || cfg.Copies != 2 || cfg.AutoPrint {
		t.Errorf("config não persistiu corretamente: %+v", cfg)
	}
}

// Package httpapi expõe a API HTTP do agente em 127.0.0.1 — nunca em
// 0.0.0.0, pra API não ficar acessível pela rede (ARQUITETURA.md §3.1).
package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"slices"

	"pdv-sigma/agente/internal/config"
	"pdv-sigma/agente/internal/escpos"
	"pdv-sigma/agente/internal/printer"
)

// Server monta as rotas do agente sobre um *config.Store e uma *Queue.
type Server struct {
	store *config.Store
	queue *Queue
	mux   *http.ServeMux
}

// New monta o roteador. allowedOrigins deve incluir defaultAllowedOrigins já
// mesclado com config.ExtraOrigins — quem chama decide a ordem de precedência.
func New(store *config.Store, queue *Queue) *Server {
	s := &Server{store: store, queue: queue, mux: http.NewServeMux()}
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/printers", s.handlePrinters)
	s.mux.HandleFunc("/config", s.handleConfig)
	s.mux.HandleFunc("/print", s.handlePrint)
	return s
}

// ServeHTTP aplica o middleware de origem permitida antes de despachar pro
// mux. Toda requisição chega com header Origin (é assim que fetch()
// cross-origin do navegador funciona); se ausente ou fora da allowlist, a
// requisição é rejeitada com 403 — sites não configurados simplesmente não
// conseguem falar com o agente e seguem o fluxo normal do navegador.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" || !s.originAllowed(origin) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Origem não permitida"})
		return
	}

	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "content-type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	s.mux.ServeHTTP(w, r)
}

func (s *Server) originAllowed(origin string) bool {
	if slices.Contains(defaultAllowedOrigins, origin) {
		return true
	}
	return slices.Contains(s.store.Get().ExtraOrigins, origin)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "método não suportado"})
		return
	}
	cfg := s.store.Get()
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"version": Version,
		"agentId": cfg.AgentID,
	})
}

func (s *Server) handlePrinters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "método não suportado"})
		return
	}
	printers, err := printer.List()
	if err != nil {
		log.Printf("printer.List: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Não foi possível listar as impressoras"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"printers": printers})
}

type configBody struct {
	PrinterName string `json:"printerName"`
	PaperWidth  int    `json:"paperWidth"`
	Copies      int    `json:"copies"`
	AutoPrint   bool   `json:"autoPrint"`
}

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, toConfigBody(s.store.Get()))

	case http.MethodPut:
		var body configBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
			return
		}
		err := s.store.Update(func(c config.Config) config.Config {
			c.PrinterName = body.PrinterName
			c.PaperWidth = body.PaperWidth
			c.Copies = body.Copies
			c.AutoPrint = body.AutoPrint
			return c
		})
		if err != nil {
			log.Printf("config.Update: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Não foi possível salvar a configuração"})
			return
		}
		writeJSON(w, http.StatusOK, toConfigBody(s.store.Get()))

	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "método não suportado"})
	}
}

func toConfigBody(c config.Config) configBody {
	return configBody{PrinterName: c.PrinterName, PaperWidth: c.PaperWidth, Copies: c.Copies, AutoPrint: c.AutoPrint}
}

type printRequestBody struct {
	Type        string           `json:"type"`
	PrinterName string           `json:"printerName"`
	Copies      int              `json:"copies"`
	PaperWidth  int              `json:"paperWidth"`
	Formato     string           `json:"formato"`
	Commands    []escpos.Command `json:"commands"`
}

func (s *Server) handlePrint(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "método não suportado"})
		return
	}

	var body printRequestBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	formato := body.Formato
	if formato == "" {
		formato = "escpos"
	}
	if formato == "pdf" {
		// Fora de escopo por design: o agente é 100% Go puro (sem cgo/MuPDF)
		// pra ficar cross-compilável e leve. Ver ARQUITETURA.md §5.
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "Impressão de PDF/A4 não é suportada nesta versão do agente"})
		return
	}
	if formato != "escpos" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "formato inválido: use \"escpos\""})
		return
	}
	if len(body.Commands) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "commands é obrigatório e não pode ser vazio"})
		return
	}

	cfg := s.store.Get()

	printerName := body.PrinterName
	if printerName == "" {
		printerName = cfg.PrinterName
	}
	if printerName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Nenhuma impressora configurada — abra /impressora e selecione uma"})
		return
	}

	paperWidth := body.PaperWidth
	if paperWidth != 58 && paperWidth != 80 {
		paperWidth = cfg.PaperWidth
	}

	copies := body.Copies
	if copies < 1 {
		copies = cfg.Copies
	}

	data := escpos.Render(body.Commands, paperWidth)

	jobID, err := s.queue.Submit(printerName, data, copies)
	if err != nil {
		if errors.Is(err, errQueueFull) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Fila de impressão cheia, tente novamente em instantes"})
			return
		}
		if errors.Is(err, printer.ErrNotFound) {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Impressora \"" + printerName + "\" não encontrada"})
			return
		}
		if errors.Is(err, printer.ErrTimeout) {
			writeJSON(w, http.StatusGatewayTimeout, map[string]string{"error": "Impressora não respondeu a tempo"})
			return
		}
		log.Printf("print job %s falhou: %v", jobID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Falha ao imprimir: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "jobId": jobID})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

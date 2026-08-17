// Package config cuida do config.json ao lado do binário: impressora
// escolhida, largura de papel, cópias, auto-print e as origens extras
// permitidas a chamar a API. Sem banco de dados externo — leitura/escrita
// direta do JSON, com escrita atômica pra não corromper em falha no meio do
// save.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// Config é o estado persistido em config.json.
type Config struct {
	AgentID      string   `json:"agentId"`
	PrinterName  string   `json:"printerName"`
	PaperWidth   int      `json:"paperWidth"`   // 58 ou 80
	Copies       int      `json:"copies"`       // 1-5
	AutoPrint    bool     `json:"autoPrint"`
	ExtraOrigins []string `json:"extraOrigins"` // além da allowlist de build
}

func defaults() Config {
	return Config{
		PaperWidth: 80,
		Copies:     1,
		AutoPrint:  true,
	}
}

// Store guarda o Config em memória com lock, e sincroniza com o arquivo.
type Store struct {
	mu   sync.RWMutex
	path string
	cfg  Config
}

// Load lê config.json ao lado do executável (path informado pelo chamador).
// Se o arquivo não existir ou estiver corrompido, começa com os valores
// padrão e um agentId novo — nunca falha a inicialização por causa disso.
func Load(path string) (*Store, error) {
	s := &Store{path: path}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			s.cfg = defaults()
			s.cfg.AgentID = newAgentID()
			return s, s.save()
		}
		return nil, err
	}

	var cfg Config
	if jsonErr := json.Unmarshal(data, &cfg); jsonErr != nil {
		// JSON corrompido: reseta pro padrão em vez de travar o agente.
		s.cfg = defaults()
		s.cfg.AgentID = newAgentID()
		return s, s.save()
	}

	if cfg.AgentID == "" {
		cfg.AgentID = newAgentID()
	}
	if cfg.PaperWidth != 58 && cfg.PaperWidth != 80 {
		cfg.PaperWidth = 80
	}
	if cfg.Copies < 1 || cfg.Copies > 5 {
		cfg.Copies = 1
	}
	s.cfg = cfg
	return s, nil
}

func newAgentID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Get retorna uma cópia do estado atual.
func (s *Store) Get() Config {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.cfg
}

// Update aplica uma função sobre o estado atual e persiste o resultado.
func (s *Store) Update(fn func(Config) Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cfg = fn(s.cfg)
	if s.cfg.PaperWidth != 58 && s.cfg.PaperWidth != 80 {
		s.cfg.PaperWidth = 80
	}
	if s.cfg.Copies < 1 {
		s.cfg.Copies = 1
	}
	if s.cfg.Copies > 5 {
		s.cfg.Copies = 5
	}
	return s.save()
}

// save grava em arquivo temporário e faz rename atômico, evitando corrupção
// se o processo morrer no meio da escrita.
func (s *Store) save() error {
	data, err := json.MarshalIndent(s.cfg, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// DefaultPath retorna config.json na mesma pasta do executável.
func DefaultPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "config.json"), nil
}

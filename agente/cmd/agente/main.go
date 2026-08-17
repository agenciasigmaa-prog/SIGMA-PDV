// Comando agente: binário único (ImpressoraPDVSigma.exe no Windows), sem
// runtime externo, que roda em segundo plano e expõe a API HTTP do
// PrintBridge substituto só em 127.0.0.1 — ver ARQUITETURA.md.
package main

import (
	_ "embed"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"pdv-sigma/agente/internal/autostart"
	"pdv-sigma/agente/internal/config"
	"pdv-sigma/agente/internal/httpapi"
	"pdv-sigma/agente/internal/trayapp"
)

//go:embed icon.ico
var iconBytes []byte

func main() {
	logFile := setupLogging()
	if logFile != nil {
		defer logFile.Close()
	}

	cfgPath, err := config.DefaultPath()
	if err != nil {
		log.Fatalf("não foi possível localizar o executável: %v", err)
	}

	// Se o config.json ainda não existe, é a primeira vez que este .exe
	// roda nesta máquina — liga "iniciar com o Windows" sozinho, sem
	// esperar que alguém abra o menu da bandeja pra fazer isso. Só na
	// primeira vez: se o usuário desligar depois pelo menu, uma reinstalação
	// não pode religar por baixo dos panos.
	firstRun := false
	if _, statErr := os.Stat(cfgPath); os.IsNotExist(statErr) {
		firstRun = true
	}

	store, err := config.Load(cfgPath)
	if err != nil {
		log.Fatalf("não foi possível carregar %s: %v", cfgPath, err)
	}

	if firstRun {
		if err := autostart.SetEnabled(true); err != nil {
			log.Printf("não foi possível habilitar início automático na primeira execução: %v", err)
		} else {
			log.Printf("início automático habilitado (primeira execução)")
		}
	}

	cfg := store.Get()
	log.Printf("Impressora PDV-Sigma v%s — agentId=%s config=%s", httpapi.Version, cfg.AgentID, cfgPath)

	queue := httpapi.NewQueue()
	handler := httpapi.New(store, queue)

	addr := fmt.Sprintf("127.0.0.1:%d", httpapi.Port)
	log.Printf("ouvindo em http://%s (só localhost — nunca 0.0.0.0)", addr)

	httpServer := &http.Server{Addr: addr, Handler: handler}

	// No Windows, trayapp.Run sobe o servidor numa goroutine e bloqueia
	// mostrando o ícone na bandeja até "Sair". Fora do Windows (dev/test),
	// o stub só chama ListenAndServe direto — sem bandeja, mesmo
	// comportamento de antes.
	if err := trayapp.Run(iconBytes, httpapi.Version, cfg.AgentID, httpServer); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("servidor HTTP encerrou: %v", err)
	}
}

// setupLogging grava o log num arquivo ao lado do executável, porque
// -H=windowsgui não tem console pra mostrar nada — sem isso, um erro de
// inicialização seria invisível para quem for diagnosticar no restaurante.
func setupLogging() *os.File {
	exe, err := os.Executable()
	if err != nil {
		return nil
	}
	path := filepath.Join(filepath.Dir(exe), "impressora-pdv-sigma.log")
	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return nil
	}
	log.SetOutput(f)
	return f
}

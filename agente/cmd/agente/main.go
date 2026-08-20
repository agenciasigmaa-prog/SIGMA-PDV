// Comando agente: binário único (ImpressoraPDVSigma.exe no Windows), sem
// runtime externo, que roda em segundo plano e expõe a API HTTP do
// PrintBridge substituto só em 127.0.0.1 — ver ARQUITETURA.md.
package main

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"pdv-sigma/agente/internal/autostart"
	"pdv-sigma/agente/internal/autoupdate"
	"pdv-sigma/agente/internal/config"
	"pdv-sigma/agente/internal/httpapi"
	"pdv-sigma/agente/internal/trayapp"
)

//go:embed icon.ico
var iconBytes []byte

// autoUpdateInterval é de quanto em quanto tempo o agente confere se saiu
// uma versão nova enquanto já está rodando (fora a checagem síncrona no
// início — ver mais abaixo). Não precisa ser curto: o caso comum (login do
// Windows de manhã) já é coberto pela checagem de início.
const autoUpdateInterval = 6 * time.Hour

func main() {
	logFile := setupLogging()
	if logFile != nil {
		defer logFile.Close()
	}

	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("não foi possível localizar o executável: %v", err)
	}
	autoupdate.CleanupStale(exePath)

	// Se uma execução anterior baixou e validou uma versão nova mas não
	// chegou a trocar de fato (processo morto no meio, Windows desligou
	// etc.), aplica agora, antes de mais nada — evita ficar preso rodando
	// uma versão velha só porque a troca foi interrompida.
	if autoupdate.HasStaged(exePath) {
		if err := autoupdate.Apply(exePath, httpapi.Port); err != nil {
			log.Printf("autoupdate: falha ao aplicar atualização pendente: %v", err)
		} else {
			log.Printf("autoupdate: atualização pendente aplicada — encerrando processo antigo")
			return
		}
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

	// Checagem de atualização síncrona, antes de abrir bandeja/servidor —
	// cobre o caso comum (primeira abertura do dia, no login do Windows)
	// sem esperar o ciclo periódico abaixo. Falha aqui (sem internet,
	// manifesto fora do ar etc.) nunca impede o agente de seguir rodando
	// com a versão atual.
	if staged, err := autoupdate.CheckAndStage(exePath, httpapi.Version); err != nil {
		log.Printf("autoupdate: checagem inicial falhou (seguindo com v%s): %v", httpapi.Version, err)
	} else if staged {
		if err := autoupdate.Apply(exePath, httpapi.Port); err != nil {
			log.Printf("autoupdate: falha ao aplicar atualização: %v", err)
		} else {
			log.Printf("autoupdate: atualizado com sucesso — encerrando processo antigo")
			return
		}
	}

	queue := httpapi.NewQueue()
	handler := httpapi.New(store, queue)

	addr := fmt.Sprintf("127.0.0.1:%d", httpapi.Port)
	log.Printf("ouvindo em http://%s (só localhost — nunca 0.0.0.0)", addr)

	httpServer := &http.Server{Addr: addr, Handler: handler}

	// Checagem periódica em segundo plano: se aparecer uma versão nova
	// enquanto o agente já está rodando, baixa e valida, e só então pede
	// pra bandeja encerrar como se fosse um "Sair" manual (dá tempo de
	// qualquer impressão em andamento terminar antes do shutdown). A troca
	// de fato só acontece depois que trayapp.Run retornar, logo abaixo —
	// nunca troca o binário com o processo ainda no ar.
	updateCtx, cancelUpdate := context.WithCancel(context.Background())
	go autoupdate.WatchPeriodic(updateCtx, exePath, httpapi.Version, autoUpdateInterval, trayapp.RequestQuit)

	// No Windows, trayapp.Run sobe o servidor numa goroutine e bloqueia
	// mostrando o ícone na bandeja até "Sair" (manual ou via autoupdate).
	// Fora do Windows (dev/test), o stub só chama ListenAndServe direto —
	// sem bandeja, mesmo comportamento de antes.
	runErr := trayapp.Run(iconBytes, httpapi.Version, cfg.AgentID, httpServer)
	cancelUpdate()

	if autoupdate.HasStaged(exePath) {
		if err := autoupdate.Apply(exePath, httpapi.Port); err != nil {
			log.Printf("autoupdate: falha ao aplicar atualização após encerrar: %v", err)
		} else {
			log.Printf("autoupdate: atualizado com sucesso — encerrando processo antigo")
			return
		}
	}

	if runErr != nil && !errors.Is(runErr, http.ErrServerClosed) {
		log.Fatalf("servidor HTTP encerrou: %v", runErr)
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

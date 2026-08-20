//go:build windows

// Package trayapp roda o agente com um ícone na bandeja do Windows (via
// fyne.io/systray, o fork sem as dependências pesadas de logging do
// getlantern/systray original — no Windows a implementação é só chamadas
// Win32 via syscall, sem cgo). Existe pra que a máquina do caixa tenha uma
// forma visual de saber que o agente está rodando e de sair dele, sem
// precisar abrir o Gerenciador de Tarefas.
package trayapp

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"fyne.io/systray"
	"pdv-sigma/agente/internal/autostart"
)

// Run mostra o ícone na bandeja, sobe o servidor HTTP numa goroutine e
// bloqueia até o usuário clicar em "Sair" (ou o servidor cair sozinho).
func Run(icon []byte, version, agentID string, srv *http.Server) error {
	var serveErr error

	systray.Run(func() {
		systray.SetIcon(icon)
		systray.SetTitle("Impressora PDV-Sigma")
		systray.SetTooltip("Impressora PDV-Sigma — agente de impressão local")

		mStatus := systray.AddMenuItem(fmt.Sprintf("Rodando — v%s", version), "")
		mStatus.Disable()
		mID := systray.AddMenuItem(fmt.Sprintf("ID: %s", agentID), "")
		mID.Disable()
		systray.AddSeparator()

		mAutoStart := systray.AddMenuItemCheckbox(
			"Iniciar com o Windows",
			"Abre automaticamente ao fazer login neste usuário",
			autostart.IsEnabled(),
		)
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Sair", "Encerra o agente de impressão")

		go func() {
			err := srv.ListenAndServe()
			serveErr = err
			if err == nil || errors.Is(err, http.ErrServerClosed) {
				// Encerramento normal — já é consequência de alguém ter
				// clicado em "Sair" (que já chama systray.Quit()), então não
				// precisa fazer nada aqui.
				return
			}

			// Falha real (porta 18080 já em uso por outra instância travada
			// é a mais comum). Não chama systray.Quit(): o ícone precisa
			// continuar visível mostrando o erro, senão ele passa batido —
			// sem isso, "a bandeja não aparece" é indistinguível de "o
			// ícone piscou e sumiu antes de alguém ver".
			log.Printf("servidor HTTP não conseguiu iniciar: %v", err)
			mStatus.SetTitle("Erro ao iniciar — veja agente.log")
			mStatus.SetTooltip(err.Error())
		}()

		go func() {
			for {
				select {
				case <-mAutoStart.ClickedCh:
					enabled := !autostart.IsEnabled()
					if err := autostart.SetEnabled(enabled); err != nil {
						log.Printf("não foi possível alterar início automático: %v", err)
						continue
					}
					if enabled {
						mAutoStart.Check()
					} else {
						mAutoStart.Uncheck()
					}
				case <-mQuit.ClickedCh:
					systray.Quit()
					return
				}
			}
		}()
	}, func() {
		// onExit: encerra o servidor com um prazo curto em vez de matar o
		// processo na marra — deixa qualquer impressão em andamento na fila
		// terminar de vez, não corta na metade do WritePrinter.
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	})

	return serveErr
}

// RequestQuit sinaliza pra bandeja encerrar como se alguém tivesse clicado
// em "Sair" — usado pelo autoupdate quando termina de baixar e validar uma
// versão nova. O onExit já registrado acima cuida do shutdown gracioso do
// servidor (mesmo caminho do "Sair" manual, com os 5s de tolerância pra
// uma impressão em andamento terminar); essa função só precisa disparar
// esse mesmo caminho de fora da goroutine da bandeja.
func RequestQuit() {
	systray.Quit()
}

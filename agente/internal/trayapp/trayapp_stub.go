//go:build !windows

// Stub usado fora do Windows (dev/test na WSL) — sem bandeja, só sobe o
// servidor HTTP e bloqueia. Ver trayapp_windows.go pra implementação real.
package trayapp

import (
	"context"
	"net/http"
	"sync/atomic"
	"time"
)

var runningServer atomic.Pointer[http.Server]

func Run(icon []byte, version, agentID string, srv *http.Server) error {
	runningServer.Store(srv)
	return srv.ListenAndServe()
}

// RequestQuit espelha trayapp_windows.go pra quem chama (autoupdate) não
// precisar saber qual build está rodando — aqui não há bandeja, então só
// desliga o servidor com a mesma tolerância de 5s pra impressão em
// andamento terminar.
func RequestQuit() {
	srv := runningServer.Load()
	if srv == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

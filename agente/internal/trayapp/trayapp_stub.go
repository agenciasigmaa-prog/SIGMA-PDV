//go:build !windows

// Stub usado fora do Windows (dev/test na WSL) — sem bandeja, só sobe o
// servidor HTTP e bloqueia. Ver trayapp_windows.go pra implementação real.
package trayapp

import "net/http"

func Run(icon []byte, version, agentID string, srv *http.Server) error {
	return srv.ListenAndServe()
}

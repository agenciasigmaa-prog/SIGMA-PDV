//go:build !windows

// Stub usado fora do Windows (dev/test na WSL) — a chave de registro Run só
// existe no Windows. Ver autostart_windows.go pra implementação real.
package autostart

func IsEnabled() bool { return false }

func SetEnabled(enabled bool) error { return nil }

//go:build !windows

// Stub usado fora do Windows (ex.: build/test na WSL durante o
// desenvolvimento). O binário publicado é sempre Windows — ver
// agente/README.md — este arquivo existe só pra `go build`/`go test`
// funcionarem localmente sem acesso a winspool.drv.
package printer

import (
	"context"
	"fmt"
	"log"
)

// List não tem como enumerar impressoras reais fora do Windows; devolve uma
// impressora fictícia pra exercitar a UI/API em dev.
func List() ([]Info, error) {
	return []Info{{Name: "Impressora de teste (dev, sem Windows)", IsDefault: true}}, nil
}

// PrintRaw em dev só loga os bytes recebidos — não há spooler real.
func PrintRaw(ctx context.Context, printerName string, data []byte, copies int) error {
	if ctx.Err() != nil {
		return ErrTimeout
	}
	log.Printf("[dev] PrintRaw stub: printer=%q copies=%d bytes=%d", printerName, copies, len(data))
	if printerName == "" {
		return fmt.Errorf("%w: nome vazio", ErrNotFound)
	}
	return nil
}

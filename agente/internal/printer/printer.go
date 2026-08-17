// Package printer expõe a descoberta de impressoras e o envio de bytes RAW
// ao spooler do Windows. A implementação real (winspool.drv via syscall)
// está em spooler_windows.go; spooler_stub.go permite compilar e testar o
// resto do agente fora do Windows (ex.: dev na WSL).
package printer

import "errors"

// Info descreve uma impressora instalada no sistema.
type Info struct {
	Name      string `json:"name"`
	IsDefault bool   `json:"isDefault"`
}

// ErrTimeout é retornado quando o envio ao spooler não termina dentro do
// timeout de segurança (ver httpapi/queue.go).
var ErrTimeout = errors.New("impressora não respondeu a tempo")

// ErrNotFound é retornado quando o nome de impressora informado não existe
// no sistema.
var ErrNotFound = errors.New("impressora não encontrada")

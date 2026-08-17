//go:build windows

// Impressão RAW via chamada direta ao spooler do Windows (winspool.drv),
// sem processo externo, sem dependência de terceiros — ver §3.4 e §3.5(a)
// de ARQUITETURA.md. StartDocPrinter/WritePrinter com datatype "RAW" manda
// os bytes ESC/POS direto pra impressora térmica, que os interpreta
// nativamente; nenhuma renderização é feita pelo Windows nesse caminho.
package printer

import (
	"context"
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	winspool               = windows.NewLazySystemDLL("winspool.drv")
	procOpenPrinterW       = winspool.NewProc("OpenPrinterW")
	procClosePrinter       = winspool.NewProc("ClosePrinter")
	procStartDocPrinterW   = winspool.NewProc("StartDocPrinterW")
	procStartPagePrinter   = winspool.NewProc("StartPagePrinter")
	procWritePrinter       = winspool.NewProc("WritePrinter")
	procEndPagePrinter     = winspool.NewProc("EndPagePrinter")
	procEndDocPrinter      = winspool.NewProc("EndDocPrinter")
	procEnumPrintersW      = winspool.NewProc("EnumPrintersW")
	procGetDefaultPrinterW = winspool.NewProc("GetDefaultPrinterW")
)

const (
	printerEnumLocal       = 0x00000002
	printerEnumConnections = 0x00000004
)

type docInfo1 struct {
	pDocName    *uint16
	pOutputFile *uint16
	pDatatype   *uint16
}

// printerInfo4 espelha PRINTER_INFO_4 — struct "achatada" (sem sub-buffers
// aninhados como o nível 2), suficiente pra listar nome de impressoras
// locais e conectadas.
type printerInfo4 struct {
	pPrinterName *uint16
	pServerName  *uint16
	Attributes   uint32
}

// List enumera as impressoras instaladas (locais + conexões de rede) via
// EnumPrintersW nível 4, marcando qual é a padrão do Windows via
// GetDefaultPrinterW.
func List() ([]Info, error) {
	defaultName := defaultPrinterName()

	var needed, returned uint32
	flags := uintptr(printerEnumLocal | printerEnumConnections)

	// Primeira chamada: buffer nulo, só pra descobrir o tamanho necessário.
	procEnumPrintersW.Call(flags, 0, 4, 0, 0, uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)))
	if needed == 0 {
		return []Info{}, nil
	}

	buf := make([]byte, needed)
	ret, _, err := procEnumPrintersW.Call(
		flags, 0, 4,
		uintptr(unsafe.Pointer(&buf[0])), uintptr(needed),
		uintptr(unsafe.Pointer(&needed)), uintptr(unsafe.Pointer(&returned)),
	)
	if ret == 0 {
		return nil, fmt.Errorf("EnumPrintersW: %w", err)
	}

	result := make([]Info, 0, returned)
	entries := unsafe.Slice((*printerInfo4)(unsafe.Pointer(&buf[0])), returned)
	for _, e := range entries {
		name := utf16PtrToString(e.pPrinterName)
		if name == "" {
			continue
		}
		result = append(result, Info{Name: name, IsDefault: name == defaultName})
	}
	return result, nil
}

func defaultPrinterName() string {
	var size uint32 = 260
	buf := make([]uint16, size)
	ret, _, _ := procGetDefaultPrinterW.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if ret == 0 {
		return ""
	}
	return windows.UTF16ToString(buf)
}

func utf16PtrToString(p *uint16) string {
	if p == nil {
		return ""
	}
	return windows.UTF16PtrToString(p)
}

// PrintRaw abre a impressora indicada, envia os bytes crus com datatype RAW
// (a impressora térmica interpreta ESC/POS nativamente, sem que o Windows
// precise renderizar nada) e fecha o job. Repete `copies` vezes — a
// impressora térmica corta entre cada cópia porque cada `Render` já termina
// em `cut`.
//
// Respeita o timeout do context: se o spooler não responder a tempo (ex.:
// impressora offline), aborta e devolve ErrTimeout em vez de travar o
// worker indefinidamente.
func PrintRaw(ctx context.Context, printerName string, data []byte, copies int) error {
	if copies < 1 {
		copies = 1
	}

	done := make(chan error, 1)
	go func() {
		for i := 0; i < copies; i++ {
			if err := printOnce(printerName, data); err != nil {
				done <- err
				return
			}
		}
		done <- nil
	}()

	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		return ErrTimeout
	}
}

func printOnce(printerName string, data []byte) error {
	namePtr, err := syscall.UTF16PtrFromString(printerName)
	if err != nil {
		return err
	}

	var handle syscall.Handle
	ret, _, callErr := procOpenPrinterW.Call(uintptr(unsafe.Pointer(namePtr)), uintptr(unsafe.Pointer(&handle)), 0)
	if ret == 0 {
		return fmt.Errorf("%w: %s (%v)", ErrNotFound, printerName, callErr)
	}
	defer procClosePrinter.Call(uintptr(handle))

	docName, _ := syscall.UTF16PtrFromString("Comanda Sigma")
	dataType, _ := syscall.UTF16PtrFromString("RAW")
	info := docInfo1{pDocName: docName, pDatatype: dataType}

	ret, _, callErr = procStartDocPrinterW.Call(uintptr(handle), 1, uintptr(unsafe.Pointer(&info)))
	if ret == 0 {
		return fmt.Errorf("StartDocPrinterW: %v", callErr)
	}
	defer procEndDocPrinter.Call(uintptr(handle))

	ret, _, callErr = procStartPagePrinter.Call(uintptr(handle))
	if ret == 0 {
		return fmt.Errorf("StartPagePrinter: %v", callErr)
	}
	defer procEndPagePrinter.Call(uintptr(handle))

	if len(data) == 0 {
		return nil
	}
	var written uint32
	ret, _, callErr = procWritePrinter.Call(
		uintptr(handle),
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)),
		uintptr(unsafe.Pointer(&written)),
	)
	if ret == 0 {
		return fmt.Errorf("WritePrinter: %v", callErr)
	}
	if int(written) != len(data) {
		return fmt.Errorf("WritePrinter escreveu %d de %d bytes", written, len(data))
	}
	return nil
}

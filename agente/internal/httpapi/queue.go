package httpapi

import (
	"context"
	"errors"
	"fmt"
	"sync/atomic"
	"time"

	"pdv-sigma/agente/internal/printer"
)

// printTimeout é o timeout de segurança pra não travar se a impressora
// estiver offline (spec.json: timeout_segundos: 60).
const printTimeout = 60 * time.Second

// queueCapacity é o tamanho do buffer do channel. Uma cozinha nunca deveria
// acumular mais que isso entre impressões; se acumular, algo já está errado
// (impressora offline) e é melhor devolver 503 rápido do que enfileirar
// infinitamente.
const queueCapacity = 64

var errQueueFull = errors.New("fila de impressão cheia")

type printJob struct {
	id          string
	printerName string
	data        []byte
	copies      int
	result      chan error
}

// Queue serializa impressões numa goroutine worker única, consumindo de um
// channel — o próprio modelo de concorrência do Go resolve a fila sem
// precisar reimplementar lógica de fila manualmente (ARQUITETURA.md §3.3).
type Queue struct {
	jobs    chan printJob
	counter atomic.Uint64
}

// NewQueue cria a fila e sobe a goroutine worker.
func NewQueue() *Queue {
	q := &Queue{jobs: make(chan printJob, queueCapacity)}
	go q.worker()
	return q
}

func (q *Queue) worker() {
	for job := range q.jobs {
		ctx, cancel := context.WithTimeout(context.Background(), printTimeout)
		err := printer.PrintRaw(ctx, job.printerName, job.data, job.copies)
		cancel()
		job.result <- err
	}
}

// Submit enfileira um job e bloqueia até ele ser impresso (ou falhar). É
// síncrono do ponto de vista do chamador HTTP — o board de Pedidos precisa
// saber na hora se a impressão deu certo — mas continua estritamente
// sequencial por trás porque só existe uma goroutine worker.
func (q *Queue) Submit(printerName string, data []byte, copies int) (string, error) {
	id := fmt.Sprintf("job-%d", q.counter.Add(1))
	job := printJob{id: id, printerName: printerName, data: data, copies: copies, result: make(chan error, 1)}

	select {
	case q.jobs <- job:
	default:
		return "", errQueueFull
	}

	return id, <-job.result
}

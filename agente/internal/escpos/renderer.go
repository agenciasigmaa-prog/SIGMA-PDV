// Package escpos traduz o DSL declarativo vindo do navegador (o mesmo DSL
// que restaurante/src/lib/escposDoc.ts monta) em bytes ESC/POS.
//
// Este é o único lugar do sistema que sabe de code page, sequência de corte
// e largura de papel. Foi deliberado concentrar aqui: as tentativas
// anteriores espalharam formatação entre navegador e agente, e cada ajuste
// virava dois deploys.
//
// Porta 1:1 de printbridge/src/PrintBridge.Agent/Printing/EscPosRenderer.cs
// (removido junto com o resto do PrintBridge) — preservar o comportamento
// byte a byte ao alterar este arquivo.
package escpos

import (
	"strings"

	"golang.org/x/text/encoding/charmap"
)

const (
	esc byte = 0x1B
	gs  byte = 0x1D
)

// Command é um comando do DSL. Só um subconjunto dos campos se aplica a cada
// Op — mesma forma do EscPosCommand em TypeScript.
type Command struct {
	Op    string `json:"op"`
	Value string `json:"value,omitempty"`
	Bold  bool   `json:"bold,omitempty"`
	Align string `json:"align,omitempty"` // "left" | "center" | "right"
	Size  string `json:"size,omitempty"`  // "normal" | "double"
	Left  string `json:"left,omitempty"`
	Right string `json:"right,omitempty"`
	Lines int    `json:"lines,omitempty"`
}

// ColumnsFor retorna as colunas disponíveis em fonte A. 58 mm e 80 mm
// quebram bem diferente.
func ColumnsFor(paperWidth int) int {
	if paperWidth == 58 {
		return 32
	}
	return 48
}

// cp860Encoder converte texto para CP860 (português). Bytes sem
// representação na tabela viram '?' — degrada, não falha a impressão.
var cp860Encoder = charmap.CodePage860.NewEncoder()

// Render converte a sequência de comandos em bytes ESC/POS prontos para o
// spooler (datatype RAW).
func Render(commands []Command, paperWidth int) []byte {
	columns := ColumnsFor(paperWidth)
	var buf []byte

	// ESC @ — reset. Garante estado conhecido mesmo se o job anterior tiver
	// morrido no meio e deixado a impressora em negrito/duplo.
	buf = append(buf, esc, '@')

	// ESC t 3 — seleciona CP860 na impressora. Sem isso, mandar bytes CP860
	// não adianta: ela interpreta na tabela dela e imprime outra coisa.
	buf = append(buf, esc, 't', 3)

	for _, cmd := range commands {
		switch cmd.Op {
		case "text":
			buf = renderText(buf, cmd, columns)
		case "columns":
			buf = renderColumns(buf, cmd, columns)
		case "line":
			buf = setStyle(buf, false, false)
			buf = setAlign(buf, "left")
			buf = writeText(buf, strings.Repeat("-", columns))
		case "feed":
			n := cmd.Lines
			if n < 1 {
				n = 1
			}
			if n > 10 {
				n = 10
			}
			for i := 0; i < n; i++ {
				buf = append(buf, '\n')
			}
		case "cut":
			// Avanço antes do corte: sem isso a lâmina corta em cima da
			// última linha, porque ela ainda não passou do cabeçote.
			buf = append(buf, '\n', '\n')
			// GS V 66 0 — corte parcial, deixa um filete de papel preso.
			// Corte total costuma fazer a comanda cair no chão.
			buf = append(buf, gs, 'V', 66, 0)
		default:
			// Comando desconhecido é ignorado, e não tratado como erro: um
			// front mais novo mandando uma op que este agente ainda não
			// conhece deve degradar, não deixar de imprimir o pedido.
		}
	}

	return buf
}

func renderText(buf []byte, cmd Command, columns int) []byte {
	doubleSize := cmd.Size == "double"
	buf = setStyle(buf, cmd.Bold, doubleSize)
	buf = setAlign(buf, cmd.Align)

	// Em corpo duplo cabe metade das colunas.
	width := columns
	if doubleSize {
		width = columns / 2
	}
	for _, line := range wrapText(cmd.Value, width) {
		buf = writeText(buf, line)
	}

	buf = setStyle(buf, false, false)
	buf = setAlign(buf, "left")
	return buf
}

// renderColumns imprime duas colunas na mesma linha (ex.: "2x Coxinha" ...
// "12,00"). O preço à direita é o que não pode ser perdido, então quem é
// truncado é sempre o texto da esquerda.
func renderColumns(buf []byte, cmd Command, columns int) []byte {
	buf = setStyle(buf, false, false)
	buf = setAlign(buf, "left")

	right := []rune(cmd.Right)
	left := []rune(cmd.Left)
	available := columns - len(right) - 1

	if available < 1 {
		// Direita sozinha já estoura a linha: imprime uma embaixo da outra.
		buf = writeText(buf, cmd.Left)
		buf = writeText(buf, cmd.Right)
		return buf
	}

	if len(left) > available {
		left = left[:available]
	}
	padded := string(left)
	padWidth := columns - len(right)
	if len(padded) < padWidth {
		padded += strings.Repeat(" ", padWidth-len(padded))
	}
	buf = writeText(buf, padded+string(right))
	return buf
}

// wrapText quebra por palavra. A impressora quebraria sozinha no limite
// físico, mas cortando no meio da palavra — ruim de ler numa cozinha
// corrida.
func wrapText(text string, width int) []string {
	if text == "" {
		return []string{""}
	}
	runes := []rune(text)
	if len(runes) <= width {
		return []string{text}
	}

	var lines []string
	var current strings.Builder

	// Preserva a indentação dos sub-itens ("   + 2x Queijo") nas linhas de
	// continuação, senão a quebra bagunça a hierarquia visual.
	trimmed := strings.TrimLeft(text, " ")
	indent := strings.Repeat(" ", len(runes)-len([]rune(trimmed)))

	for _, word := range strings.Split(text, " ") {
		var candidate string
		if current.Len() == 0 {
			candidate = word
		} else {
			candidate = current.String() + " " + word
		}
		if len([]rune(candidate)) <= width {
			current.Reset()
			current.WriteString(candidate)
			continue
		}

		if current.Len() > 0 {
			lines = append(lines, current.String())
			current.Reset()
		}

		// Palavra única maior que a linha (URL, nome gigante): parte no
		// limite mesmo, não há alternativa.
		remaining := []rune(word)
		for len(indent)+len(remaining) > width {
			take := width - len(indent)
			if take <= 0 {
				break
			}
			lines = append(lines, indent+string(remaining[:take]))
			remaining = remaining[take:]
		}
		current.WriteString(indent)
		current.WriteString(string(remaining))
	}

	if current.Len() > 0 {
		lines = append(lines, current.String())
	}
	return lines
}

func setStyle(buf []byte, bold, doubleSize bool) []byte {
	// ESC E n — negrito
	var boldByte byte
	if bold {
		boldByte = 1
	}
	buf = append(buf, esc, 'E', boldByte)
	// GS ! n — corpo. 0x11 = dobro de largura e altura.
	var sizeByte byte
	if doubleSize {
		sizeByte = 0x11
	}
	buf = append(buf, gs, '!', sizeByte)
	return buf
}

func setAlign(buf []byte, align string) []byte {
	var value byte
	switch align {
	case "center":
		value = 1
	case "right":
		value = 2
	default:
		value = 0
	}
	// ESC a n
	buf = append(buf, esc, 'a', value)
	return buf
}

func writeText(buf []byte, text string) []byte {
	// Normaliza NBSP (usado por Number.toLocaleString em "R$ 1,00") para
	// espaço comum: em CP860 o NBSP mapeia pra 0xFF, que sai como lixo em
	// impressoras que não tratam esse byte como espaço.
	text = strings.ReplaceAll(text, " ", " ")
	encoded, err := cp860Encoder.String(text)
	if err != nil {
		// Não deveria acontecer (o encoder do charmap substitui por '?'
		// em vez de falhar), mas nunca deixa de imprimir por causa de um
		// caractere estranho.
		encoded = text
	}
	buf = append(buf, []byte(encoded)...)
	buf = append(buf, '\n')
	return buf
}

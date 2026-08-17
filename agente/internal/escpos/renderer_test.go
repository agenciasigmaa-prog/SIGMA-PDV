package escpos

import (
	"bytes"
	"testing"
)

func TestColumnsFor(t *testing.T) {
	if got := ColumnsFor(58); got != 32 {
		t.Errorf("ColumnsFor(58) = %d, want 32", got)
	}
	if got := ColumnsFor(80); got != 48 {
		t.Errorf("ColumnsFor(80) = %d, want 48", got)
	}
	if got := ColumnsFor(0); got != 48 {
		t.Errorf("ColumnsFor(0) = %d, want 48 (default)", got)
	}
}

func TestRenderResetAndCodePage(t *testing.T) {
	out := Render([]Command{{Op: "text", Value: "oi"}}, 80)
	if !bytes.HasPrefix(out, []byte{esc, '@', esc, 't', 3}) {
		t.Fatalf("output does not start with ESC @ + ESC t 3: % x", out[:10])
	}
}

func TestRenderAccentuationCP860(t *testing.T) {
	// "ção" em CP860: ç=0x87, ã=0x84, o=o. Confere que o encoder está
	// mesmo convertendo pra CP860 e não deixando UTF-8 passar direto.
	out := Render([]Command{{Op: "text", Value: "ção pão açaí Coração"}}, 80)
	if bytes.Contains(out, []byte("ção")) {
		t.Fatalf("saída contém UTF-8 cru em vez de CP860: % x", out)
	}
	// 0x87 = ç em CP860
	if !bytes.Contains(out, []byte{0x87}) {
		t.Fatalf("esperava byte 0x87 (ç em CP860) na saída: % x", out)
	}
}

func TestRenderCutSequence(t *testing.T) {
	out := Render([]Command{{Op: "cut"}}, 80)
	want := []byte{esc, '@', esc, 't', 3, '\n', '\n', gs, 'V', 66, 0}
	if !bytes.Equal(out, want) {
		t.Errorf("cut sequence = % x, want % x", out, want)
	}
}

func TestRenderFeedClamps(t *testing.T) {
	out := Render([]Command{{Op: "feed", Lines: 99}}, 80)
	body := out[5:] // depois de ESC @ + ESC t 3
	if len(body) != 10 {
		t.Errorf("feed com Lines=99 devia ser clampado pra 10, saiu %d bytes", len(body))
	}
	out = Render([]Command{{Op: "feed", Lines: 0}}, 80)
	body = out[5:]
	if len(body) != 1 {
		t.Errorf("feed com Lines=0 devia virar 1 linha, saiu %d bytes", len(body))
	}
}

func TestRenderUnknownOpIgnored(t *testing.T) {
	out := Render([]Command{{Op: "blink", Value: "x"}}, 80)
	want := []byte{esc, '@', esc, 't', 3}
	if !bytes.Equal(out, want) {
		t.Errorf("op desconhecida devia ser ignorada, saiu % x", out)
	}
}

func TestWrapTextPreservesIndent(t *testing.T) {
	lines := wrapText("   + 2x Queijo cheddar extra grande especial", 20)
	if len(lines) < 2 {
		t.Fatalf("esperava quebra em múltiplas linhas, saiu %v", lines)
	}
	for i, line := range lines[1:] {
		if len(line) > 0 && line[0] != ' ' {
			t.Errorf("linha de continuação %d perdeu a indentação: %q", i+1, line)
		}
	}
}

func TestWrapTextShortFitsOneLine(t *testing.T) {
	lines := wrapText("2x Coxinha", 48)
	if len(lines) != 1 || lines[0] != "2x Coxinha" {
		t.Errorf("texto curto não devia quebrar: %v", lines)
	}
}

func TestRenderColumnsTruncatesLeftNotRight(t *testing.T) {
	out := Render([]Command{{Op: "columns", Left: "Um produto com nome muito comprido demais", Right: "R$ 12,00"}}, 58)
	// 32 colunas - len("R$ 12,00")=8 - 1 = 23 disponíveis pra esquerda.
	if !bytes.Contains(out, []byte("R$ 12,00")) {
		t.Errorf("preço à direita não pode ser cortado: % x", out)
	}
}

func TestRenderColumnsRightTooLongSplitsLines(t *testing.T) {
	// right sozinho (32 chars) já estoura 32 colunas -> imprime em duas linhas.
	longRight := "0123456789012345678901234567890123456789"
	out := Render([]Command{{Op: "columns", Left: "x", Right: longRight}}, 58)
	if !bytes.Contains(out, []byte(longRight)) {
		t.Errorf("right longo devia sair inteiro em linha própria: % x", out)
	}
}

func TestRenderStyleBytes(t *testing.T) {
	out := Render([]Command{{Op: "text", Value: "x", Bold: true, Size: "double", Align: "center"}}, 80)
	// depois do preâmbulo (5 bytes): ESC E 1, GS ! 0x11, ESC a 1
	body := out[5:]
	want := []byte{esc, 'E', 1, gs, '!', 0x11, esc, 'a', 1}
	if !bytes.HasPrefix(body, want) {
		t.Errorf("bytes de estilo = % x, want prefix % x", body, want)
	}
}

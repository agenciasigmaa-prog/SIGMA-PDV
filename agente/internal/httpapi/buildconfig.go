package httpapi

// Version é a versão do agente, exibida em /health e na tela /impressora do
// PDV pra diagnóstico. Atualizar a cada release.
const Version = "1.0.0"

// Port é a porta padrão do servidor HTTP local — mesma do spec.json
// (`agente.porta_padrao`).
const Port = 18080

// defaultAllowedOrigins é a allowlist embutida no binário. Cobre só o app
// restaurante em dev (porta 5175 do Vite) — o repo ainda não tem um domínio
// de produção configurado (sem vercel.json/netlify.toml). Quando o app for
// publicado, adicione o domínio real em `extraOrigins` no config.json de
// cada estação; não é editável pela API — se fosse, qualquer site poderia
// se autoautorizar e o controle perderia sentido.
var defaultAllowedOrigins = []string{
	"http://localhost:5175",
	"http://127.0.0.1:5175",
}

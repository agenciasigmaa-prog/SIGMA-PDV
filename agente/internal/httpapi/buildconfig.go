package httpapi

// Version é a versão do agente, exibida em /health e na tela /impressora do
// PDV pra diagnóstico, e comparada pelo pacote autoupdate contra o
// manifesto publicado (restaurante/public/downloads/latest.json) pra saber
// se há uma versão mais nova. Atualizar a cada release — e lembrar de
// também atualizar o manifesto (ver README, "Publicar uma versão nova"),
// senão o autoupdate nunca detecta o build novo.
const Version = "1.2.0"

// Port é a porta padrão do servidor HTTP local — mesma do spec.json
// (`agente.porta_padrao`).
const Port = 18080

// defaultAllowedOrigins é a allowlist embutida no binário: dev (porta 5175
// do Vite) + os domínios reais de produção do app restaurante (confirmados
// em Vercel → sigma-pdv-restaurante → Domains). Até essa versão só tinha os
// dois de dev — todo cliente que instalou builds anteriores ficava com
// print silenciosamente bloqueado (403) em produção, porque o domínio real
// só existia em `extraOrigins`, que precisa ser editado à mão no config.json
// de cada estação (não é editável pela API — se fosse, qualquer site
// poderia se autoautorizar). Builds novas cobrem o caso comum sem precisar
// dessa edição manual; extraOrigins continua existindo pra domínio extra
// específico de uma estação.
var defaultAllowedOrigins = []string{
	"http://localhost:5175",
	"http://127.0.0.1:5175",
	"https://app.assessoriasigma.com.br",
	"https://sigma-pdv-restaurante.vercel.app",
}

// SelfCheckOrigin é o Origin que o próprio agente usa quando precisa
// chamar a si mesmo (hoje só o autoupdate, confirmando que uma versão nova
// subiu antes de descartar a antiga de vez) — precisa ser uma origem já
// presente em defaultAllowedOrigins, senão o agente se bloquearia sozinho.
// Qual delas não importa, é só uma checagem local; usa a primeira.
var SelfCheckOrigin = defaultAllowedOrigins[0]

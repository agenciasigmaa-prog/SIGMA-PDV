package httpapi

// Version é a versão do agente, exibida em /health e na tela /impressora do
// PDV pra diagnóstico. Atualizar a cada release.
const Version = "1.1.0"

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

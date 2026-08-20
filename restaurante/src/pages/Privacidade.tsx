import sigmaLogo from "../assets/sigma-logo.png";

export function Privacidade() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-foreground">
      <img src={sigmaLogo} alt="" className="mb-4 h-10 w-10" />
      <h1 className="mb-1 text-2xl font-bold">Política de Privacidade</h1>
      <p className="mb-8 text-muted-foreground">Cardápio SIG — última atualização: agosto de 2026.</p>

      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-base font-bold">1. Quem somos</h2>
          <p>
            O Cardápio SIG é uma plataforma de pedidos online que conecta restaurantes parceiros aos seus clientes,
            operada pela Agência Sigma. Esta política explica quais dados coletamos, para que usamos e como você
            pode exercer seus direitos sobre eles.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">2. Dados que coletamos</h2>
          <p>Dependendo de como você usa a plataforma, podemos coletar:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Nome, e-mail e telefone, informados no cadastro ou recebidos do Google ao entrar com sua conta.</li>
            <li>Endereços de entrega salvos por você.</li>
            <li>Histórico de pedidos feitos nos restaurantes parceiros.</li>
            <li>Dados do restaurante (nome, CNPJ, contato) quando você é dono ou funcionário de um estabelecimento
              parceiro.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">3. Como usamos seus dados</h2>
          <p>
            Usamos seus dados para processar pedidos, identificar você nos restaurantes onde já pediu antes,
            manter sua conta segura e dar suporte quando você precisa de ajuda. Não vendemos seus dados a
            terceiros.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">4. Login com Google</h2>
          <p>
            Se você entra com sua conta Google, recebemos apenas seu nome, e-mail e foto de perfil — o suficiente
            para criar ou identificar sua conta na plataforma. Não temos acesso à sua senha do Google nem a
            qualquer outro dado da sua conta Google.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">5. Armazenamento e segurança</h2>
          <p>
            Seus dados ficam armazenados de forma segura na infraestrutura do Supabase, com controle de acesso
            restrito a quem realmente precisa deles (você, o restaurante onde você pediu, e a equipe da Agência
            Sigma quando necessário para suporte).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">6. Seus direitos</h2>
          <p>
            Você pode editar seus dados de perfil e endereços a qualquer momento dentro do app. Para excluir sua
            conta ou tirar qualquer outra dúvida sobre seus dados (conforme a LGPD — Lei Geral de Proteção de
            Dados), entre em contato pelo e-mail abaixo.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">7. Contato</h2>
          <p>
            Dúvidas sobre esta política podem ser enviadas para{" "}
            <a href="mailto:agenciasigmaa@gmail.com" className="text-primary underline">
              agenciasigmaa@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

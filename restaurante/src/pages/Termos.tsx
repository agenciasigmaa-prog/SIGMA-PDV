import sigmaLogo from "../assets/sigma-logo.png";

export function Termos() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed text-foreground">
      <img src={sigmaLogo} alt="" className="mb-4 h-10 w-10" />
      <h1 className="mb-1 text-2xl font-bold">Termos de Uso</h1>
      <p className="mb-8 text-muted-foreground">Cardápio SIG — última atualização: agosto de 2026.</p>

      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-base font-bold">1. Sobre a plataforma</h2>
          <p>
            O Cardápio SIG é uma plataforma que permite a restaurantes parceiros publicarem seus cardápios online e
            receberem pedidos para consumo no local, retirada ou entrega. Ao usar a plataforma, você concorda com
            estes termos.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">2. Sua conta</h2>
          <p>
            Você é responsável por manter suas credenciais de acesso em segurança e pelas informações que
            fornece no cadastro. Contas podem ser criadas por e-mail/senha ou entrando com uma conta Google.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">3. Pedidos</h2>
          <p>
            Cada pedido feito na plataforma é um contrato entre você e o restaurante escolhido — o Cardápio SIG
            atua como intermediário tecnológico, não como vendedor dos produtos. Preços, disponibilidade,
            preparo e entrega são de responsabilidade do restaurante parceiro.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">4. Uso adequado</h2>
          <p>
            Não é permitido usar a plataforma para fins ilegais, tentar acessar contas de terceiros, ou interferir
            no funcionamento normal do serviço.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">5. Alterações</h2>
          <p>
            Podemos atualizar estes termos e a Política de Privacidade periodicamente. Mudanças relevantes serão
            comunicadas dentro da própria plataforma.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-base font-bold">6. Contato</h2>
          <p>
            Dúvidas sobre estes termos podem ser enviadas para{" "}
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

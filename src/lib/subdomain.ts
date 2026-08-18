// Resolve o slug do restaurante a partir do hostname, pra loja acessível por
// subdomínio (<slug>.dominio.com) além de /loja/:restaurantId. Enquanto o
// domínio de produção não existe (VITE_APEX_DOMAIN em branco), suporta só
// *.localhost em dev — todo browser já resolve isso pra 127.0.0.1 sem mexer
// em /etc/hosts.
export function resolveSlugFromHostname(hostname: string, apexDomain?: string): string | null {
  if (apexDomain) {
    if (hostname === apexDomain || hostname === `www.${apexDomain}`) return null;
    const suffix = `.${apexDomain}`;
    if (hostname.endsWith(suffix)) {
      const prefix = hostname.slice(0, -suffix.length);
      return prefix && !prefix.includes(".") ? prefix : null;
    }
    return null;
  }

  if (hostname.endsWith(".localhost")) {
    const prefix = hostname.slice(0, -".localhost".length);
    return prefix || null;
  }

  return null;
}

import dns from 'node:dns';

/**
 * Fix DNS do container Coolify.
 *
 * Containers Docker do Coolify usam a rede `coolify` que não tem DNS
 * configurado. Por isso `fetch('https://api.mercadolivre.com/...')` falha
 * com `getaddrinfo ENOTFOUND`.
 *
 * Solução: `dns.setServers()` força o resolver DNS do Node.js (usado
 * por fetch, https, http nativos) a usar DNS público (Google + Cloudflare)
 * em vez do DNS default do container.
 *
 * IMPORTS: deve ser o PRIMEIRO import no server (antes de qualquer fetch).
 *
 * NOTA 2026: `undici` é built-in no Node 18+, mas webpack do Next.js
 * não consegue resolver built-ins via `import` direto. Por isso usamos
 * só `node:dns` (built-in supportado).
 */

// Força DNS público (Google + Cloudflare)
dns.setServers([
  '8.8.8.8',
  '8.8.4.4',
  '1.1.1.1',
  '1.0.0.1',
]);

export default dns;
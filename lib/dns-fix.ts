import dns from 'node:dns';

/**
 * Fix DNS do container Coolify.
 *
 * Containers Docker do Coolify usam a rede `coolify` que não tem DNS
 * configurado. Por isso `fetch('https://api.mercadolivre.com/...')` falha
 * com `getaddrinfo ENOTFOUND`.
 *
 * Esse módulo sobrescreve o resolver DNS do Node.js para usar Google DNS
 * (8.8.8.8) e Cloudflare (1.1.1.1) em vez do DNS padrão do container.
 *
 * IMPORTS: deve ser o PRIMEIRO import no server (antes de qualquer fetch).
 */

// Força DNS público (Google + Cloudflare)
dns.setServers([
  '8.8.8.8',
  '8.8.4.4',
  '1.1.1.1',
  '1.0.0.1',
]);

export default dns;
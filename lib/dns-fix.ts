import dns from 'node:dns';
import { setGlobalDispatcher, Agent } from 'undici';

/**
 * Fix DNS do container Coolify.
 *
 * Containers Docker do Coolify usam a rede `coolify` que não tem DNS
 * configurado. Por isso `fetch('https://api.mercadolivre.com/...')` falha
 * com `getaddrinfo ENOTFOUND`.
 *
 * Esse módulo:
 * 1. Sobrescreve o resolver DNS do Node.js (dns.setServers) — funciona pra
 *    módulos que usam dns.lookup()
 * 2. Substitui o global dispatcher do undici (que é o que fetch() usa)
 *    com um Agent que tem DNS customizado — funciona pra TODOS os fetch()
 *
 * IMPORTS: deve ser o PRIMEIRO import no server (antes de qualquer fetch).
 */

// 1. DNS via dns.setServers (pra dns.lookup direto)
dns.setServers([
  '8.8.8.8',
  '8.8.4.4',
  '1.1.1.1',
  '1.0.0.1',
]);

// 2. Substitui global dispatcher do undici (que fetch usa)
setGlobalDispatcher(
  new Agent({
    connect: {
      // Tenta DNS customizado em vez do default do container
      lookup: (hostname, options, callback) => {
        // Usa dns.lookup com os servers customizados
        dns.lookup(hostname, options, callback);
      },
    },
  }),
);

export default dns;
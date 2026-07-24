import dns from 'node:dns';
import { setGlobalDispatcher, Agent } from 'undici';
import https from 'node:https';

/**
 * Fix DNS do container Coolify.
 *
 * Containers Docker do Coolify usam a rede `coolify` que não tem DNS
 * configurado. Por isso `fetch('https://api.mercadolivre.com/...')` falha
 * com `getaddrinfo ENOTFOUND`.
 *
 * Estratégia TRIPLA (validada em 2026-07-24, commit c39bc4f + restore):
 * 1. dns.setServers() — força DNS público em dns.lookup (Node nativo)
 * 2. setGlobalDispatcher undici — força DNS em fetch() (Next 14 usa undici)
 * 3. https.globalAgent com lookup customizado — força DNS em módulos legados
 *
 * IMPORTS: deve ser o PRIMEIRO import no server (antes de qualquer fetch).
 *
 * HISTÓRICO: este fix já foi tentado 4 vezes. A versão atual (tripla) foi
 * a que funcionou antes de uma reversão por "webpack não resolver built-ins".
 * Agora `undici` é dep explícita do projeto (commit atual), então webpack
 * resolve via `node_modules/undici`.
 */

// 1. DNS via dns.setServers (Node nativo)
dns.setServers([
  '8.8.8.8',
  '8.8.4.4',
  '1.1.1.1',
  '1.0.0.1',
]);

// 2. setGlobalDispatcher (undici, usado pelo fetch nativo do Node 18+)
setGlobalDispatcher(
  new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, options, callback);
      },
    },
  }),
);

// 3. https.globalAgent (módulos que usam require('https'))
https.globalAgent = new https.Agent({
  keepAlive: true,
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, options, callback);
  },
});

export default dns;
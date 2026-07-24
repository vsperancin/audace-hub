/**
 * Security headers aplicados em todas as responses.
 *
 * CSP permissivo o suficiente pra dev local (precisa inline scripts do Next).
 * Em prod, revisar — Vercel docs têm um template.
 *
 * NOTA: o 'unsafe-inline' em script-src é exigido pelo Next 14 dev mode
 * (HMR injeta scripts inline). Em prod build, dá pra remover.
 */
export function applySecurityHeaders(response: Response): Response {
  // Clonar para preservar headers existentes
  const headers = new Headers(response.headers);

  // HSTS — 1 ano, include subdomains. Cloudflare já adiciona,
  // mas belt-and-suspenders. NÃO aplicar se não for HTTPS.
  // (response.url em middleware do Next nem sempre tem scheme correto —
  //  assumimos que se bateu até aqui, é via Cloudflare que sempre é HTTPS.)
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Anti-clickjacking
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Content-Security-Policy', "frame-ancestors 'none'");

  // Anti-MIME sniffing
  headers.set('X-Content-Type-Options', 'nosniff');

  // Anti-referrer leak
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissões: desabilita features que não usamos
  headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );

  // Cross-origin isolation
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
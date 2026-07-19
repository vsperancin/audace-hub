// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configuração do Next.js 14 (App Router).
 *
 * Decisões:
 * - `experimental.serverActions` desabilitado pois estamos usando Route Handlers
 *   explícitos em /app/api/oauth/ml/* para ter controle total do response.
 * - `images.remotePatterns` preparado para os domínios de mídia do Mercado Livre
 *   (usado nas próximas features de catálogo).
 * - `output: 'standalone'` gera um bundle otimizado pro Docker (Coolify).
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // Aliases espelhados do tsconfig (Next.js precisa explicitamente em alguns
  // cenários de build pra resolver paths durante a compilação).
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    };
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'http2.mlstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'mlstatic-a.akamaihd.net',
      },
    ],
  },
  async headers() {
    // Headers de segurança — defesa em profundidade, independente do Coolify/Cloudflare.
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
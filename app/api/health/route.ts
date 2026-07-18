import { NextResponse } from 'next/server';

/**
 * GET /api/health
 *
 * Endpoint de healthcheck usado pelo Docker healthcheck e pelo Coolify.
 * Retorna 200 + info mínima. NÃO toca DB para evitar falso negativo.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'audace-hub',
    timestamp: new Date().toISOString(),
  });
}
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { runReceiptOcr } from '@/lib/receiptOcr';
import { requireCuentas, badRequest, serverError } from '../_guard';

/**
 * Lectura de recibos con IA desde la interfaz web.
 *
 * Devuelve transacciones propuestas; no escribe nada. La captura la confirma
 * una persona: un recibo mal leído que entra solo en la contabilidad es peor
 * que no tener OCR.
 */
/**
 * GET ?models=1 — pregunta a Google qué modelos admite la clave de esta
 * congregación. Es la forma de elegir modelo con evidencia en lugar de a
 * tientas: un 429 puede significar que el modelo no tiene cuota gratuita en el
 * proyecto, y esta lista lo aclara sin gastar peticiones de generación.
 */
export async function GET() {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  const cfg = getDb().prepare(
    `SELECT ai_api_key FROM cuentas_config WHERE congregation_id = ?`
  ).get(g.congreId) as { ai_api_key: string | null } | undefined;

  const key = cfg?.ai_api_key || process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Sin clave configurada' }, { status: 501 });

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const d = await r.json();
    if (!r.ok) return NextResponse.json({ status: r.status, error: d?.error?.message ?? d }, { status: 502 });

    const models = (d.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string; displayName?: string }) => m.name.replace('models/', ''));

    return NextResponse.json({ total: models.length, models });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const { dataUrl } = await request.json();
    if (!dataUrl || typeof dataUrl !== 'string') return badRequest('Falta la imagen');

    const codes = getDb().prepare(
      `SELECT code, description, kind FROM cuentas_codes WHERE congregation_id = ? ORDER BY sort_order`
    ).all(g.congreId) as { code: string; description: string; kind: string }[];

    const cfg = getDb().prepare(
      `SELECT ai_api_key FROM cuentas_config WHERE congregation_id = ?`
    ).get(g.congreId) as { ai_api_key: string | null } | undefined;

    if (!cfg?.ai_api_key && !process.env.GEMINI_API_KEY) {
      return NextResponse.json({
        error: 'Falta la clave de IA. Añádela en Configuración → Lectura de recibos.',
        needsKey: true,
      }, { status: 501 });
    }

    const out = await runReceiptOcr(dataUrl, codes, cfg?.ai_api_key);
    if ('error' in out) return NextResponse.json(out, { status: 502 });
    return NextResponse.json(out);
  } catch (e) { return serverError(e); }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { DEFAULT_CIERRE } from '@/lib/cuentas';
import { requireCuentas, badRequest, serverError } from '../_guard';

/**
 * Encabezado de los formularios S-26 / S-30 / S-25c y parámetros del cierre de mes.
 * El encabezado cae por defecto a `congregations` (name/city); `state` y los
 * parámetros de cierre solo viven aquí.
 */
export async function GET() {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const db = getDb();

    const congre = db.prepare(
      `SELECT name, city FROM congregations WHERE id = ?`
    ).get(g.congreId) as { name: string; city: string | null } | undefined;

    const cfg = db.prepare(
      `SELECT label, city, state, remit_code, res_pub_code, res_pub_amount,
              res_pct_code, res_pct_percent, res_pct_source, ai_api_key
       FROM cuentas_config WHERE congregation_id = ?`
    ).get(g.congreId) as Record<string, unknown> | undefined;

    return NextResponse.json({
      config: {
        label: (cfg?.label as string) || congre?.name || '',
        city:  (cfg?.city as string)  || congre?.city || '',
        state: (cfg?.state as string) || '',
        remit_code:      (cfg?.remit_code as string)      ?? DEFAULT_CIERRE.remit_code,
        res_pub_code:    (cfg?.res_pub_code as string)    ?? DEFAULT_CIERRE.res_pub_code,
        res_pub_amount:  Number(cfg?.res_pub_amount  ?? DEFAULT_CIERRE.res_pub_amount),
        res_pct_code:    (cfg?.res_pct_code as string)    ?? DEFAULT_CIERRE.res_pct_code,
        res_pct_percent: Number(cfg?.res_pct_percent ?? DEFAULT_CIERRE.res_pct_percent),
        res_pct_source:  (cfg?.res_pct_source as string)  ?? DEFAULT_CIERRE.res_pct_source,
        // Clave de IA para el agente de recibos: nunca se devuelve al cliente.
        has_ai_api_key: Boolean(cfg?.ai_api_key),
        has_global_ai_key: Boolean(process.env.GEMINI_API_KEY),
      },
    });
  } catch (e) { return serverError(e); }
}

export async function PUT(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const b = await request.json();

    const pubAmount = Number(b.res_pub_amount ?? 0);
    const pct = Number(b.res_pct_percent ?? 0);
    if (!Number.isFinite(pubAmount) || pubAmount < 0) return badRequest('El monto por publicador debe ser ≥ 0');
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return badRequest('El porcentaje debe estar entre 0 y 100');

    const code = (v: unknown, fallback: string) =>
      v != null && String(v).trim() ? String(v).trim().toUpperCase() : fallback;

    getDb().prepare(`
      INSERT INTO cuentas_config
        (congregation_id, label, city, state, remit_code, res_pub_code, res_pub_amount,
         res_pct_code, res_pct_percent, res_pct_source, ai_api_key, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
      ON CONFLICT(congregation_id) DO UPDATE SET
        label = excluded.label, city = excluded.city, state = excluded.state,
        remit_code = excluded.remit_code, res_pub_code = excluded.res_pub_code,
        res_pub_amount = excluded.res_pub_amount, res_pct_code = excluded.res_pct_code,
        res_pct_percent = excluded.res_pct_percent, res_pct_source = excluded.res_pct_source,
        ai_api_key = COALESCE(excluded.ai_api_key, cuentas_config.ai_api_key),
        updated_at = datetime('now')
    `).run(
      g.congreId,
      b.label != null ? String(b.label).trim() : null,
      b.city  != null ? String(b.city).trim()  : null,
      b.state != null ? String(b.state).trim() : null,
      code(b.remit_code,     DEFAULT_CIERRE.remit_code),
      code(b.res_pub_code,   DEFAULT_CIERRE.res_pub_code),
      pubAmount,
      code(b.res_pct_code,   DEFAULT_CIERRE.res_pct_code),
      pct,
      code(b.res_pct_source, DEFAULT_CIERRE.res_pct_source),
      // Clave de IA: solo se sobreescribe si el PUT trae una no vacía.
      b.ai_api_key != null && String(b.ai_api_key).trim()
        ? String(b.ai_api_key).trim() : null,
    );

    return NextResponse.json({ success: true });
  } catch (e) { return serverError(e); }
}

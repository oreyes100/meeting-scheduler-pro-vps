import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/sqlite';
import { DEFAULT_CIERRE } from '@/lib/cuentas';
import { requireCuentas, badRequest, serverError } from '../_guard';

const ConfigSchema = z.object({
  label:              z.string().optional(),
  city:               z.string().optional(),
  state:              z.string().optional(),
  treasurer_name:     z.string().optional(),
  remit_code:         z.string().optional(),
  res_pub_code:       z.string().optional(),
  res_pub_amount:     z.number().min(0).optional(),
  res_pct_code:       z.string().optional(),
  res_pct_percent:    z.number().min(0).max(100).optional(),
  res_pct_source:     z.string().optional(),
  maintenance_code:   z.string().optional(),
  maintenance_amount: z.number().min(0).optional(),
  ai_api_key:         z.string().optional(),
});

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
      `SELECT label, city, state, treasurer_name, remit_code, res_pub_code, res_pub_amount,
              res_pct_code, res_pct_percent, res_pct_source, maintenance_code, maintenance_amount
       FROM cuentas_config WHERE congregation_id = ?`
    ).get(g.congreId) as Record<string, unknown> | undefined;

    return NextResponse.json({
      config: {
        label: (cfg?.label as string) || congre?.name || '',
        city:  (cfg?.city as string)  || congre?.city || '',
        state: (cfg?.state as string) || '',
        treasurer_name: (cfg?.treasurer_name as string) || '',
        remit_code:         (cfg?.remit_code as string)         ?? DEFAULT_CIERRE.remit_code,
        res_pub_code:       (cfg?.res_pub_code as string)       ?? DEFAULT_CIERRE.res_pub_code,
        res_pub_amount:     Number(cfg?.res_pub_amount          ?? DEFAULT_CIERRE.res_pub_amount),
        res_pct_code:       (cfg?.res_pct_code as string)       ?? DEFAULT_CIERRE.res_pct_code,
        res_pct_percent:    Number(cfg?.res_pct_percent         ?? DEFAULT_CIERRE.res_pct_percent),
        res_pct_source:     (cfg?.res_pct_source as string)     ?? DEFAULT_CIERRE.res_pct_source,
        maintenance_code:   (cfg?.maintenance_code as string)   ?? DEFAULT_CIERRE.maintenance_code,
        maintenance_amount: Number(cfg?.maintenance_amount      ?? DEFAULT_CIERRE.maintenance_amount),
        // Nunca se devuelve la clave: solo si hay una guardada.
        has_ai_key: !!cfg?.ai_api_key,
      },
    });
  } catch (e) { return serverError(e); }
}

export async function PUT(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const parsed = ConfigSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? 'Datos inválidos');
    const b = parsed.data;

    const pubAmount = Number(b.res_pub_amount ?? 0);
    const pct = Number(b.res_pct_percent ?? 0);
    if (!Number.isFinite(pubAmount) || pubAmount < 0) return badRequest('El monto por publicador debe ser ≥ 0');
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return badRequest('El porcentaje debe estar entre 0 y 100');

    const code = (v: unknown, fallback: string) =>
      v != null && String(v).trim() ? String(v).trim().toUpperCase() : fallback;

    const maintAmount = Number(b.maintenance_amount ?? 0);
    if (!Number.isFinite(maintAmount) || maintAmount < 0) return badRequest('El monto de mantenimiento debe ser ≥ 0');

    getDb().prepare(`
      INSERT INTO cuentas_config
        (congregation_id, label, city, state, treasurer_name, remit_code, res_pub_code, res_pub_amount,
         res_pct_code, res_pct_percent, res_pct_source, maintenance_code, maintenance_amount,
         ai_api_key, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
      ON CONFLICT(congregation_id) DO UPDATE SET
        label = excluded.label, city = excluded.city, state = excluded.state,
        treasurer_name = excluded.treasurer_name,
        remit_code = excluded.remit_code, res_pub_code = excluded.res_pub_code,
        res_pub_amount = excluded.res_pub_amount, res_pct_code = excluded.res_pct_code,
        res_pct_percent = excluded.res_pct_percent, res_pct_source = excluded.res_pct_source,
        maintenance_code = excluded.maintenance_code, maintenance_amount = excluded.maintenance_amount,
        -- Cadena vacía = no tocar la clave guardada; '-' = borrarla.
        ai_api_key = CASE WHEN excluded.ai_api_key IS NULL THEN cuentas_config.ai_api_key
                          WHEN excluded.ai_api_key = '-' THEN NULL
                          ELSE excluded.ai_api_key END,
        updated_at = datetime('now')
    `).run(
      g.congreId,
      b.label != null ? String(b.label).trim() : null,
      b.city  != null ? String(b.city).trim()  : null,
      b.state != null ? String(b.state).trim() : null,
      b.treasurer_name != null ? String(b.treasurer_name).trim() : null,
      code(b.remit_code,         DEFAULT_CIERRE.remit_code),
      code(b.res_pub_code,       DEFAULT_CIERRE.res_pub_code),
      pubAmount,
      code(b.res_pct_code,       DEFAULT_CIERRE.res_pct_code),
      pct,
      code(b.res_pct_source,     DEFAULT_CIERRE.res_pct_source),
      code(b.maintenance_code,   DEFAULT_CIERRE.maintenance_code),
      maintAmount,
      b.ai_api_key ? String(b.ai_api_key).trim() : null,
    );

    return NextResponse.json({ success: true });
  } catch (e) { return serverError(e); }
}

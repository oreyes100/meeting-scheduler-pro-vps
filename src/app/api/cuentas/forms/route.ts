import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { buildS30, buildS25c, serviceYearOf, serviceYearMonths, QUARTERS } from '@/lib/cuentas';
import { requireCuentas, badRequest, serverError } from '../_guard';

const YM = /^\d{4}-\d{2}$/;
const SY = /^\d{4}\/\d{4}$/;

/* ── Reporte HTML de recibos del trimestre ───────────────────────────────────── */

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function receiptsQuarterHtml(
  congreId: string, sy: string, quarter: number,
  header: { label: string; city: string; state: string },
): string {
  const q = QUARTERS.find(x => x.n === quarter) ?? QUARTERS[0];
  const allMonths = serviceYearMonths(sy);
  const yms = q.offsets.map((o: number) => allMonths[o]);

  const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  function monthLabel(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }

  type TxRow = {
    id: string; date: string; code: string | null;
    description: string; amount: number; receipt_ref: string | null; type: string;
  };

  const money = (n: number) =>
    n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

  const sections: string[] = [];
  let grandTotal = 0, grandCount = 0, grandWithReceipt = 0;

  for (const ym of yms) {
    const rows = getDb().prepare(`
      SELECT id, date, type, code, description, amount, receipt_ref
      FROM cuentas_transactions
      WHERE congregation_id = ? AND substr(date,1,7) = ? AND type = 'expense'
      ORDER BY date ASC, created_at ASC
    `).all(congreId, ym) as TxRow[];

    const total = rows.reduce((s, r) => s + r.amount, 0);
    const withReceipt = rows.filter(
      r => r.receipt_ref && !String(r.receipt_ref).startsWith('CIERRE-')
    ).length;
    const cierre = rows.filter(r => String(r.receipt_ref ?? '').startsWith('CIERRE-')).length;
    const missing = rows.length - withReceipt - cierre;

    grandTotal += total; grandCount += rows.length; grandWithReceipt += withReceipt;

    const rowsHtml = rows.length === 0
      ? `<tr><td colspan="5" style="text-align:center;color:#888;padding:8px">Sin egresos en este mes</td></tr>`
      : rows.map(r => {
          const isCierre = String(r.receipt_ref ?? '').startsWith('CIERRE-');
          const hasReceipt = !isCierre && !!r.receipt_ref;
          const rowClass = isCierre ? 'cierre' : hasReceipt ? 'ok' : 'missing';
          const badge = isCierre
            ? `<span class="badge-gray">Asiento</span>`
            : hasReceipt
              ? `<span class="badge-ok">✓ ${esc(String(r.receipt_ref))}</span>`
              : `<span class="badge-missing">⚠ Sin comprobante</span>`;
          return `<tr class="${rowClass}">
            <td>${esc(r.date.slice(8, 10))}</td>
            <td>${esc(r.code ?? '—')}</td>
            <td>${esc(r.description)}</td>
            <td style="text-align:right;white-space:nowrap">${money(r.amount)}</td>
            <td>${badge}</td>
          </tr>`;
        }).join('\n');

    sections.push(`
      <h3>${esc(monthLabel(ym))}</h3>
      <p class="summary-line">
        Egresos: <strong>${rows.length}</strong> &nbsp;·&nbsp;
        Con comprobante: <strong class="ok-text">${withReceipt}</strong> &nbsp;·&nbsp;
        Asientos de cierre: <strong class="gray-text">${cierre}</strong>
        ${missing > 0 ? `&nbsp;·&nbsp; Sin comprobante: <strong class="warn-text">${missing}</strong>` : ''}
        &nbsp;·&nbsp; Total: <strong>${money(total)}</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th style="width:32px">Día</th>
            <th style="width:52px">Código</th>
            <th>Descripción</th>
            <th style="width:110px;text-align:right">Monto</th>
            <th style="width:180px">Comprobante</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `);
  }

  const grandMissing = grandCount - grandWithReceipt;
  const generated = new Date().toLocaleDateString('es-MX', { dateStyle: 'long' });

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Recibos T${quarter} · ${sy}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 16px; }
    @page { size: A4; margin: 14mm; }
    @media print { body { padding: 0; } .no-print { display: none; } }
    h1 { font-size: 14px; margin: 0 0 2px; }
    h2 { font-size: 12px; margin: 0 0 12px; font-weight: normal; color: #555; }
    h3 { font-size: 12px; margin: 20px 0 4px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 4px; }
    th { background: #1a3a5c; color: #fff; padding: 4px 6px; text-align: left; font-size: 10px; }
    td { border: 1px solid #ccc; padding: 3px 6px; vertical-align: top; }
    tr.ok  { background: #f0faf0; }
    tr.missing { background: #fff5f5; }
    tr.cierre { background: #f5f5ff; color: #555; }
    .badge-ok    { background: #d1fae5; color: #065f46; border-radius: 3px; padding: 1px 5px; font-size: 10px; white-space: nowrap; }
    .badge-missing { background: #fee2e2; color: #b91c1c; border-radius: 3px; padding: 1px 5px; font-size: 10px; font-weight: bold; }
    .badge-gray  { background: #e5e7eb; color: #6b7280; border-radius: 3px; padding: 1px 5px; font-size: 10px; }
    .ok-text   { color: #065f46; }
    .warn-text { color: #b91c1c; }
    .gray-text { color: #6b7280; }
    .summary-line { margin: 4px 0 6px; }
    .grand { border-top: 2px solid #1a3a5c; padding: 8px 0; margin-top: 16px; font-size: 11px; }
    .sign { margin-top: 32px; display: flex; gap: 40px; }
    .sign-block { flex: 1; border-top: 1px solid #555; padding-top: 4px; font-size: 10px; color: #555; }
  </style>
</head>
<body>
  <div class="no-print" style="background:#fffbe6;border:1px solid #f59e0b;padding:8px 12px;margin-bottom:16px;border-radius:4px;font-size:11px">
    Este reporte está optimizado para impresión. Usa <strong>Ctrl+P</strong> (o Cmd+P) → «Guardar como PDF» para obtener el archivo.
  </div>
  <h1>REPORTE DE COMPROBANTES — AUDITORÍA TRIMESTRAL</h1>
  <h2>
    Congregación: <strong>${esc(header.label)}${header.city ? ` · ${esc(header.city)}` : ''}${header.state ? `, ${esc(header.state)}` : ''}</strong>
    &nbsp;·&nbsp; ${esc(q.label)} · Año de servicio ${esc(sy)} &nbsp;·&nbsp; Generado: ${generated}
  </h2>

  ${sections.join('\n')}

  <div class="grand">
    <strong>TOTALES DEL TRIMESTRE</strong> &nbsp;·&nbsp;
    Egresos: ${grandCount} &nbsp;·&nbsp;
    Con comprobante: <span class="ok-text"><strong>${grandWithReceipt}</strong></span>
    ${grandMissing > 0 ? `&nbsp;·&nbsp; Sin comprobante: <span class="warn-text"><strong>${grandMissing}</strong></span>` : '&nbsp;·&nbsp; <span class="ok-text">Todos tienen comprobante ✓</span>'}
    &nbsp;·&nbsp; Total egresos: <strong>${money(grandTotal)}</strong>
  </div>

  <div class="sign">
    <div class="sign-block">Siervo de cuentas &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    <div class="sign-block">Auditor &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
    <div class="sign-block">Coordinador del C.A. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
  </div>
</body>
</html>`;
}

/**
 * Genera el formulario oficial en PDF rellenando la plantilla de la
 * organización (AcroForm), no una recreación en HTML.
 *
 *   GET /api/cuentas/forms?kind=s30&ym=2026-07
 *   GET /api/cuentas/forms?kind=s25c&sy=2025/2026&quarter=4
 *   GET /api/cuentas/forms?kind=receipts-quarter&sy=2025/2026&quarter=4
 *   GET /api/cuentas/forms?kind=s30&ym=…&calibrate=1   ← cada casilla con su nombre
 *
 * `pdf-lib` se carga de forma diferida para que un despliegue sin la
 * dependencia instalada siga sirviendo el resto del módulo y devuelva aquí un
 * error explicable en vez de romper el arranque.
 */
export async function GET(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const p = new URL(request.url).searchParams;
    const kind = p.get('kind') || 's30';
    const calibrate = p.get('calibrate') === '1';
    const debug = p.get('debug') === '1';

    /* ── Reporte de recibos (HTML, sin pdf-lib) ─────────────────────────── */
    if (kind === 'receipts-quarter') {
      const quarter = Number(p.get('quarter') || 1);
      if (![1, 2, 3, 4].includes(quarter)) return badRequest('quarter debe ser 1, 2, 3 o 4');
      const ym = p.get('ym');
      const sy = p.get('sy') && SY.test(p.get('sy')!)
        ? p.get('sy')!
        : (ym && YM.test(ym) ? serviceYearOf(ym) : null);
      if (!sy) return badRequest('sy requerido (YYYY/YYYY)');

      const cfg = getDb().prepare(
        `SELECT label, city, state FROM cuentas_config WHERE congregation_id = ?`
      ).get(g.congreId) as { label: string; city: string; state: string } | undefined;
      const congre = getDb().prepare(
        `SELECT name, city FROM congregations WHERE id = ?`
      ).get(g.congreId) as { name: string; city: string | null } | undefined;
      const header = {
        label: cfg?.label || congre?.name || '',
        city:  cfg?.city  || congre?.city || '',
        state: cfg?.state || '',
      };

      const html = receiptsQuarterHtml(g.congreId, sy, quarter, header);
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (!['s26', 's30', 's25c'].includes(kind)) return badRequest(`kind desconocido: ${kind}`);

    let pdfForms: typeof import('@/lib/pdfForms');
    try {
      pdfForms = await import('@/lib/pdfForms');
    } catch {
      return NextResponse.json({
        error: 'Falta la dependencia pdf-lib. Ejecuta: npm install',
      }, { status: 501 });
    }

    if (!pdfForms.templateExists(kind as 's26' | 's30' | 's25c')) {
      return NextResponse.json({
        error: `Falta la plantilla oficial de ${kind.toUpperCase()} en src/lib/pdf-templates/`,
      }, { status: 501 });
    }

    // Encabezado del formulario.
    const cfg = getDb().prepare(
      `SELECT label, city, state, treasurer_name FROM cuentas_config WHERE congregation_id = ?`
    ).get(g.congreId) as { label: string; city: string; state: string; treasurer_name?: string } | undefined;

    const congre = getDb().prepare(
      `SELECT name, city FROM congregations WHERE id = ?`
    ).get(g.congreId) as { name: string; city: string | null } | undefined;

    const header = {
      label: cfg?.label || congre?.name || '',
      city:  cfg?.city  || congre?.city || '',
      state: cfg?.state || '',
      treasurer_name: cfg?.treasurer_name || '',
    };

    let bytes: Uint8Array;
    let filename: string;

    if (kind === 's26') {
      const ym = p.get('ym');
      if (!ym || !YM.test(ym)) return badRequest('ym requerido (YYYY-MM)');
      const { buildS26 } = await import('@/lib/cuentas');
      const s26 = buildS26(g.congreId, ym);
      if (debug) return NextResponse.json({ kind, ym, values: pdfForms.previewValues('s26', { s26 }, header) });
      bytes = await pdfForms.fillS26(s26, header, { calibrate });
      filename = `S-26-S ${ym}${calibrate ? ' (calibracion)' : ''}.pdf`;
    } else if (kind === 's30') {
      const ym = p.get('ym');
      if (!ym || !YM.test(ym)) return badRequest('ym requerido (YYYY-MM)');
      const s30 = buildS30(g.congreId, ym);
      if (debug) return NextResponse.json({ kind, ym, values: pdfForms.previewValues('s30', { s30 }, header) });
      bytes = await pdfForms.fillS30(s30, header, { calibrate });
      filename = `S-30-S ${ym}${calibrate ? ' (calibracion)' : ''}.pdf`;
    } else {
      const quarter = Number(p.get('quarter') || 1);
      if (![1, 2, 3, 4].includes(quarter)) return badRequest('quarter debe ser 1, 2, 3 o 4');
      const ym = p.get('ym');
      const sy = p.get('sy') && SY.test(p.get('sy')!)
        ? p.get('sy')!
        : (ym && YM.test(ym) ? serviceYearOf(ym) : null);
      if (!sy) return badRequest('sy requerido (YYYY/YYYY)');
      const s25c = buildS25c(g.congreId, sy, quarter);
      // Respuestas del cuestionario codificadas como "don.1:si,don.2:no,..."
      const answersRaw = p.get('a') ?? '';
      const answers: Record<string, string> = {};
      for (const pair of answersRaw.split(',')) {
        const [k, v] = pair.split(':');
        if (k && v) answers[k.trim()] = v.trim();
      }
      // Nombres de auditor y secretario como params separados (evita conflictos con comas)
      const auditor = p.get('auditor');
      const secretario = p.get('secretario');
      if (auditor) answers['auditor'] = auditor;
      if (secretario) answers['secretario'] = secretario;
      if (debug) return NextResponse.json({ kind, sy, quarter, answers, values: pdfForms.previewValues('s25c', { s25c }, header, answers) });
      bytes = await pdfForms.fillS25c(s25c, header, { calibrate }, answers);
      filename = `S-25c ${sy.replace('/', '-')} T${quarter}${calibrate ? ' (calibracion)' : ''}.pdf`;
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) { return serverError(e); }
}

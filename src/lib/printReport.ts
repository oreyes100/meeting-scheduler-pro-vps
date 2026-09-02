// Reporte de impresión genérico — estilo La Estación (mismo formato que programa fin de semana)
const TEAL = '#3d7d8e';

function esc(s: string): string {
  return (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface PrintTableOptions {
  title: string;
  congName: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number | null | undefined)[][];
  sheets?: { name: string; columns: string[]; rows: (string | number | null | undefined)[][] }[];
}

export function printTableReport({ title, congName, subtitle, columns, rows }: PrintTableOptions) {
  const w = window.open('', '_blank');
  if (!w) return;
  const head = `<style>
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .hdr{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f2937;padding-bottom:4px;margin-bottom:6px}
      h1{font-size:18px;margin:0}
      .cong{font-size:16px;font-weight:bold}
      h2{font-size:13px;color:#555;margin:0 0 16px;font-weight:normal;text-transform:capitalize}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:${TEAL};color:#fff}
      tr:nth-child(even) td{background:#eef4f6}
    </style>`;
  const body = `<div class="hdr"><h1>${esc(title)}</h1><span class="cong">${esc(congName)}</span></div>
    ${subtitle ? `<h2>${esc(subtitle)}</h2>` : ''}
    <table><thead><tr>${columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c == null ? '' : String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>${head}</head><body>${body}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

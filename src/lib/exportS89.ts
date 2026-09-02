/**
 * Generadores de export para las Hojas S-89 individuales (85 mm).
 *
 * Dos capas:
 *  · `build*` — generación pura (devuelven Blob/string). No tocan `document`,
 *    así que se pueden probar en Node.
 *  · `download*` — envuelven `build*` + descarga en el navegador.
 *
 * Geometría derivada del modelo `FORMATO ASIGNACIONES VYMC.docx`:
 *  · Página impresora: 85 × 127 mm (papel físico 85 × 115; el contenido vive en
 *    el tercio superior, así que cabe en ambos). pgSz docx = 4819 × 7200 twips.
 *  · Márgenes 0; sangría izquierda de los valores = 1701 twips = 30 mm.
 *  · Solo 5 valores, sin títulos/líneas/recuadros.
 */

import type { SlipData, Sala } from './s89Individual';
import { salaCsv } from './s89Individual';

/** Deltas en mm para ajustar la posición de cada campo en el PDF (X = horizontal, Y = vertical). */
export interface PdfOffsets {
  nombre: number;
  ayudante: number;
  fecha: number;
  asignacion: number;
  sala: number;
  nombreX: number;
  ayudanteX: number;
  fechaX: number;
  asignacionX: number;
  salaX: number;
}

export const PDF_OFFSETS_DEFAULT: PdfOffsets = {
  nombre: 0, ayudante: 0, fecha: 0, asignacion: 0, sala: 0,
  nombreX: 0, ayudanteX: 0, fechaX: 0, asignacionX: 0, salaX: 0,
};

/** Línea de intervención: "3 Lectura de la Biblia > Jer 24:1-10 (th lección 5)". */
function asignacionLinea(s: SlipData): string {
  const base = `${s.numIntervencion} ${s.tituloCorto}`;
  return s.material ? `${base} > ${s.material}` : base;
}

// ── Geometría hojita ─────────────────────────────────────────────────────────
const SLIP_W = 85;   // mm — ancho impresora
const SLIP_H = 127;  // mm — alto impresora (papel real 115; contenido en top ~60)

// Coordenadas PDF en mm (baseline). Estimadas del modelo; afinar físicamente si
// hace falta ajustando Y_OFFSET en bloque.
const Y_OFFSET = 0;
const X_TEXT = 30;
const X_ASSIGN = 33;
const X_SALA = 33;
const PDF_Y = {
  nombre:      18,
  ayudante:    26.5,
  fecha:       33.5,
  asignacion:  41,
  sala:        60.5,
};
// Desplazamiento vertical de la marca "X" según la sala (la principal es la
// primera casilla; auxiliares quedan una/dos líneas más abajo). ESTIMADO —
// calibrar contra la hojita física preimpresa si se usan salas auxiliares.
const SALA_DY: Record<Sala, number> = { main: 0, aux_1: 5.5, aux_2: 11 };

// Resuelve módulos CJS/ESM que llegan envueltos en .default al hacer import()
function unwrap<T>(mod: T): T {
  if (mod && typeof mod === 'object' && 'default' in (mod as any)) {
    const d = (mod as any).default;
    if (d && typeof d === 'object' && Object.keys(d).length > 0) return d as T;
  }
  return mod;
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function buildS89IndividualPdfBlob(
  slips: SlipData[],
  offsets: PdfOffsets = PDF_OFFSETS_DEFAULT,
): Promise<Blob> {
  const mod = await import('jspdf');
  const jsPDFLib: any = unwrap(mod);
  const JsPDF = jsPDFLib.jsPDF ?? jsPDFLib;

  const doc = new JsPDF({ unit: 'mm', format: [SLIP_W, SLIP_H], orientation: 'portrait' });

  slips.forEach((s, i) => {
    if (i > 0) doc.addPage([SLIP_W, SLIP_H], 'portrait');
    const oy = Y_OFFSET;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(s.nombre,     X_TEXT + offsets.nombreX,   PDF_Y.nombre     + oy + offsets.nombre,     { maxWidth: SLIP_W - X_TEXT - 3 });
    doc.text(s.ayudante,   X_TEXT + offsets.ayudanteX, PDF_Y.ayudante   + oy + offsets.ayudante,   { maxWidth: SLIP_W - X_TEXT - 3 });
    doc.text(s.fechaLarga, X_TEXT + offsets.fechaX,     PDF_Y.fecha      + oy + offsets.fecha);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(asignacionLinea(s), X_ASSIGN + offsets.asignacionX, PDF_Y.asignacion + oy + offsets.asignacion,
      { maxWidth: SLIP_W - X_ASSIGN - 3 });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('X', X_SALA + offsets.salaX, PDF_Y.sala + (SALA_DY[s.sala] ?? 0) + oy + offsets.sala);
  });

  return doc.output('blob');
}

// ── DOCX ─────────────────────────────────────────────────────────────────────
// Secuencia de espaciadores/valores del modelo (size en half-points = valor sz).
const INDENT = 1701;        // twips — sangría izquierda de los valores (30 mm)
const INDENT_MARK = 2000;   // twips — asignación y "X" llevan sangría algo mayor
const TWIP_PER_MM = 56.6929; // 1 mm = 56.6929 twips

export async function buildS89IndividualDocxBlob(slips: SlipData[], offsets: PdfOffsets = PDF_OFFSETS_DEFAULT): Promise<Blob> {
  const docx: any = unwrap(await import('docx'));
  const { Document, Packer, Paragraph, TextRun, SectionType } = docx;

  const FONT = 'Amasis MT Pro Black';

  const spacer = (sz: number) =>
    new Paragraph({
      spacing: { after: 0, line: 240, lineRule: 'auto' },
      children: [new TextRun({ text: '', size: sz, font: FONT })],
    });

  // `field` aplica los ajustes X (sangría) e Y (espaciado before) del PDF.
  const value = (text: string, sz: number, baseIndent: number, bold = true, field?: keyof PdfOffsets) => {
    const ox = field ? (offsets as any)[`${field}X`] ?? 0 : 0;
    const oy = field ? (offsets as any)[field] ?? 0 : 0;
    return new Paragraph({
      spacing: { after: 0, line: 240, lineRule: 'auto', before: Math.round(oy * TWIP_PER_MM) },
      indent: { left: Math.round(baseIndent + ox * TWIP_PER_MM) },
      children: [new TextRun({ text, size: sz, bold, font: FONT })],
    });
  };

  const sections = slips.map(s => {
    const children: any[] = [
      spacer(18), spacer(18), spacer(18), spacer(16),
      value(s.nombre, 22, INDENT, true, 'nombre'),
      spacer(20),
      value(s.ayudante, 22, INDENT, true, 'ayudante'),
      spacer(12),
      value(s.fechaLarga, 22, INDENT, true, 'fecha'),
      spacer(16),
      value(asignacionLinea(s), 20, INDENT_MARK, false, 'asignacion'),
      spacer(18), spacer(18), spacer(18), spacer(16),
    ];
    // La marca "X" cae en la casilla de la sala: auxiliares una/dos líneas abajo.
    const extra = s.sala === 'aux_1' ? 1 : s.sala === 'aux_2' ? 2 : 0;
    for (let i = 0; i < extra; i++) children.push(spacer(18));
    children.push(value('X', 28, INDENT_MARK, true, 'sala'));

    return {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 4819, height: 7200 },
          margin: { top: 0, right: 0, bottom: 0, left: 0, header: 709, footer: 709 },
        },
      },
      children,
    };
  });

  const doc = new Document({ sections });
  return Packer.toBlob(doc);
}

// ── XLSX (tabla de datos) ────────────────────────────────────────────────────
// CSV conserva las 5 columnas cortas; el XLSX añade la fuente de la asignación.
const HEADERS = ['Nombre', 'Ayudante', 'Fecha', 'Num de Intervencion', 'Sala'];

function slipRow(s: SlipData): (string | number)[] {
  return [s.nombre, s.ayudante, s.fechaLarga, s.numIntervencion, salaCsv(s.sala)];
}

const XLSX_HEADERS = ['Nombre', 'Ayudante', 'Fecha', 'Num de Intervencion', 'Asignacion', 'Basado en', 'Sala'];

function xlsxRow(s: SlipData): (string | number)[] {
  return [s.nombre, s.ayudante, s.fechaLarga, s.numIntervencion, s.tituloCorto, s.material, salaCsv(s.sala)];
}

export async function buildS89XlsxBlob(slips: SlipData[]): Promise<Blob> {
  const XLSX: any = unwrap(await import('xlsx-js-style'));
  const data = [XLSX_HEADERS, ...slips.map(xlsxRow)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = XLSX_HEADERS.map((h, i) => ({
    wch: Math.min(50, Math.max(h.length, ...slips.map(s => String(xlsxRow(s)[i]).length)) + 2),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'S-89');
  const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Devuelve el CSV como string (RFC 4180). Sin BOM: lo añade la capa de descarga. */
export function buildS89Csv(slips: SlipData[]): string {
  const rows = [HEADERS, ...slips.map(slipRow)];
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
}

// ── Descarga (navegador) ──────────────────────────────────────────────────────
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadS89IndividualPdf(slips: SlipData[], base: string, offsets?: PdfOffsets) {
  downloadBlob(await buildS89IndividualPdfBlob(slips, offsets), `${base}.pdf`);
}
export async function downloadS89IndividualDocx(slips: SlipData[], base: string, offsets?: PdfOffsets) {
  downloadBlob(await buildS89IndividualDocxBlob(slips, offsets), `${base}.docx`);
}
export async function downloadS89Xlsx(slips: SlipData[], base: string) {
  downloadBlob(await buildS89XlsxBlob(slips), `${base}.xlsx`);
}
export function downloadS89Csv(slips: SlipData[], base: string) {
  const blob = new Blob(['﻿' + buildS89Csv(slips)], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${base}.csv`);
}

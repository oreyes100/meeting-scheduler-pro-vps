'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  MapPin, Plus, Trash2, Save, X, Undo2, Check, Crosshair, SquareDashed,
  History, FileText, FileSpreadsheet, Users2, Map as MapIcon, List,
} from 'lucide-react';
import type { LatLng } from '@/components/TerritoryMap';
import { IconSidebar } from '@/components/IconSidebar';
import { SyncStatus } from '@/components/SyncStatus';
import { useDevice } from '@/lib/useDevice';

const TerritoryMap = dynamic(() => import('@/components/TerritoryMap'), { ssr: false });

interface Territory {
  id: string;
  number: number | null;
  name: string;
  color: string;
  coordinates: LatLng[];
  group_name: string | null;
  assigned_to: string | null;
  assigned_name?: string | null;
  visit_start: string | null;
  visit_end: string | null;
  note: string | null;
  status: 'available' | 'assigned' | 'completed';
  pairs_count: number | null;
  completion_hours: number | null;
  completion_houses: number | null;
}

interface Assignment {
  id: string;
  territory_id: string;
  assigned_name: string;
  assigned_date: string | null;
  completed_date: string | null;
  pairs_count?: number | null;
  completion_hours?: number | null;
  completion_houses?: number | null;
}

type StatusFilter = 'all' | 'available' | 'assigned' | 'completed';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'available', label: 'Disponibles' },
  { value: 'assigned', label: 'Asignados' },
  { value: 'completed', label: 'Completados' },
];

const PALETTE = ['#3d7d8e', '#c0392b', '#27ae60', '#8e44ad', '#d35400', '#2980b9', '#16a085', '#c9a227'];
const STATUS_LABEL: Record<string, string> = { available: 'Disponible', assigned: 'Asignado', completed: 'Completado' };
const STATUS_COLOR: Record<string, string> = { available: 'bg-slate-100 text-slate-600', assigned: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700' };

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y?.slice(2)}`;
}

function currentServiceYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() + 1 : now.getFullYear();
}

// ── S-13 ─────────────────────────────────────────────────────────────────────
// Geometry extracted from the official S-13-S 1/22 blank form (A4 portrait,
// 595.32 x 842.04 pt). All coordinates below are in PDF points, origin
// bottom-left, and reproduce the template 1:1.
//
// Layout: 10 columns.
//   1  Núm. de terr.                 (rowSpan over both header rows + both sub-rows)
//   2  Última fecha en que se completó*  (idem)
//   3-4, 5-6, 7-8, 9-10  four "Asignado a" groups, each 2 columns
//        (header row 2: "Fecha en que se asignó" | "Fecha en que se completó")
// Each territory occupies TWO sub-rows: the upper one holds the publisher name
// merged across the 2 columns of each group; the lower one holds the two dates.

const S13 = {
  pageW: 595.32,
  pageH: 842.04,
  // Column boundaries (11 values → 10 columns)
  colX: [36.0, 71.2, 135.0, 188.4, 241.2, 295.1, 348.1, 401.9, 454.8, 508.7, 560.8],
  // Heavy black rules: outer border + the four "Asignado a" group separators
  thickRules: [36.0, 135.0, 241.2, 348.1, 454.8, 560.8],
  // Light rule running the full height (Núm. / Última fecha separator)
  thinRules: [71.2],
  // Vertical rules present only inside the two-date sub-row (they stop at the
  // name sub-row, which is merged across each group)
  dateRules: [188.4, 295.1, 401.9, 508.7],
  tableTop: 731.3,
  h1Bot: 716.5,   // between "Asignado a" and "Fecha en que…"
  h2Bot: 695.6,   // bottom of the header block / top of first territory row
  rowH: 31.3,     // full height of one territory (name sub-row + date sub-row)
  nameH: 15.2,    // upper sub-row (publisher name)
  rowsPerPage: 20,
  titleY: 775.1,
  yearLabelY: 748.2,
  yearRule: { y: 744.7, x0: 134.5, x1: 190.2 },
  footnoteY: 55.7,
  formIdY: 38.1,
  thin: [64, 64, 64] as [number, number, number],    // gray 0.251 in the original
  shade: [217, 217, 217] as [number, number, number], // gray 0.851 header fill
};

interface Slot { name: string; assigned: string; completed: string }

// Blank (not "—") for empty cells: the official form leaves them empty.
function fmtB(d: string | null | undefined) {
  return d ? fmt(d) : '';
}

function getSlots(t: Territory, allAssignments: Assignment[]) {
  const tas = allAssignments
    .filter(a => a.territory_id === t.id)
    .sort((a, b) => (a.assigned_date ?? '').localeCompare(b.assigned_date ?? ''));
  const lastCompleted = [...tas].reverse().find(a => a.completed_date)?.completed_date ?? null;
  const slots: Slot[] = [0, 1, 2, 3].map(i => {
    const a = tas[i];
    return {
      name: a?.assigned_name ?? '',
      assigned: fmtB(a?.assigned_date),
      completed: fmtB(a?.completed_date),
    };
  });
  return { lastCompleted, slots };
}

/**
 * Draws the territory outline to a PNG data URI so it can travel with the
 * assignment notification. Deliberately a plain shape rather than a map tile
 * capture — tile providers forbid redistributing imagery, and the outline plus
 * the territory name is what the publisher actually needs to locate it.
 */
function renderTerritoryImage(t: Territory): string | null {
  if (typeof document === 'undefined' || !t.coordinates?.length) return null;
  const W = 600, H = 400, PAD = 40;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const lats = t.coordinates.map(c => c.lat);
  const lngs = t.coordinates.map(c => c.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;
  const scale = Math.min((W - PAD * 2) / spanLng, (H - PAD * 2 - 30) / spanLat);
  // Latitude grows upward, canvas y grows downward — flip it.
  const px = (lng: number) => PAD + (lng - minLng) * scale + (W - PAD * 2 - spanLng * scale) / 2;
  const py = (lat: number) => H - 30 - PAD - (lat - minLat) * scale - (H - PAD * 2 - 30 - spanLat * scale) / 2;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);

  ctx.beginPath();
  t.coordinates.forEach((c, i) => (i ? ctx.lineTo(px(c.lng), py(c.lat)) : ctx.moveTo(px(c.lng), py(c.lat))));
  ctx.closePath();
  ctx.fillStyle = t.color + '55';
  ctx.fill();
  ctx.strokeStyle = t.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${t.number != null ? t.number + '. ' : ''}${t.name}`, W / 2, H - 10);

  return canvas.toDataURL('image/png');
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// S-13 PDF — drawn primitively so the output matches the official form exactly.
// jsPDF is used in 'pt'/a4 so the constants in S13 map 1:1 onto the page.
async function exportPdf(territories: Territory[], allAssignments: Assignment[], year: number) {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const { colX, thickRules, thinRules, dateRules, tableTop, h1Bot, h2Bot, rowH, nameH, rowsPerPage } = S13;
  const left = colX[0];
  const right = colX[colX.length - 1];
  const tableBot = h2Bot - rowsPerPage * rowH;

  // PDF origin is bottom-left; jsPDF draws from the top-left. Convert.
  const Y = (pdfY: number) => S13.pageH - pdfY;
  const hLine = (y: number, x0: number, x1: number, w: number) => {
    doc.setLineWidth(w);
    doc.line(x0, Y(y), x1, Y(y));
  };
  const vLine = (x: number, yTop: number, yBot: number, w: number) => {
    doc.setLineWidth(w);
    doc.line(x, Y(yTop), x, Y(yBot));
  };
  // Centered text on a baseline, shrinking to fit the cell if needed.
  const cText = (text: string, x0: number, x1: number, baseline: number, size: number, bold = false) => {
    if (!text) return;
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    let s = size;
    const maxW = x1 - x0 - 4;
    doc.setFontSize(s);
    while (s > 4 && doc.getTextWidth(text) > maxW) {
      s -= 0.5;
      doc.setFontSize(s);
    }
    doc.text(text, (x0 + x1) / 2, Y(baseline), { align: 'center' });
    doc.setFontSize(size);
  };

  const sorted = [...territories].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
  const pages = chunk(sorted, rowsPerPage);

  pages.forEach((pageRows, pageIdx) => {
    if (pageIdx > 0) doc.addPage();
    doc.setTextColor(0, 0, 0);

    // ── Title + "Año de servicio:" with its rule ────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('REGISTRO DE ASIGNACIÓN DE TERRITORIO', S13.pageW / 2, Y(S13.titleY), { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Año de servicio:', left, Y(S13.yearLabelY));
    doc.setDrawColor(0, 0, 0);
    hLine(S13.yearRule.y, S13.yearRule.x0, S13.yearRule.x1, 0.8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(String(year), (S13.yearRule.x0 + S13.yearRule.x1) / 2, Y(S13.yearLabelY), { align: 'center' });

    // ── Header shading (gray 0.851 across the whole header block) ───────────
    doc.setFillColor(...S13.shade);
    doc.rect(left, Y(tableTop), right - left, tableTop - h2Bot, 'F');

    // ── Grid ────────────────────────────────────────────────────────────────
    // Thin gray rules first, heavy black ones on top.
    doc.setDrawColor(...S13.thin);
    hLine(h1Bot, colX[2], right, 0.5);                       // "Asignado a" / "Fecha…"
    for (let i = 0; i < rowsPerPage; i++) {
      hLine(h2Bot - i * rowH - nameH, colX[2], right, 0.5);  // name / dates divider
    }
    for (const x of thinRules) vLine(x, tableTop, tableBot, 0.5);
    for (const x of dateRules) {
      vLine(x, h1Bot, h2Bot, 0.5);                           // header sub-columns
      for (let i = 0; i < rowsPerPage; i++) {
        const rowTop = h2Bot - i * rowH;
        vLine(x, rowTop - nameH, rowTop - rowH, 0.5);
      }
    }

    doc.setDrawColor(0, 0, 0);
    hLine(tableTop, left, right, 1.5);                       // top border
    hLine(h2Bot, left, right, 1.5);                          // header block bottom
    for (let i = 0; i < rowsPerPage; i++) {
      hLine(h2Bot - i * rowH - rowH, left, right, 1.5);      // territory separator
    }
    for (const x of thickRules) vLine(x, tableTop, tableBot, 1.5);

    // ── Header text ─────────────────────────────────────────────────────────
    cText('Núm.', colX[0], colX[1], 716.1, 9);
    cText('de terr.', colX[0], colX[1], 705.7, 9);
    cText('Última fecha', colX[1], colX[2], 720.2, 9);
    cText('en que se', colX[1], colX[2], 709.9, 9);
    cText('completó*', colX[1], colX[2], 699.6, 9);

    for (let g = 0; g < 4; g++) {
      const gx0 = colX[2 + g * 2];
      const gx1 = colX[4 + g * 2];
      cText('Asignado a', gx0, gx1, 720.8, 9);
      cText('Fecha en que', gx0, colX[3 + g * 2], 708.9, 8);
      cText('se asignó', gx0, colX[3 + g * 2], 699.7, 8);
      cText('Fecha en que', colX[3 + g * 2], gx1, 708.9, 8);
      cText('se completó', colX[3 + g * 2], gx1, 699.7, 8);
    }

    // ── Data ────────────────────────────────────────────────────────────────
    pageRows.forEach((t, i) => {
      const { lastCompleted, slots } = getSlots(t, allAssignments);
      const rowTop = h2Bot - i * rowH;
      // Columns 1-2 are merged over the whole territory row → centre vertically.
      const midBase = rowTop - rowH / 2 - 3;
      cText(String(t.number ?? ''), colX[0], colX[1], midBase, 9);
      cText(fmtB(lastCompleted), colX[1], colX[2], midBase, 8);

      const nameBase = rowTop - nameH / 2 - 2.5;
      const dateBase = rowTop - nameH - (rowH - nameH) / 2 - 2.5;
      slots.forEach((s, g) => {
        const gx0 = colX[2 + g * 2];
        const gxm = colX[3 + g * 2];
        const gx1 = colX[4 + g * 2];
        cText(s.name, gx0, gx1, nameBase, 8);
        cText(s.assigned, gx0, gxm, dateBase, 8);
        cText(s.completed, gxm, gx1, dateBase, 8);
      });
    });

    // ── Footer ──────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(
      '*Cuando comience una nueva página, anote en esta columna la última fecha en que los territorios se completaron.',
      left, Y(S13.footnoteY)
    );
    doc.text('S-13-S  1/22', left, Y(S13.formIdY));
  });

  doc.save(`S-13_${year}.pdf`);
}

// S-13 XLSX — 10 columns; each territory spans 2 rows (name row + dates row),
// mirroring the official form.
async function exportXlsx(territories: Territory[], allAssignments: Assignment[], year: number) {
  // xlsx-js-style is a drop-in SheetJS fork that can actually write cell
  // styling (the community `xlsx` build silently drops it).
  const XLSX = (await import('xlsx-js-style')).default;
  const wb = XLSX.utils.book_new();

  const sorted = [...territories].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
  const rowCount = Math.max(S13.rowsPerPage, sorted.length);

  // r0 title · r1 "Año de servicio" · r2/r3 header · r4+ data (2 rows each)
  const rows: (string | number)[][] = [
    ['REGISTRO DE ASIGNACIÓN DE TERRITORIO'],
    [`Año de servicio: ${year}`],
    ['Núm. de terr.', 'Última fecha en que se completó*',
      'Asignado a', '', 'Asignado a', '', 'Asignado a', '', 'Asignado a', ''],
    ['', '',
      'Fecha en que se asignó', 'Fecha en que se completó',
      'Fecha en que se asignó', 'Fecha en que se completó',
      'Fecha en que se asignó', 'Fecha en que se completó',
      'Fecha en que se asignó', 'Fecha en que se completó'],
  ];

  const HDR = 4; // first data row index
  type Rng = { s: { r: number; c: number }; e: { r: number; c: number } };
  const merges: Rng[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },   // title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },   // año de servicio
    { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } },   // Núm. de terr. (rowspan)
    { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },   // Última fecha  (rowspan)
    { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },   // Asignado a ×4 (colspan 2)
    { s: { r: 2, c: 4 }, e: { r: 2, c: 5 } },
    { s: { r: 2, c: 6 }, e: { r: 2, c: 7 } },
    { s: { r: 2, c: 8 }, e: { r: 2, c: 9 } },
  ];

  for (let i = 0; i < rowCount; i++) {
    const t = sorted[i];
    const r = HDR + i * 2;
    if (t) {
      const { lastCompleted, slots } = getSlots(t, allAssignments);
      rows.push([t.number ?? '', fmtB(lastCompleted),
        slots[0].name, '', slots[1].name, '', slots[2].name, '', slots[3].name, '']);
      rows.push(['', '',
        slots[0].assigned, slots[0].completed,
        slots[1].assigned, slots[1].completed,
        slots[2].assigned, slots[2].completed,
        slots[3].assigned, slots[3].completed]);
    } else {
      rows.push(['', '', '', '', '', '', '', '', '', '']);
      rows.push(['', '', '', '', '', '', '', '', '', '']);
    }
    // Columns 1-2 merged down over both sub-rows; each name merged across its group
    merges.push({ s: { r, c: 0 }, e: { r: r + 1, c: 0 } });
    merges.push({ s: { r, c: 1 }, e: { r: r + 1, c: 1 } });
    for (let g = 0; g < 4; g++) {
      merges.push({ s: { r, c: 2 + g * 2 }, e: { r, c: 3 + g * 2 } });
    }
  }

  const footR = HDR + rowCount * 2 + 1;
  rows.push([]);
  rows.push(['*Cuando comience una nueva página, anote en esta columna la última fecha en que los territorios se completaron.']);
  rows.push(['S-13-S  1/22']);
  merges.push({ s: { r: footR, c: 0 }, e: { r: footR, c: 9 } });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  // Widths proportional to the official column widths (pt → approx. chars)
  ws['!cols'] = [
    { wch: 8 }, { wch: 14 },
    { wch: 13 }, { wch: 13 },
    { wch: 13 }, { wch: 13 },
    { wch: 13 }, { wch: 13 },
    { wch: 13 }, { wch: 13 },
  ];
  ws['!rows'] = rows.map((_, i) => (i === 0 ? { hpt: 22 } : i === 2 ? { hpt: 30 } : i === 3 ? { hpt: 26 } : { hpt: 15 }));

  // ── Styling to match the printed form ──────────────────────────────────
  const THIN = { style: 'thin', color: { rgb: 'FF404040' } };
  const MED = { style: 'medium', color: { rgb: 'FF000000' } };
  const lastRow = HDR + rowCount * 2 - 1;
  const center = { horizontal: 'center', vertical: 'center', wrapText: true };

  for (let R = 0; R <= lastRow; R++) {
    for (let C = 0; C <= 9; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };

      if (R === 0) {
        ws[addr].s = { font: { name: 'Arial', sz: 14, bold: true }, alignment: center };
        continue;
      }
      if (R === 1) {
        ws[addr].s = { font: { name: 'Arial', sz: 12, bold: true }, alignment: { horizontal: 'left', vertical: 'center' } };
        continue;
      }

      const isHeader = R === 2 || R === 3;
      const isNameRow = R >= HDR && (R - HDR) % 2 === 0;
      // Heavy rules: the outer box, the group separators, and the line closing
      // each territory (i.e. under every date sub-row).
      const groupStart = C === 0 || C === 2 || C === 4 || C === 6 || C === 8;
      const groupEnd = C === 1 || C === 3 || C === 5 || C === 7 || C === 9;

      ws[addr].s = {
        font: {
          name: 'Arial',
          sz: isHeader ? (R === 2 ? 9 : 8) : C === 0 ? 9 : 8,
          bold: false,
        },
        alignment: center,
        fill: isHeader ? { patternType: 'solid', fgColor: { rgb: 'FFD9D9D9' } } : undefined,
        border: {
          top: R === 2 || (R >= HDR && isNameRow) ? MED : THIN,
          bottom: R === 3 || (R >= HDR && !isNameRow) ? MED : THIN,
          left: C === 0 || (groupStart && C >= 2) ? MED : THIN,
          right: C === 9 || (groupEnd && C <= 7) ? MED : THIN,
        },
      };
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, `S-13 ${year}`);
  XLSX.writeFile(wb, `S-13_${year}.xlsx`);
}

// S-13 DOCX — A4 portrait, 10 columns, each territory over two rows.
async function exportDocx(territories: Territory[], allAssignments: Assignment[], year: number) {
  const {
    Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
    WidthType, AlignmentType, VerticalAlign, VerticalMergeType, TableLayoutType,
    BorderStyle, ShadingType,
  } = await import('docx');

  const sorted = [...territories].sort((a, b) => (a.number ?? 9999) - (b.number ?? 9999));
  const rowCount = Math.max(S13.rowsPerPage, sorted.length);

  // Official column widths in points → twips (DXA), then normalised to the A4
  // text width (11906 − 720 − 690 = 10496 twips).
  const colW = [35.2, 63.8, 53.4, 52.8, 53.9, 53.0, 53.8, 52.9, 53.9, 52.1].map(pt => Math.round(pt * 20));

  const edge = { style: BorderStyle.SINGLE, size: 6, color: '404040' };
  const cellBorders = { top: edge, bottom: edge, left: edge, right: edge };

  const mkCell = (text: string, o: {
    bold?: boolean; size?: number; colSpan?: number;
    merge?: 'restart' | 'continue'; width?: number; shaded?: boolean;
  } = {}) => new TableCell({
    columnSpan: o.colSpan,
    verticalMerge: o.merge === 'restart' ? VerticalMergeType.RESTART
      : o.merge === 'continue' ? VerticalMergeType.CONTINUE : undefined,
    verticalAlign: VerticalAlign.CENTER,
    borders: cellBorders,
    // Header block carries the same light gray as the printed form (D9D9D9).
    shading: o.shaded ? { type: ShadingType.CLEAR, color: 'auto', fill: 'D9D9D9' } : undefined,
    width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 20, after: 20 },
      children: [new TextRun({ text, bold: o.bold ?? false, size: o.size ?? 16, font: 'Arial' })],
    })],
  });

  // Header row 1 — "Núm." and "Última fecha" start a vertical merge; the four
  // "Asignado a" cells each span their group's 2 columns.
  const header1 = new TableRow({
    tableHeader: true,
    children: [
      mkCell('Núm. de terr.', { size: 18, merge: 'restart', width: colW[0], shaded: true }),
      mkCell('Última fecha en que se completó*', { size: 18, merge: 'restart', width: colW[1], shaded: true }),
      ...[0, 1, 2, 3].map(() => mkCell('Asignado a', { size: 18, colSpan: 2, shaded: true })),
    ],
  });

  // Header row 2 — the two date labels for every group.
  const header2 = new TableRow({
    tableHeader: true,
    children: [
      mkCell('', { merge: 'continue', shaded: true }),
      mkCell('', { merge: 'continue', shaded: true }),
      ...[0, 1, 2, 3].flatMap(() => [
        mkCell('Fecha en que se asignó', { size: 16, shaded: true }),
        mkCell('Fecha en que se completó', { size: 16, shaded: true }),
      ]),
    ],
  });

  const dataRows: InstanceType<typeof TableRow>[] = [];
  for (let i = 0; i < rowCount; i++) {
    const t = sorted[i];
    const s = t ? getSlots(t, allAssignments) : null;
    const slots: Slot[] = s?.slots ?? [0, 1, 2, 3].map(() => ({ name: '', assigned: '', completed: '' }));

    // Upper sub-row: number + última fecha (merge start) and the four names.
    dataRows.push(new TableRow({
      children: [
        mkCell(t ? String(t.number ?? '') : '', { size: 18, merge: 'restart' }),
        mkCell(s ? fmtB(s.lastCompleted) : '', { size: 16, merge: 'restart' }),
        ...slots.map(sl => mkCell(sl.name, { size: 16, colSpan: 2 })),
      ],
    }));
    // Lower sub-row: the two dates of every group.
    dataRows.push(new TableRow({
      children: [
        mkCell('', { merge: 'continue' }),
        mkCell('', { merge: 'continue' }),
        ...slots.flatMap(sl => [mkCell(sl.assigned, { size: 16 }), mkCell(sl.completed, { size: 16 })]),
      ],
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },            // A4 portrait
          margin: { top: 720, right: 690, bottom: 720, left: 720 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'REGISTRO DE ASIGNACIÓN DE TERRITORIO', bold: true, size: 28, font: 'Arial' })],
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: `Año de servicio:  ${year}`, size: 24, font: 'Arial' })],
        }),
        new Table({
          layout: TableLayoutType.FIXED,
          columnWidths: colW,
          width: { size: colW.reduce((a, b) => a + b, 0), type: WidthType.DXA },
          rows: [header1, header2, ...dataRows],
        }),
        new Paragraph({
          spacing: { before: 160 },
          children: [new TextRun({ text: '*Cuando comience una nueva página, anote en esta columna la última fecha en que los territorios se completaron.', size: 20, font: 'Arial' })],
        }),
        new Paragraph({ children: [new TextRun({ text: 'S-13-S  1/22', size: 20, font: 'Arial' })] }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `S-13_${year}.docx`; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TerritoriesPage() {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Layout adapts to phone / tablet / desktop
  const device = useDevice();
  const isPhone = device === 'mobile';
  // On phone and tablet the map and the list compete for space, so they are
  // shown one at a time instead of side by side.
  const [pane, setPane] = useState<'list' | 'map'>('list');
  const splitView = device === 'desktop';

  // "Completar" questionnaire
  const [completeFor, setCompleteFor] = useState<Territory | null>(null);
  const [completeForm, setCompleteForm] = useState({ hours: '', houses: '' });

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Modo dibujo territorio
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [form, setForm] = useState({ number: '', name: '', color: PALETTE[0], group_name: '' });

  // Modo dibujo límite congregación
  const [boundary, setBoundary] = useState<LatLng[] | null>(null);
  const [drawingBoundary, setDrawingBoundary] = useState(false);
  const [boundaryDraft, setBoundaryDraft] = useState<LatLng[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [tRes, uRes, bRes] = await Promise.all([
        fetch('/api/territories'),
        fetch('/api/users'),
        fetch('/api/congregation/boundary'),
      ]);
      const tJson = await tRes.json();
      const uJson = await uRes.json();
      const bJson = await bRes.json();
      if (tJson.migration_applied === false) setMigrationPending(true);
      setTerritories(tJson.territories || []);
      setUsers((uJson.users || []).map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      setBoundary(bJson.boundary ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar territorios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchAssignments = useCallback(async (territoryId: string) => {
    const res = await fetch(`/api/territory-assignments?territory_id=${territoryId}`);
    const json = await res.json();
    setAssignments(json.assignments || []);
  }, []);

  const selected = selectedId ? territories.find(t => t.id === selectedId) || null : null;

  const visible = statusFilter === 'all'
    ? territories
    : territories.filter(t => t.status === statusFilter);

  const counts = {
    all: territories.length,
    available: territories.filter(t => t.status === 'available').length,
    assigned: territories.filter(t => t.status === 'assigned').length,
    completed: territories.filter(t => t.status === 'completed').length,
  };

  useEffect(() => {
    if (selectedId) fetchAssignments(selectedId);
    else setAssignments([]);
    setShowHistory(false);
  }, [selectedId, fetchAssignments]);

  // ── Dibujo ──────────────────────────────────────────────────────────────
  const startDraw = () => {
    setSelectedId(null);
    setDraft([]);
    setForm({ number: '', name: '', color: PALETTE[0], group_name: '' });
    setDrawing(true);
  };
  const cancelDraw = () => { setDrawing(false); setDraft([]); };
  const addVertex = (ll: LatLng) => setDraft(prev => [...prev, ll]);
  const undoVertex = () => setDraft(prev => prev.slice(0, -1));

  // ── Límite congregación ─────────────────────────────────────────────────
  const startBoundary = () => {
    setSelectedId(null);
    setDrawing(false);
    setDraft([]);
    setBoundaryDraft([]);
    setDrawingBoundary(true);
  };
  const cancelBoundary = () => { setDrawingBoundary(false); setBoundaryDraft([]); };
  const addBoundaryVertex = (ll: LatLng) => setBoundaryDraft(prev => [...prev, ll]);
  const saveBoundary = async () => {
    if (boundaryDraft.length < 3) { alert('Marca al menos 3 puntos para definir el límite.'); return; }
    const res = await fetch('/api/congregation/boundary', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boundary: boundaryDraft }),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.error || 'No se pudo guardar'); return; }
    setBoundary(json.boundary);
    setDrawingBoundary(false);
    setBoundaryDraft([]);
  };
  const clearBoundary = async () => {
    if (!confirm('¿Eliminar el límite del territorio de la congregación?')) return;
    await fetch('/api/congregation/boundary', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boundary: null }) });
    setBoundary(null);
  };

  const saveTerritory = async () => {
    if (draft.length < 3) { alert('Marca al menos 3 puntos en el mapa para cerrar el territorio.'); return; }
    if (!form.name.trim()) { alert('Ponle un nombre al territorio.'); return; }
    const res = await fetch('/api/territories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: form.number ? Number(form.number) : null,
        name: form.name.trim(),
        color: form.color,
        coordinates: draft,
        group_name: form.group_name.trim() || null,
      }),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.error || 'No se pudo guardar'); return; }
    setDrawing(false);
    setDraft([]);
    await fetchAll();
    setSelectedId(json.territory?.id || null);
  };

  // ── Edición / asignación ────────────────────────────────────────────────
  const patchSelected = async (patch: Partial<Territory> & { image_data?: string | null }) => {
    if (!selected) return;
    // image_data is transport-only (it rides along to the notification) and is
    // not a column on the territory, so keep it out of local state.
    const { image_data: _img, ...localPatch } = patch;
    setTerritories(prev => prev.map(t => t.id === selected.id ? { ...t, ...localPatch } : t));
    const res = await fetch(`/api/territories/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const json = await res.json();
      setTerritories(prev => prev.map(t => t.id === selected.id
        ? { ...json.territory, assigned_name: users.find(u => u.id === json.territory.assigned_to)?.name || null }
        : t));
      // Refresh assignments history after any patch
      await fetchAssignments(selected.id);
    }
  };

  /**
   * Assigning sends the publisher a platform message (and a WhatsApp message
   * when the congregation enabled it and the profile has a phone). A snapshot
   * of the territory outline travels with it so they can see where to go.
   */
  const assignTo = async (userId: string | null) => {
    if (!selected) return;
    const patch: Partial<Territory> & { image_data?: string | null } = {
      assigned_to: userId,
      status: userId ? 'assigned' : 'available',
      visit_start: userId ? (selected.visit_start || new Date().toISOString().slice(0, 10)) : null,
    };
    if (userId) patch.image_data = renderTerritoryImage(selected);
    await patchSelected(patch);
  };

  /**
   * Completing a territory asks how long it took and how many houses were
   * visited, stores that on the assignment history row, then releases the
   * territory so it can be handed to someone else.
   */
  const submitCompletion = async () => {
    if (!completeFor) return;
    const today = new Date().toISOString().slice(0, 10);
    const hours = completeForm.hours ? Number(completeForm.hours) : null;
    const houses = completeForm.houses ? Number(completeForm.houses) : null;

    await patchSelected({
      visit_end: today,
      status: 'completed',
      completion_hours: hours,
      completion_houses: houses,
    });
    setCompleteFor(null);
    setCompleteForm({ hours: '', houses: '' });
    // Release afterwards so the history row keeps the publisher's name.
    await patchSelected({ assigned_to: null, visit_start: null, visit_end: null, status: 'available' });
  };

  const deleteAssignment = async (aId: string) => {
    if (!confirm('¿Eliminar este registro del historial?')) return;
    await fetch(`/api/territory-assignments/${aId}`, { method: 'DELETE' });
    if (selectedId) await fetchAssignments(selectedId);
  };

  const deleteTerritory = async (id: string) => {
    if (!confirm('¿Eliminar este territorio?')) return;
    await fetch(`/api/territories/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    await fetchAll();
  };

  // ── S-13 Export ─────────────────────────────────────────────────────────
  const handleExport = async (format: 'pdf' | 'xlsx' | 'docx') => {
    setExportOpen(false);
    setExporting(true);
    try {
      const year = currentServiceYear();
      // Fetch all assignments for all territories
      const res = await fetch('/api/territory-assignments');
      const json = await res.json();
      const allAssignments: Assignment[] = json.assignments || [];

      if (format === 'pdf') await exportPdf(territories, allAssignments, year);
      else if (format === 'xlsx') await exportXlsx(territories, allAssignments, year);
      else await exportDocx(territories, allAssignments, year);
    } catch (e) {
      alert('Error al exportar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-screen h-[100dvh] bg-slate-50 dark:bg-gray-900 dark:text-gray-100 text-sm pb-[52px] md:pb-0 overflow-hidden">
      <IconSidebar />
      <SyncStatus />

      {/* Panel izquierdo: lista + edición */}
      <div className="w-full md:w-80 h-auto md:h-full max-h-[45vh] md:max-h-none flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between gap-2">
          <h1 className="font-bold text-slate-800 dark:text-gray-100 flex items-center gap-2"><MapPin size={18} className="text-sky-600" /> Territorios</h1>
          <div className="flex gap-1.5">
            {!drawing && !drawingBoundary && (
              <button onClick={startDraw} className="flex items-center gap-1 bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg">
                <Plus size={14} /> Nuevo
              </button>
            )}
            {!drawing && !drawingBoundary && (
              <button onClick={startBoundary} title="Definir límite de la congregación"
                className="flex items-center gap-1 bg-slate-500 hover:bg-slate-600 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg">
                <SquareDashed size={14} /> Límite
              </button>
            )}
            {!drawing && !drawingBoundary && boundary && (
              <button onClick={clearBoundary} title="Eliminar límite" className="text-slate-400 hover:text-red-500 px-1">
                <X size={14} />
              </button>
            )}
          </div>

        </div>

        {migrationPending && (
          <div className="m-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-amber-800 text-xs">
            Tabla <code>territories</code> no existe aún. Ejecuta <code>sql/territories_schema.sql</code> en el SQL Editor de Supabase y recarga.
          </div>
        )}
        {error && <div className="m-3 p-2 rounded bg-red-50 dark:bg-red-950/30 text-red-700 text-xs">{error}</div>}

        {/* Panel dibujo límite */}
        {drawingBoundary && (
          <div className="m-3 p-3 rounded-lg border border-slate-300 bg-slate-50 dark:bg-gray-700 space-y-2">
            <p className="text-xs text-slate-700 dark:text-gray-200 flex items-center gap-1.5 font-medium">
              <SquareDashed size={13} /> Marca el límite del territorio de la congregación ({boundaryDraft.length} puntos)
            </p>
            <p className="text-[11px] text-slate-500">Este polígono se mostrará en gris punteado como referencia visual.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setBoundaryDraft(prev => prev.slice(0, -1))} disabled={!boundaryDraft.length} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"><Undo2 size={13} /> Deshacer</button>
              <button onClick={saveBoundary} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-slate-600 hover:bg-slate-700 text-white"><Save size={13} /> Guardar</button>
              <button onClick={cancelBoundary} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200"><X size={13} /> Cancelar</button>
            </div>
          </div>
        )}

        {/* Formulario de dibujo */}
        {drawing && (
          <div className="m-3 p-3 rounded-lg border border-sky-200 bg-sky-50 dark:bg-sky-950/30 space-y-2">
            <p className="text-xs text-sky-800 flex items-center gap-1.5 font-medium">
              <Crosshair size={13} /> Haz clic en el mapa para marcar el polígono ({draft.length} puntos)
            </p>
            <div className="flex gap-2">
              <input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder="N°" inputMode="numeric"
                className="w-14 border border-slate-300 dark:border-gray-600 rounded px-2 py-1 text-sm" />
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre del territorio"
                className="flex-1 border border-slate-300 dark:border-gray-600 rounded px-2 py-1 text-sm" />
            </div>
            <input value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })} placeholder="Grupo (opcional)"
              className="w-full border border-slate-300 dark:border-gray-600 rounded px-2 py-1 text-sm" />
            <div className="flex gap-1.5">
              {PALETTE.map(c => (
                <button key={c} onClick={() => setForm({ ...form, color: c })}
                  className={`w-5 h-5 rounded-full border-2 ${form.color === c ? 'border-slate-800' : 'border-white'}`} style={{ background: c }} />
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={undoVertex} disabled={!draft.length} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-40"><Undo2 size={13} /> Deshacer</button>
              <button onClick={saveTerritory} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white"><Check size={13} /> Guardar</button>
              <button onClick={cancelDraw} className="flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200"><X size={13} /> Cancelar</button>
            </div>
          </div>
        )}

        {/* Filtro por estado */}
        {!drawing && !drawingBoundary && (
          <div className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 flex gap-1 overflow-x-auto">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`shrink-0 flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border transition-colors
                  ${statusFilter === f.value
                    ? 'bg-sky-600 border-sky-600 text-white'
                    : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-600'}`}
              >
                {f.label}
                <span className={`text-[10px] ${statusFilter === f.value ? 'text-white/80' : 'text-slate-400'}`}>
                  {counts[f.value]}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-slate-400 text-center text-xs">Cargando…</p>
          ) : territories.length === 0 && !drawing ? (
            <p className="p-4 text-slate-400 text-center text-xs">Sin territorios. Crea el primero con "Nuevo".</p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-slate-400 text-center text-xs">
              No hay territorios {FILTERS.find(f => f.value === statusFilter)?.label.toLowerCase()}.
            </p>
          ) : (
            visible.map(t => (
              <button key={t.id} onClick={() => { setSelectedId(t.id); if (!splitView) setPane('map'); }}
                className={`w-full text-left px-4 ${isPhone ? 'py-3' : 'py-2.5'} border-b border-slate-100 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center gap-2.5 ${selectedId === t.id ? 'bg-sky-50 dark:bg-sky-950/30' : ''}`}>
                <span className="w-3.5 h-3.5 rounded-sm flex-shrink-0" style={{ background: t.color }} />
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-slate-800 dark:text-gray-100 truncate block">{t.number != null ? `${t.number}. ` : ''}{t.name}</span>
                  <span className="flex items-center gap-2">
                    {t.assigned_name && <span className="text-[11px] text-slate-500">{t.assigned_name}</span>}
                    {t.pairs_count ? (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Users2 size={10} />{t.pairs_count}</span>
                    ) : null}
                  </span>
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLOR[t.status]}`}>{STATUS_LABEL[t.status]}</span>
              </button>
            ))
          )}
        </div>

        {/* S-13 Export — footer strip (avoids header overflow) */}
        {!drawing && !drawingBoundary && territories.length > 0 && (
          <div className="border-t border-slate-200 dark:border-gray-700 px-3 py-2 bg-slate-50 dark:bg-gray-800/60 relative">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex-1">Reporte S-13</span>
              {[
                { fmt: 'pdf' as const, icon: <FileText size={12} />, label: 'PDF' },
                { fmt: 'xlsx' as const, icon: <FileSpreadsheet size={12} />, label: 'XLSX' },
                { fmt: 'docx' as const, icon: <FileText size={12} />, label: 'DOCX' },
              ].map(opt => (
                <button
                  key={opt.fmt}
                  onClick={() => handleExport(opt.fmt)}
                  disabled={exporting}
                  className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
                >
                  {opt.icon} {exporting ? '…' : opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Detalle del seleccionado */}
        {selected && !drawing && (
          <div className={`border-t border-slate-200 dark:border-gray-700 p-3 space-y-2 bg-slate-50 dark:bg-gray-800/50 overflow-y-auto
            ${splitView ? 'max-h-[55vh]' : 'max-h-[50vh]'}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 dark:text-gray-100">{selected.number != null ? `${selected.number}. ` : ''}{selected.name}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setShowHistory(h => !h)}
                  title="Historial de asignaciones"
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${showHistory ? 'bg-sky-100 text-sky-700' : 'text-slate-400 hover:text-sky-600'}`}
                >
                  <History size={13} /> {assignments.length > 0 && <span className="font-medium">{assignments.length}</span>}
                </button>
                <button onClick={() => deleteTerritory(selected.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
              </div>
            </div>

            {/* Historial S-13 */}
            {showHistory && (
              <div className="rounded-lg border border-slate-200 dark:border-gray-600 overflow-hidden">
                <div className="bg-slate-100 dark:bg-gray-700 px-2 py-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                  Historial S-13
                </div>
                {assignments.length === 0 ? (
                  <p className="px-3 py-2 text-[11px] text-slate-400">Sin registros aún</p>
                ) : (
                  assignments.map((a, i) => (
                    <div key={a.id} className="flex items-start gap-2 px-3 py-1.5 border-t border-slate-100 dark:border-gray-700 first:border-0">
                      <span className="text-[10px] text-slate-400 w-4 shrink-0">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 dark:text-gray-100 truncate">{a.assigned_name}</p>
                        <p className="text-[10px] text-slate-500">
                          {fmt(a.assigned_date)} → {a.completed_date ? fmt(a.completed_date) : <span className="text-amber-500">En curso</span>}
                        </p>
                      </div>
                      <button onClick={() => deleteAssignment(a.id)} className="text-slate-300 hover:text-red-500 shrink-0"><X size={11} /></button>
                    </div>
                  ))
                )}
              </div>
            )}

            <label className="block text-[11px] text-slate-500">Asignar a
              <select value={selected.assigned_to || ''} onChange={e => assignTo(e.target.value || null)}
                className="w-full mt-0.5 border border-slate-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800">
                <option value="">— sin asignar —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>

            <div className="flex gap-2">
              <label className="flex-1 text-[11px] text-slate-500">Desde
                <input type="date" value={selected.visit_start || ''} onChange={e => patchSelected({ visit_start: e.target.value || null })}
                  className="w-full mt-0.5 border border-slate-300 dark:border-gray-600 rounded px-1.5 py-1 text-xs bg-white dark:bg-gray-800" />
              </label>
              <label className="flex-1 text-[11px] text-slate-500">Hasta
                <input type="date" value={selected.visit_end || ''} onChange={e => patchSelected({ visit_end: e.target.value || null })}
                  className="w-full mt-0.5 border border-slate-300 dark:border-gray-600 rounded px-1.5 py-1 text-xs bg-white dark:bg-gray-800" />
              </label>
            </div>

            <label className="block text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><Users2 size={11} /> Parejas asignadas</span>
              <input
                type="number" min={1} max={99} inputMode="numeric"
                value={selected.pairs_count ?? ''}
                onChange={e => patchSelected({ pairs_count: e.target.value ? Number(e.target.value) : null })}
                placeholder="Número de parejas que trabajarán el territorio"
                className="w-full mt-0.5 border border-slate-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
              />
            </label>

            {/* Completar y liberar button */}
            {selected.assigned_to && (
              <button
                onClick={() => { setCompleteFor(selected); setCompleteForm({ hours: '', houses: '' }); }}
                className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                <Check size={13} /> Completar y liberar territorio
              </button>
            )}

            <label className="block text-[11px] text-slate-500">Estado
              <select
                value={selected.status}
                onChange={e => {
                  const next = e.target.value as Territory['status'];
                  // Switching to "Completado" asks for the effort figures first.
                  if (next === 'completed') {
                    setCompleteFor(selected);
                    setCompleteForm({ hours: '', houses: '' });
                  } else {
                    patchSelected({ status: next });
                  }
                }}
                className="w-full mt-0.5 border border-slate-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800">
                <option value="available">Disponible</option>
                <option value="assigned">Asignado</option>
                <option value="completed">Completado</option>
              </select>
            </label>

            <label className="block text-[11px] text-slate-500">Nota
              <textarea value={selected.note || ''} onChange={e => patchSelected({ note: e.target.value || null })} rows={2}
                className="w-full mt-0.5 border border-slate-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 resize-none" />
            </label>
          </div>
        )}
      </div>

      {/* Mapa */}
      <div className={`flex-1 relative ${splitView || pane === 'map' || drawing || drawingBoundary ? 'block' : 'hidden'} w-full h-full min-h-0 min-w-0`}>
        <TerritoryMap
          territories={visible}
          selectedId={selectedId}
          drawing={drawing || drawingBoundary}
          draftCoords={drawingBoundary ? boundaryDraft : draft}
          draftColor={drawingBoundary ? '#6b7280' : form.color}
          onMapClick={drawingBoundary ? addBoundaryVertex : addVertex}
          onSelect={setSelectedId}
          boundary={boundary}
          drawingBoundary={drawingBoundary}
        />
      </div>

      {/* Conmutador lista/mapa — sólo en celular y tableta */}
      {!splitView && !drawing && !drawingBoundary && (
        <div className="fixed bottom-[60px] left-1/2 -translate-x-1/2 z-[1000] flex rounded-full shadow-lg overflow-hidden border border-slate-200 dark:border-gray-600">
          {([['list', 'Lista', <List key="l" size={14} />], ['map', 'Mapa', <MapIcon key="m" size={14} />]] as const).map(([v, label, icon]) => (
            <button
              key={v}
              onClick={() => setPane(v as 'list' | 'map')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors
                ${pane === v ? 'bg-sky-600 text-white' : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300'}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      )}

      {/* Cuestionario al completar un territorio */}
      {completeFor && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setCompleteFor(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-800 dark:text-gray-100">
                Completar territorio {completeFor.number != null ? `${completeFor.number}. ` : ''}{completeFor.name}
              </h2>
              <button onClick={() => setCompleteFor(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            <label className="block text-xs text-slate-500 dark:text-gray-400">
              ¿Cuánto tiempo se requirió para completarlo? (horas)
              <input
                type="number" min={0} step={0.5} inputMode="decimal" autoFocus
                value={completeForm.hours}
                onChange={e => setCompleteForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="Ej. 6.5"
                className="w-full mt-1 border border-slate-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100"
              />
            </label>

            <label className="block text-xs text-slate-500 dark:text-gray-400">
              ¿Cuántas casas se visitaron?
              <input
                type="number" min={0} inputMode="numeric"
                value={completeForm.houses}
                onChange={e => setCompleteForm(f => ({ ...f, houses: e.target.value }))}
                placeholder="Ej. 120"
                className="w-full mt-1 border border-slate-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setCompleteFor(null)}
                className="flex-1 text-xs px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 dark:text-gray-200 hover:bg-slate-200">
                Cancelar
              </button>
              <button onClick={submitCompletion}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
                <Check size={13} /> Guardar y liberar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

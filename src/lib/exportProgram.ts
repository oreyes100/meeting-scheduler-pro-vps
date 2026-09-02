// Programa mensual (S-140 / combinado) — exporta PDF/DOCX/XLSX con el MISMO
// formato que el reporte de impresión: cabecera teal por semana, separadores de
// color (ámbar tras Tesoros, marrón tras "Seamos mejores maestros"), "Sala
// principal", Estudio bíblico, limpieza/hospitalidad, y columna de fin de
// semana en modo combinado.

export interface ProgramPartView {
  num: number;
  title: string;
  dur: number | string;
  name: string;
  sep: 'amber' | 'maroon' | null;
  bible: boolean;
}

export interface ProgramWeekendView {
  date: string;
  chairman: string;
  talk: string;
  speaker: string;
  congregation: string;
  conductor: string;
  reader: string;
  cleaning: string;
  hospitality: string;
}

export interface ProgramWeek {
  weekLabel: string;
  scripture?: string;
  isAssembly?: boolean;
  assemblyLabel?: string;
  chairman?: string;
  opening?: string;
  closing?: string;
  parts?: ProgramPartView[];
  cbs?: string;
  cbsNum?: number | null;
  cbsDur?: number | string;
  cleaning?: string;
  hospitality?: string;
  weekend?: ProgramWeekendView;
}

export interface ProgramExportOptions {
  title: string;
  congName: string;
  subtitle: string;
  printedOn: string;
  combined: boolean;
}

function unwrap<T>(mod: T): T {
  if (mod && typeof mod === 'object' && 'default' in (mod as any)) {
    const d = (mod as any).default;
    if (d && typeof d === 'object' && Object.keys(d).length > 0) return d as T;
  }
  return mod;
}

const TEAL_HEX = '3D7D8E';
const AMBER_HEX = 'C9A227';
const MAROON_HEX = '7C2230';
const YELLOW_HEX = 'FFF35C';
const WHITE_HEX = 'FFFFFF';
const SLATE_HEX = '334155';

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

function fileBase(title: string, subtitle?: string): string {
  return `${title}${subtitle ? ` - ${subtitle}` : ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
}

function estimateWeekHeight(wk: ProgramWeek, combined: boolean): number {
  if (wk.isAssembly) return 14;
  const leftPartsH = 14 // header (single or 2-line)
    + (wk.parts?.length || 0) * 5.2
    + (wk.parts?.filter(p => p.sep).length || 0) * 2
    + (wk.parts?.filter(p => p.bible).length || 0) * 4
    + (wk.cbsNum != null ? 5.2 : 0)
    + 8 // yellow footer
    + 6; // margin
  if (!combined || !wk.weekend) return leftPartsH;
  const rightH = 14 + 6 * 5.2 + 8 + 6;
  return Math.max(leftPartsH, rightH);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────
export async function exportProgramPdf(weeks: ProgramWeek[], opts: ProgramExportOptions) {
  const jsPDFMod = await import('jspdf');
  const jsPDFLib: any = unwrap(jsPDFMod);
  const JsPDF = jsPDFLib.jsPDF ?? jsPDFLib;

  const combined = opts.combined;
  const orientation = combined ? 'landscape' : 'portrait';
  const doc = new JsPDF({ orientation, unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 10;
  const contentW = pageW - 2 * M;
  const leftW = combined ? contentW * 0.62 : contentW;
  const rightX = M + leftW + (combined ? 6 : 0);
  const rightW = combined ? contentW - leftW - 6 : 0;

  let y = M;
  const newPage = () => {
    doc.addPage();
    y = M;
    // Repetir encabezado de documento en páginas siguientes
    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${opts.title} — ${opts.congName} (${opts.subtitle || ''})`, M, y + 3);
    y += 8;
  };

  const drawTealHeader = (x: number, w: number, mainTitle: string, presText?: string, oracionText?: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const mainWidth = doc.getTextWidth(mainTitle);
    const rightInfo = [
      presText ? `Pres: ${presText}` : '',
      oracionText ? `Orac: ${oracionText}` : ''
    ].filter(Boolean).join('   ');
    const rightWidth = rightInfo ? doc.getTextWidth(rightInfo) : 0;

    const needsTwoLines = (mainWidth + rightWidth + 8) > w;
    const barH = needsTwoLines ? 11 : 7;

    doc.setFillColor(61, 125, 142);
    doc.rect(x, y, w, barH, 'F');
    doc.setTextColor(255, 255, 255);

    if (needsTwoLines) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(mainTitle, x + 2, y + 4.2);
      if (rightInfo) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 243, 92); // Amarillo suave de alto contraste
        doc.text(rightInfo, x + 2, y + 8.8);
      }
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(mainTitle, x + 2, y + 4.7);
      if (rightInfo) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text(rightInfo, x + w - 2, y + 4.7, { align: 'right' });
      }
    }
    y += barH;
  };

  const sepLine = (x: number, w: number, hex: string) => {
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    doc.setFillColor(r, g, b);
    doc.rect(x, y, w, 1, 'F');
    y += 2;
  };

  const line = (x: number, w: number, left: string, right: string, size = 8.5) => {
    doc.setTextColor(35, 35, 35);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.text(left, x + 1, y + 3.5);
    if (right) {
      doc.setFont('helvetica', 'bold');
      doc.text(right, x + w - 1, y + 3.5, { align: 'right' });
    }
    y += 5;
  };

  const label = (x: number, text: string) => {
    doc.setTextColor(70, 80, 90);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(text.toUpperCase(), x + 1, y + 3.2);
    y += 4;
  };

  // Encabezado principal de la primera página
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(opts.title, M, y + 4);
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(opts.congName, pageW - M, y + 4, { align: 'right' });
  y += 6;
  if (opts.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(opts.subtitle, M, y + 3);
    y += 5;
  }

  for (const wk of weeks) {
    const requiredH = estimateWeekHeight(wk, combined);
    if (y + requiredH > pageH - M) {
      newPage();
    }

    if (wk.isAssembly) {
      doc.setFillColor(61, 125, 142);
      doc.rect(M, y, contentW, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${wk.weekLabel}  —  ${wk.assemblyLabel ?? 'ASAMBLEA'}`, M + 2, y + 4.7);
      y += 10;
      continue;
    }

    if (combined) {
      drawTealHeader(M, leftW, wk.weekLabel + (wk.scripture ? ` | ${wk.scripture}` : ''), wk.chairman, wk.opening);
      if (wk.weekend) {
        doc.setFillColor(61, 125, 142);
        doc.rect(rightX, y - (y - (y - 7)), rightW, 7, 'F'); // sincronizar cabecera fin de semana
        // Se dibuja en la misma altura inicial del bloque
      }
      const bodyStart = y;
      for (const p of wk.parts ?? []) {
        if (p.sep === 'amber') sepLine(M, leftW, AMBER_HEX);
        else if (p.sep === 'maroon') sepLine(M, leftW, MAROON_HEX);
        if (p.bible) label(M, 'Sala principal');
        line(M, leftW, `${p.num}. ${p.title} (${p.dur} min.)`, p.name);
      }
      if (wk.cbsNum != null) line(M, leftW, `${wk.cbsNum}. Estudio bíblico (${wk.cbsDur} min.)`, wk.cbs || '');
      
      // Footer entre semana
      doc.setFillColor(255, 243, 92);
      doc.rect(M, y, leftW, 6.5, 'F');
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(`LIMPIEZA ${wk.cleaning}    HOSPITALIDAD ${wk.hospitality}`, M + 1.5, y + 4.3);
      doc.setFont('helvetica', 'bold');
      doc.text(`Oración: ${wk.closing || '—'}`, M + leftW - 1.5, y + 4.3, { align: 'right' });
      y += 8.5;
      const leftFinalY = y;

      if (wk.weekend) {
        let rightY = bodyStart;
        // Dibujar cabecera derecha fin de semana
        doc.setFillColor(61, 125, 142);
        doc.rect(rightX, rightY - 7, rightW, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.text(`Fin de Semana — ${wk.weekend.date}`, rightX + 2, rightY - 2.3);

        const w = wk.weekend;
        const wkLine = (lab: string, val: string) => {
          doc.setTextColor(50, 50, 50);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(lab, rightX + 1, rightY + 3.5);
          doc.setFont('helvetica', 'normal');
          doc.text(val || '—', rightX + 24, rightY + 3.5);
          rightY += 5;
        };
        wkLine('Presidente', w.chairman);
        wkLine('Discurso', w.talk);
        wkLine('Orador', w.speaker);
        wkLine('Congregación', w.congregation);
        wkLine('Conductor', w.conductor);
        wkLine('Lector', w.reader);

        doc.setFillColor(255, 243, 92);
        doc.rect(rightX, rightY, rightW, 6.5, 'F');
        doc.setTextColor(20, 20, 20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(`LIMPIEZA ${w.cleaning}   HOSP ${w.hospitality}`, rightX + 1.5, rightY + 4.3);
        rightY += 8.5;
        y = Math.max(leftFinalY, rightY);
      }
      y += 3;
    } else {
      drawTealHeader(M, contentW, wk.weekLabel + (wk.scripture ? ` | ${wk.scripture}` : ''), wk.chairman, wk.opening);
      for (const p of wk.parts ?? []) {
        if (p.sep === 'amber') sepLine(M, contentW, AMBER_HEX);
        else if (p.sep === 'maroon') sepLine(M, contentW, MAROON_HEX);
        if (p.bible) label(M, 'Sala principal');
        line(M, contentW, `${p.num}. ${p.title} (${p.dur} min.)`, p.name);
      }
      if (wk.cbsNum != null) line(M, contentW, `${wk.cbsNum}. Estudio bíblico (${wk.cbsDur} min.)`, wk.cbs || '');
      
      doc.setFillColor(255, 243, 92);
      doc.rect(M, y, contentW, 6.5, 'F');
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(`LIMPIEZA ${wk.cleaning}    HOSPITALIDAD ${wk.hospitality}`, M + 1.5, y + 4.3);
      doc.setFont('helvetica', 'bold');
      doc.text(`Oración: ${wk.closing || '—'}`, M + contentW - 1.5, y + 4.3, { align: 'right' });
      y += 10;
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(`Impreso ${opts.printedOn}`, pageW - M, pageH - 4, { align: 'right' });

  const blob: Blob = await Promise.resolve(doc.output('blob'));
  downloadBlob(blob, `${fileBase(opts.title, opts.subtitle)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX
// ─────────────────────────────────────────────────────────────────────────────
export async function exportProgramXlsx(weeks: ProgramWeek[], opts: ProgramExportOptions) {
  const XLSX: any = unwrap(await import('xlsx-js-style'));

  const aoa: any[][] = [];
  const merges: any[] = [];
  const styles: Record<string, any> = {};
  const COLS = 12;
  const ensureRow = (r: number) => { while (aoa.length <= r) aoa.push(Array(COLS).fill('')); };
  const setCell = (r: number, c: number, v: any) => { ensureRow(r); aoa[r][c] = v; };
  const setS = (r: number, c: number, s: any) => { styles[`${r},${c}`] = s; };
  const fill = (hex: string, white = false) => ({
    fill: { fgColor: { rgb: hex } },
    font: { bold: true, color: { rgb: white ? WHITE_HEX : SLATE_HEX } },
    alignment: { vertical: 'center', wrapText: true }
  });
  const plain = (bold = false) => ({
    font: bold ? { bold: true } : undefined,
    alignment: { vertical: 'center' }
  });

  setCell(0, 0, opts.title);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } });
  setS(0, 0, { font: { bold: true, size: 14 }, alignment: { vertical: 'center' } });
  setCell(1, 0, opts.subtitle);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 4 } });
  setS(1, 0, { font: { italic: true, color: { rgb: '555555' } } });

  const LEFT = 0, RIGHT = 6;

  for (const wk of weeks) {
    if (wk.isAssembly) {
      const r = aoa.length;
      setCell(r, 0, `${wk.weekLabel}  —  ${wk.assemblyLabel ?? 'ASAMBLEA'}`);
      merges.push({ s: { r, c: 0 }, e: { r, c: 4 } });
      setS(r, 0, fill(TEAL_HEX, true));
      continue;
    }
    if (opts.combined) {
      const headerR = aoa.length;
      // Fila 1 cabecera: Título de la semana y Domingo
      setCell(headerR, LEFT, wk.weekLabel + (wk.scripture ? ` | ${wk.scripture}` : ''));
      setS(headerR, LEFT, fill(TEAL_HEX, true));
      merges.push({ s: { r: headerR, c: LEFT }, e: { r: headerR, c: LEFT + 4 } });
      
      setCell(headerR, RIGHT, `Domingo ${wk.weekend?.date ?? '—'}`);
      setS(headerR, RIGHT, fill(TEAL_HEX, true));
      merges.push({ s: { r: headerR, c: RIGHT }, e: { r: headerR, c: RIGHT + 5 } });

      // Fila 2 cabecera: Presidente y Oración explícitos con alto contraste
      const subHeaderR = headerR + 1;
      setCell(subHeaderR, LEFT, `Presidente: ${wk.chairman || '—'}    Oración: ${wk.opening || '—'}`);
      setS(subHeaderR, LEFT, { fill: { fgColor: { rgb: '2D5D6E' } }, font: { bold: true, color: { rgb: WHITE_HEX } } });
      merges.push({ s: { r: subHeaderR, c: LEFT }, e: { r: subHeaderR, c: LEFT + 4 } });
      
      setCell(subHeaderR, RIGHT, 'Reunión Pública y Estudio de La Atalaya');
      setS(subHeaderR, RIGHT, { fill: { fgColor: { rgb: '2D5D6E' } }, font: { bold: true, color: { rgb: WHITE_HEX } } });
      merges.push({ s: { r: subHeaderR, c: RIGHT }, e: { r: subHeaderR, c: RIGHT + 5 } });

      let lr = subHeaderR + 1;
      for (const p of wk.parts ?? []) {
        if (p.sep === 'amber') { setCell(lr, LEFT, ''); setS(lr, LEFT, fill(AMBER_HEX)); merges.push({ s: { r: lr, c: LEFT }, e: { r: lr, c: LEFT + 4 } }); lr++; }
        else if (p.sep === 'maroon') { setCell(lr, LEFT, ''); setS(lr, LEFT, fill(MAROON_HEX)); merges.push({ s: { r: lr, c: LEFT }, e: { r: lr, c: LEFT + 4 } }); lr++; }
        if (p.bible) { setCell(lr, LEFT, 'SALA PRINCIPAL'); setS(lr, LEFT, { font: { bold: true, color: { rgb: SLATE_HEX } } }); lr++; }
        setCell(lr, LEFT, `${p.num}. ${p.title} (${p.dur} min.)`); setS(lr, LEFT, plain());
        setCell(lr, LEFT + 4, p.name); setS(lr, LEFT + 4, plain(true));
        lr++;
      }
      if (wk.cbsNum != null) {
        setCell(lr, LEFT, `${wk.cbsNum}. Estudio bíblico (${wk.cbsDur} min.)`); setS(lr, LEFT, plain());
        setCell(lr, LEFT + 4, wk.cbs || ''); setS(lr, LEFT + 4, plain(true));
        lr++;
      }
      setCell(lr, LEFT, `LIMPIEZA ${wk.cleaning}    HOSPITALIDAD ${wk.hospitality}`); setS(lr, LEFT, fill(YELLOW_HEX));
      merges.push({ s: { r: lr, c: LEFT }, e: { r: lr, c: LEFT + 3 } });
      setCell(lr, LEFT + 4, `Oración: ${wk.closing || '—'}`); setS(lr, LEFT + 4, plain(true));
      const leftEnd = lr;

      let rr = subHeaderR + 1;
      const w = wk.weekend;
      if (w) {
        const wkRows: [string, string][] = [
          ['Presidente', w.chairman],
          ['Discurso', w.talk],
          ['Orador', w.speaker],
          ['Congregación', w.congregation],
          ['Conductor', w.conductor],
          ['Lector', w.reader],
        ];
        for (const [lab, val] of wkRows) {
          setCell(rr, RIGHT, lab); setS(rr, RIGHT, { font: { bold: true } });
          setCell(rr, RIGHT + 1, val || '—'); setS(rr, RIGHT + 1, plain());
          merges.push({ s: { r: rr, c: RIGHT + 1 }, e: { r: rr, c: RIGHT + 5 } });
          rr++;
        }
        setCell(rr, RIGHT, `LIMPIEZA ${w.cleaning}  HOSP ${w.hospitality}`); setS(rr, RIGHT, fill(YELLOW_HEX));
        merges.push({ s: { r: rr, c: RIGHT }, e: { r: rr, c: RIGHT + 5 } });
        rr++;
      }
      const endR = Math.max(leftEnd, rr - 1);
      ensureRow(endR);
    } else {
      const headerR = aoa.length;
      setCell(headerR, 0, wk.weekLabel + (wk.scripture ? ` | ${wk.scripture}` : ''));
      setS(headerR, 0, fill(TEAL_HEX, true));
      merges.push({ s: { r: headerR, c: 0 }, e: { r: headerR, c: 2 } });
      
      setCell(headerR, 3, `Presidente: ${wk.chairman || '—'}`);
      setS(headerR, 3, fill(TEAL_HEX, true));
      
      setCell(headerR, 4, `Oración: ${wk.opening || '—'}`);
      setS(headerR, 4, fill(TEAL_HEX, true));

      let r = headerR + 1;
      for (const p of wk.parts ?? []) {
        if (p.sep === 'amber') { setCell(r, 0, ''); setS(r, 0, fill(AMBER_HEX)); merges.push({ s: { r, c: 0 }, e: { r, c: 4 } }); r++; }
        else if (p.sep === 'maroon') { setCell(r, 0, ''); setS(r, 0, fill(MAROON_HEX)); merges.push({ s: { r, c: 0 }, e: { r, c: 4 } }); r++; }
        if (p.bible) { setCell(r, 0, 'SALA PRINCIPAL'); setS(r, 0, { font: { bold: true, color: { rgb: SLATE_HEX } } }); r++; }
        setCell(r, 0, `${p.num}. ${p.title} (${p.dur} min.)`); setS(r, 0, plain());
        merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
        setCell(r, 4, p.name); setS(r, 4, plain(true));
        r++;
      }
      if (wk.cbsNum != null) {
        setCell(r, 0, `${wk.cbsNum}. Estudio bíblico (${wk.cbsDur} min.)`); setS(r, 0, plain());
        merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
        setCell(r, 4, wk.cbs || ''); setS(r, 4, plain(true));
        r++;
      }
      setCell(r, 0, `LIMPIEZA ${wk.cleaning}    HOSPITALIDAD ${wk.hospitality}`); setS(r, 0, fill(YELLOW_HEX));
      merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
      setCell(r, 4, `Oración: ${wk.closing || '—'}`); setS(r, 4, plain(true));
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  for (const key of Object.keys(styles)) {
    const [r, c] = key.split(',').map(Number);
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: aoa[r]?.[c] ?? '' };
    ws[addr].s = styles[key];
  }
  ws['!cols'] = Array.from({ length: COLS }, (_, i) => ({ wch: i === LEFT + 4 || i === RIGHT + 1 ? 28 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Programa');
  XLSX.writeFile(wb, `${fileBase(opts.title, opts.subtitle)}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX
// ─────────────────────────────────────────────────────────────────────────────
export async function exportProgramDocx(weeks: ProgramWeek[], opts: ProgramExportOptions) {
  const docx: any = unwrap(await import('docx'));
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ShadingType } = docx;

  const tealHex = TEAL_HEX;

  const shadePara = (text: string, o: { fill?: string; color?: string; bold?: boolean; size?: number } = {}) =>
    new Paragraph({
      shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
      children: [new TextRun({ text: text || ' ', bold: !!o.bold, color: o.color || '000000', size: o.size || 18 })],
    });

  const cell = (children: any[]) => new TableCell({ children });

  const sectionChildren: any[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: opts.title, bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: `${opts.congName}${opts.subtitle ? '  —  ' + opts.subtitle : ''}`, bold: true, size: 22 })] }),
  ];

  for (const wk of weeks) {
    if (wk.isAssembly) {
      sectionChildren.push(shadePara(`${wk.weekLabel}  —  ${wk.assemblyLabel ?? 'ASAMBLEA'}`, { fill: tealHex, color: 'FFFFFF', bold: true }));
      continue;
    }

    const header = shadePara(wk.weekLabel + (wk.scripture ? ` | ${wk.scripture}` : ''), { fill: tealHex, color: 'FFFFFF', bold: true });
    const presLine = new Paragraph({
      children: [
        new TextRun({ text: 'Presidente: ', bold: true, size: 18 }),
        new TextRun({ text: `${wk.chairman || '—'}      `, size: 18 }),
        new TextRun({ text: 'Oración de apertura: ', bold: true, size: 18 }),
        new TextRun({ text: `${wk.opening || '—'}`, size: 18 }),
      ],
    });
    const footer = shadePara(`LIMPIEZA ${wk.cleaning}    HOSPITALIDAD ${wk.hospitality}    Oración: ${wk.closing || '—'}`, { fill: YELLOW_HEX, bold: true, size: 16 });

    if (opts.combined && wk.weekend) {
      const leftParas: any[] = [header, presLine];
      for (const p of wk.parts ?? []) {
        if (p.sep === 'amber') leftParas.push(shadePara(' ', { fill: AMBER_HEX }));
        else if (p.sep === 'maroon') leftParas.push(shadePara(' ', { fill: MAROON_HEX }));
        if (p.bible) leftParas.push(new Paragraph({ children: [new TextRun({ text: 'SALA PRINCIPAL', bold: true, size: 16 })] }));
        leftParas.push(new Paragraph({ children: [new TextRun({ text: `${p.num}. ${p.title} (${p.dur} min.) — ${p.name || '—'}`, size: 18 })] }));
      }
      if (wk.cbsNum != null) leftParas.push(new Paragraph({ children: [new TextRun({ text: `${wk.cbsNum}. Estudio bíblico (${wk.cbsDur} min.) — ${wk.cbs || '—'}`, size: 18 })] }));
      leftParas.push(footer);

      const w = wk.weekend;
      const rightParas: any[] = [shadePara(`Domingo ${w.date}`, { fill: tealHex, color: 'FFFFFF', bold: true })];
      const wkRows: [string, string][] = [
        ['Presidente', w.chairman],
        ['Discurso', w.talk],
        ['Orador', w.speaker],
        ['Congregación', w.congregation],
        ['Conductor', w.conductor],
        ['Lector', w.reader],
      ];
      for (const [lab, val] of wkRows) {
        rightParas.push(new Paragraph({ children: [new TextRun({ text: `${lab}: `, bold: true, size: 18 }), new TextRun({ text: val || '—', size: 18 })] }));
      }
      rightParas.push(shadePara(`LIMPIEZA ${w.cleaning}  HOSP ${w.hospitality}`, { fill: YELLOW_HEX, bold: true, size: 16 }));

      sectionChildren.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: [6200, 3600],
        rows: [new TableRow({ children: [cell(leftParas), cell(rightParas)] })],
      }));
    } else {
      const partRows: any[] = [];
      const pushSep = (hex: string) => partRows.push(new TableRow({ children: [new TableCell({ columnSpan: 2, shading: { type: ShadingType.CLEAR, fill: hex }, children: [new Paragraph({ children: [new TextRun({ text: '' })] })] })] }));
      for (const p of wk.parts ?? []) {
        if (p.sep === 'amber') pushSep(AMBER_HEX);
        else if (p.sep === 'maroon') pushSep(MAROON_HEX);
        if (p.bible) partRows.push(new TableRow({ children: [new TableCell({ columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: 'SALA PRINCIPAL', bold: true, size: 16 })] })] })] }));
        partRows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${p.num}. ${p.title} (${p.dur} min.)`, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: p.name || '—', bold: true, size: 18 })] })] }),
          ],
        }));
      }
      if (wk.cbsNum != null) partRows.push(new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${wk.cbsNum}. Estudio bíblico (${wk.cbsDur} min.)`, size: 18 })] })] }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: wk.cbs || '—', bold: true, size: 18 })] })] }),
        ],
      }));

      sectionChildren.push(header, presLine);
      if (partRows.length) sectionChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: partRows }));
      sectionChildren.push(footer);
    }
    sectionChildren.push(new Paragraph({ text: '' }));
  }

  sectionChildren.push(new Paragraph({ children: [new TextRun({ text: `Impreso ${opts.printedOn}`, italic: true, color: '888888', size: 16 })] }));

  const doc = new Document({ sections: [{ children: sectionChildren }] });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${fileBase(opts.title, opts.subtitle)}.docx`);
}

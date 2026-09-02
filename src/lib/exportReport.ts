import type { PrintTableOptions } from './printReport';

const TEAL: [number, number, number] = [61, 125, 142];

function fileBase(title: string, subtitle?: string): string {
  return `${title}${subtitle ? ` - ${subtitle}` : ''}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
}

function cellText(c: string | number | null | undefined): string {
  return c == null ? '' : String(c);
}

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

// Resuelve módulos CJS/ESM que llegan envueltos en .default al hacer import()
function unwrap<T>(mod: T): T {
  if (mod && typeof mod === 'object' && 'default' in (mod as any)) {
    const d = (mod as any).default;
    if (d && typeof d === 'object' && Object.keys(d).length > 0) return d as T;
  }
  return mod;
}

export async function exportXlsx({ title, subtitle, columns, rows, sheets }: PrintTableOptions) {
  const raw = await import('xlsx-js-style');
  const XLSX: any = unwrap(raw);
  const wb = XLSX.utils.book_new();
  const makeSheet = (name: string, cols: string[], rs: any[][]) => {
    const data = [cols, ...rs.map(r => r.map(cellText))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = cols.map((c: string, i: number) => ({
      wch: Math.min(40, Math.max(c.length, ...rs.map((r: any[]) => cellText(r[i]).length)) + 2),
    }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };
  if (sheets && sheets.length) {
    for (const s of sheets) makeSheet(s.name, s.columns, s.rows);
  } else {
    makeSheet((subtitle || 'Reporte').slice(0, 31), columns, rows);
  }
  XLSX.writeFile(wb, `${fileBase(title, subtitle)}.xlsx`);
}

export async function exportPdf({ title, congName, subtitle, columns, rows }: PrintTableOptions) {
  const jsPDFMod = await import('jspdf');
  const jsPDFLib: any = unwrap(jsPDFMod);
  const JsPDF = jsPDFLib.jsPDF ?? jsPDFLib;

  const autoTableMod = await import('jspdf-autotable');
  const autoTable: any = (autoTableMod as any).default ?? autoTableMod;

  const doc = new JsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(congName, pageW - 14, 16, { align: 'right' });
  if (subtitle) {
    doc.setTextColor(80, 80, 80);
    doc.text(subtitle, 14, 23);
  }
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: subtitle ? 28 : 22,
    head: [columns],
    body: rows.map(r => r.map(cellText)),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: TEAL, textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [238, 244, 246] },
  });

  // Usar blob + downloadBlob para control explícito del nombre de archivo
  const blob: Blob = await Promise.resolve(doc.output('blob'));
  downloadBlob(blob, `${fileBase(title, subtitle)}.pdf`);
}

export async function exportDocx({ title, congName, subtitle, columns, rows }: PrintTableOptions) {
  const docxMod = await import('docx');
  const docx: any = unwrap(docxMod);
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, HeadingLevel, ShadingType,
  } = docx;

  const tealHex = '3d7d8e';
  const altHex = 'EEF4F6';

  const headerRow = new TableRow({
    children: columns.map((c: string) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: tealHex },
        children: [new Paragraph({
          children: [new TextRun({ text: c, bold: true, color: 'FFFFFF', size: 18 })],
        })],
      })
    ),
  });

  const bodyRows = rows.map((r: any[], i: number) =>
    new TableRow({
      children: r.map(c =>
        new TableCell({
          shading: i % 2 === 1 ? { type: ShadingType.CLEAR, fill: altHex } : undefined,
          children: [new Paragraph({
            children: [new TextRun({ text: cellText(c), size: 18 })],
          })],
        })
      ),
    })
  );

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: title, bold: true })],
        }),
        new Paragraph({ children: [new TextRun({ text: congName, bold: true, size: 22 })] }),
        ...(subtitle ? [new Paragraph({ children: [new TextRun({ text: subtitle, color: '555555', size: 20 })] })] : []),
        new Paragraph({ text: '' }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, ...bodyRows],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${fileBase(title, subtitle)}.docx`);
}

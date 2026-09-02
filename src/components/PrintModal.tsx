'use client';

import React, { useState, useEffect } from 'react';
import { X, Printer, FileText, Calendar, UserCheck, LayoutGrid, FileSpreadsheet, File } from 'lucide-react';
import { buildSlips } from '@/lib/s89Individual';
import {
  downloadS89IndividualPdf, downloadS89IndividualDocx, downloadS89Xlsx, downloadS89Csv,
  PDF_OFFSETS_DEFAULT,
} from '@/lib/exportS89';
import type { PdfOffsets } from '@/lib/exportS89';
import { exportXlsx } from '@/lib/exportReport';
import { exportProgramPdf, exportProgramDocx, exportProgramXlsx, type ProgramWeek } from '@/lib/exportProgram';

const CONGREGATION_NAME = 'La Estación';

// ── Paleta del modelo oficial ────────────────────────────────────────────────
const TEAL = '#3d7d8e';   // barra de cabecera semanal
const AMBER = '#c9a227';  // separador tras Tesoros
const MAROON = '#7c2230';  // separador tras Seamos mejores maestros
const YELLOW = '#fff35c'; // resaltado Limpieza / Hospitalidad

const S89_NOTE =
  'Nota al estudiante: El material de referencia y el punto de estudio para su tarea se pueden encontrar en el Cuaderno de trabajo de la reunión sobre Vida y Ministerio. Por favor, revise las instrucciones para esta parte, tal como se describen en las Instrucciones para nuestra reunión sobre la vida y el ministerio cristianos (S-38).';

interface User {
  id: string;
  name: string;
}

interface Part {
  id: string;
  meeting_id: string;
  class_type: 'main' | 'aux_1' | 'aux_2';
  part_type: string;
  part_number: number;
  title: string;
  duration_minutes: number;
  assigned_user_id: string | null;
  assistant_user_id: string | null;
  study_point?: string;
  student_part_type?: string;
  users?: User | null;
  assistant?: User | null;
  role?: string;
}

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMeeting: any | null;
  allMeetings: any[];
  publishers: any[];
  auxiliaryRooms?: number;
}

type ReportType = 's140' | 'combined' | 's89' | 's89ind' | 'chairman' | 'publishers';

// Lunes (ISO) de la semana de una fecha — para emparejar entre semana ↔ fin de semana.
function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function wkName(p: any): string {
  if (!p) return '';
  return p.name || [p.first_name, p.last_name].filter(Boolean).join(' ');
}
function wkSpeaker(w: any): string {
  if (!w) return '';
  if (w.speaker_type === 'other') return w.other_speaker_name || '';
  if (w.speaker_type === 'visiting') return w.visiting_speaker?.name || '';
  return wkName(w.local_speaker);
}
function wkCongregation(w: any): string {
  if (!w) return '';
  if (w.speaker_type === 'visiting') return w.visiting_speaker?.congregation || '';
  if (w.speaker_type === 'local') return 'Local';
  return '';
}
function wkTalk(w: any): string {
  if (!w) return '';
  if (w.special_talk_title) return w.special_talk_title;
  if (w.outline) return `${w.outline.number} - ${w.outline.title}`;
  return '';
}
function wkHospitality(w: any): string {
  if (!w) return '';
  return wkName(w.hospitality_person) || w.hospitality_text || '';
}

function getName(id: string | null | undefined, publishers: any[]): string {
  if (!id) return '';
  const p = publishers.find((u: any) => u.id === id);
  if (!p) return '';
  return p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
}

function fmtJW(dateStr: string): string {
  return dateStr.replace(/-/g, '/');
}

function getMonthES(yearMonthStr: string): string {
  const [year, month] = yearMonthStr.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

// De-duplica reuniones que caen en la misma semana (puede haber una reunión
// "stub" con fecha errónea —p. ej. un martes— y la reunión real fechada el
// lunes, ambas para la misma semana). Agrupamos por lunes de la semana +
// congregación y nos quedamos con la que tiene más asignaciones, para que el
// reporte mensual nunca muestre una semana vacía ni una semana duplicada.
function dedupeMeetingsByDate(ms: any[]): any[] {
  const byWeek: Record<string, any[]> = {};
  for (const m of ms) {
    const key = `${mondayOf(m.date)}|${m.congregation_id ?? ''}`;
    (byWeek[key] ||= []).push(m);
  }
  return Object.values(byWeek).map(group =>
    group.slice().sort((a, b) => {
      const score = (m: any) =>
        (m.parts || []).filter((p: any) => p.assigned_user_id).length +
        (m.chairman_id ? 1 : 0);
      return score(b) - score(a);
    })[0]
  );
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Etiqueta de la semana: "Semana del lunes 31 de agosto" (día y mes de la
// semana de la reunión), en lugar de la fecha suelta de la reunión.
function weekRangeLabel(iso: string): string {
  const mon = mondayOf(iso);
  const [, mm, dd] = mon.split('-');
  const monthName = MONTHS_ES[Number(mm) - 1] || '';
  return `Semana del lunes ${Number(dd)} de ${monthName}`;
}

// Miércoles de la semana de una reunión. Se usa para decidir a qué mes pertenece
// el programa: una reunión cuyo miércoles cae en el mes seleccionado se incluye,
// así la semana que empieza el lunes 31/ago (miércoles 2/sep) entra en el reporte
// de septiembre aunque la fecha de la reunión sea de agosto.
function wednesdayOf(iso: string): string {
  const mon = mondayOf(iso);
  const d = new Date(mon + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

function meetingInMonth(iso: string, yearMonth: string): boolean {
  return wednesdayOf(iso).startsWith(yearMonth);
}

// Mapa detallado de asignaciones por publicador para el reporte de publicadores.
// Por cada (publicador, semana) guardamos los números de asignación dados y si
// alguna fue en sala auxiliar.
interface PubCell { nums: number[]; aux: boolean; }
function publisherAssignmentDetail(meetings: any[]): {
  detail: Record<string, Record<string, PubCell>>;
  weeks: string[];
} {
  const detail: Record<string, Record<string, PubCell>> = {};
  const weeksSet = new Set<string>();
  const add = (uid: string | null | undefined, date: string, num: number | null, aux: boolean) => {
    if (!uid || !date) return;
    const byWeek = (detail[uid] ||= {});
    const cell = (byWeek[date] ||= { nums: [], aux: false });
    if (num != null) cell.nums.push(num);
    if (aux) cell.aux = true;
    weeksSet.add(date);
  };
  for (const m of meetings) {
    const d = m.date;
    // Roles sin número de asignación: se marcan con palomita.
    add(m.chairman_id, d, null, false);
    add(m.opening_prayer_id, d, null, false);
    add(m.closing_prayer_id, d, null, false);
    add(m.cbs_conductor_id, d, null, false);
    add(m.cbs_reader_id, d, null, false);
    for (const p of (m.parts || []) as Part[]) {
      const aux = p.class_type === 'aux_1' || p.class_type === 'aux_2';
      add(p.assigned_user_id, d, p.part_number, aux);
      add(p.assistant_user_id, d, p.part_number, aux);
    }
  }
  return { detail, weeks: Array.from(weeksSet).sort() };
}

function extractScripture(title: string): string {
  const idx = title.indexOf(':');
  if (idx === -1) return '';
  return title.slice(idx + 1).trim().toUpperCase();
}

function extractLocation(title: string): string {
  const match = title.match(/\(([A-ZÁÉÍÓÚÑÜ\s]+)\)\s*$/);
  return match ? match[1] : '';
}

// Título corto para el programa mensual (formato modelo La Estación).
function programTitle(p: Part): string {
  switch (p.part_type) {
    case 'bible_reading': return 'Lectura de la Biblia';
    case 'cbs': return 'Estudio bíblico';
    case 'spiritual_gems': {
      const sc = extractScripture(p.title);
      return sc ? `Busquemos perlas escondidas ${sc}` : 'Busquemos perlas escondidas';
    }
    case 'student_part': {
      if (p.student_part_type === 'talk') return 'Discurso';
      let t = p.title.split(':')[0];
      t = t.replace(/\s*\([^)]*\)\s*$/, '').trim();
      return t;
    }
    case 'living_part':
      return p.title
        .replace(/\s*\(Análisis con el auditorio\)\s*$/, '')
        .replace(/\s*\(a cargo de un anciano\)\s*$/, '')
        .trim();
    default:
      return p.title;
  }
}

function s89Title(p: Part): string {
  if (p.part_type === 'bible_reading') return 'Lectura de la Biblia';
  if (p.student_part_type === 'talk') return 'Discurso';
  return p.title.replace(/\s*\([A-ZÁÉÍÓÚÑÜ\s]+\)\s*$/, '').trim();
}

function s89Description(p: Part): string {
  const dur = `${p.duration_minutes} min.`;
  if (p.part_type === 'bible_reading') {
    const colonIdx = p.title.indexOf(':');
    const ref = colonIdx >= 0 ? p.title.slice(colonIdx + 1).trim() : (p.study_point || '');
    return `(${dur}) ${ref}`;
  }
  const location = extractLocation(p.title);
  const studyRef = p.study_point || '';
  const parts: string[] = [`(${dur})`];
  if (location) parts.push(`${location}.`);
  if (studyRef) parts.push(studyRef);
  if (!location && !studyRef) parts.push('Ver cuaderno de trabajo de la reunión sobre Vida y Ministerio.');
  return parts.join(' ');
}

// Nombre asignado + ayudante para la columna derecha del programa.
function rowName(p: Part): string {
  const a = p.users?.name || '';
  const b = p.assistant?.name || '';
  return b ? `${a} & ${b}` : a;
}

export default function PrintModal({ isOpen, onClose, selectedMeeting, allMeetings, publishers, auxiliaryRooms = 0 }: PrintModalProps) {
  const [reportType, setReportType] = useState<ReportType>('s140');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (selectedMeeting) return selectedMeeting.date.substring(0, 7);
    return new Date().toISOString().substring(0, 7);
  });

  const [weekendMeetings, setWeekendMeetings] = useState<any[]>([]);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    fetch('/api/weekend-meetings')
      .then(r => r.json())
      .then(j => { if (!cancelled) setWeekendMeetings(j.meetings || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOpen]);

  // S-89 individual (85 mm): estado de generación + ajustes de posición PDF.
  const [s89Busy, setS89Busy] = useState(false);
  const [pdfOffsets, setPdfOffsets] = useState<PdfOffsets>({ ...PDF_OFFSETS_DEFAULT });
  const [showPdfAdjust, setShowPdfAdjust] = useState(false);

  // Reunión elegida para las Hojas S-89 individuales (85 mm). Por defecto la semana
  // seleccionada en la vista principal (p.ej. septiembre); si no hay selección,
  // la más reciente. El usuario la cambia con el selector de semana.
  const [s89WeekId, setS89WeekId] = useState<string | null>(null);
  const s89Meeting =
    allMeetings.find(m => m.id === s89WeekId) ??
    selectedMeeting ??
    allMeetings.slice().sort((a, b) => b.date.localeCompare(a.date))[0] ??
    null;

  const adjustOffset = (field: keyof PdfOffsets, delta: number) =>
    setPdfOffsets(prev => ({ ...prev, [field]: Math.round((prev[field] + delta) * 10) / 10 }));

  // Precargar los módulos de export al abrir para no perder el user-gesture window.
  useEffect(() => {
    if (!isOpen) return;
    import('jspdf').catch(() => {});
    import('docx').catch(() => {});
    import('xlsx-js-style').catch(() => {});
  }, [isOpen]);

  const runS89Export = async (kind: 'pdf' | 'docx' | 'xlsx' | 'csv') => {
    if (!s89Meeting) return;
    const slips = buildSlips(s89Meeting);
    if (slips.length === 0) return;
    const base = `Hojas_S-89_${s89Meeting.date}`;
    setS89Busy(true);
    try {
      if (kind === 'pdf')       await downloadS89IndividualPdf(slips, base, pdfOffsets);
      else if (kind === 'docx') await downloadS89IndividualDocx(slips, base, pdfOffsets);
      else if (kind === 'xlsx') await downloadS89Xlsx(slips, base);
      else                      downloadS89Csv(slips, base);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al exportar');
    } finally {
      setS89Busy(false);
    }
  };

  if (!isOpen) return null;

  const weekendByMonday: Record<string, any> = {};
  for (const w of weekendMeetings) {
    if (w?.date) weekendByMonday[mondayOf(w.date)] = w;
  }

  const monthlyMeetings = dedupeMeetingsByDate(allMeetings.filter(m => meetingInMonth(m.date, selectedMonth)));
  const availableMonths = Array.from(new Set(allMeetings.map(m => m.date.substring(0, 7)))).sort() as string[];
  const printedOn = fmtJW(new Date().toISOString().slice(0, 10));

  // Reporte de publicadores: una columna por semana (histórico completo, no solo
  // el mes seleccionado); la celda muestra el número de asignación dado (y "A" si
  // fue en sala auxiliar). Segmentado por ancianos / siervos ministeriales / publicadores.
  const pubMeetings = allMeetings;
  const { detail: pubDetail, weeks: publisherWeeks } = publisherAssignmentDetail(pubMeetings);

  const pubCell = (uid: string, w: string): string => {
    const c = pubDetail[uid]?.[w];
    if (!c) return '';
    if (c.nums.length === 0) return '✓';
    const txt = c.nums.join(',');
    return c.aux ? `${txt} A` : txt;
  };

  const classifyPublisher = (p: any): 'anciano' | 'siervo' | 'publicador' => {
    if (p.is_elder) return 'anciano';
    if (p.is_ministerial_servant) return 'siervo';
    return 'publicador';
  };

  const pubWeekCols = ['Publicador', 'Última asignación', ...publisherWeeks.map(w => fmtJW(w))];

  const buildPubRows = (group: 'anciano' | 'siervo' | 'publicador') =>
    publishers
      .filter((p: any) => classifyPublisher(p) === group)
      .map((p: any) => {
        const byWeek = pubDetail[p.id] || {};
        const weeksAssigned = Object.keys(byWeek).sort();
        const last = weeksAssigned.length ? weeksAssigned.slice(-1)[0] : '';
        return [
          p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
          last ? fmtJW(last) : '',
          ...publisherWeeks.map(w => pubCell(p.id, w)),
        ];
      });

  const pubGroups = [
    { key: 'anciano' as const, label: 'Ancianos' },
    { key: 'siervo' as const, label: 'Siervos ministeriales' },
    { key: 'publicador' as const, label: 'Publicadores' },
  ];

  const pubSheets = pubGroups.map(g => ({
    name: g.label,
    columns: pubWeekCols,
    rows: buildPubRows(g.key),
  }));

  const exportPublishers = async () => {
    try {
      await exportXlsx({
        title: 'Reporte de publicadores',
        congName: CONGREGATION_NAME,
        columns: [],
        rows: [],
        sheets: pubSheets,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al exportar');
    }
  };

  // Programa mensual (S-140 / combinado) con el MISMO formato que la impresión.
  const buildProgramWeeks = (type: 's140' | 'combined'): ProgramWeek[] =>
    monthlyMeetings.map(m => {
      if (m.assembly_type) {
        return {
          weekLabel: weekRangeLabel(m.date),
          isAssembly: true,
          assemblyLabel: m.assembly_type === 'regional' ? 'ASAMBLEA REGIONAL' : 'ASAMBLEA DE CIRCUITO',
        };
      }
      const allParts = (m.parts || []) as Part[];
      const gems = allParts.find(p => p.part_type === 'spiritual_gems');
      const scripture = gems ? extractScripture(gems.title) : '';
      const mainParts = allParts.filter(p => p.part_type !== 'cbs').sort((a, b) => a.part_number - b.part_number);
      const cbsPart = allParts.find(p => p.part_type === 'cbs');
      const bibleIdx = mainParts.findIndex(p => p.part_type === 'bible_reading');
      const firstStudentIdx = mainParts.findIndex(p => p.part_type === 'student_part');
      const firstLivingIdx = mainParts.findIndex(p => p.part_type === 'living_part');

      const chairmanName = m.chairman?.name || getName(m.chairman_id, publishers);
      const openingName = m.opening_prayer?.name || getName(m.opening_prayer_id, publishers) || chairmanName;
      const closingName = m.closing_prayer?.name || getName(m.closing_prayer_id, publishers);
      const cbsConductor = m.cbs_conducer?.name || getName(m.cbs_conductor_id, publishers);
      const cbsReader = m.cbs_reader?.name || getName(m.cbs_reader_id, publishers);
      const cbsName = cbsConductor && cbsReader ? `${cbsConductor}/${cbsReader}` : (cbsConductor || cbsReader || '');

      const parts: ProgramWeek['parts'] = mainParts.map((p, idx) => ({
        num: p.part_number,
        title: programTitle(p),
        dur: p.duration_minutes ?? '',
        name: rowName(p),
        sep: idx === firstStudentIdx ? 'amber' : idx === firstLivingIdx ? 'maroon' : null,
        bible: idx === bibleIdx,
      }));

      const wk = weekendByMonday[mondayOf(m.date)];
      const week: ProgramWeek = {
        weekLabel: weekRangeLabel(m.date),
        scripture,
        chairman: chairmanName,
        opening: openingName,
        closing: closingName,
        parts,
        cbs: cbsName,
        cbsNum: cbsPart?.part_number ?? null,
        cbsDur: cbsPart?.duration_minutes ?? '',
        cleaning: m.cleaning_group ?? '___',
        hospitality: wkHospitality(wk) || '___',
      };
      if (type === 'combined' && wk) {
        week.weekend = {
          date: wk.date,
          chairman: wkName(wk?.chairman),
          talk: wkTalk(wk),
          speaker: wkSpeaker(wk),
          congregation: wkCongregation(wk),
          conductor: wkName(wk?.wt_conductor),
          reader: wkName(wk?.wt_reader),
          cleaning: wk?.cleaning_group ?? '___',
          hospitality: wkHospitality(wk),
        };
      }
      return week;
    });

  const exportProgram = async (kind: 'pdf' | 'docx' | 'xlsx') => {
    const combined = reportType === 'combined';
    const weeks = buildProgramWeeks(combined ? 'combined' : 's140');
    const title = combined ? 'Programa combinado' : 'Programa S-140';
    const subtitle = getMonthES(selectedMonth);
    const opts = { title, congName: CONGREGATION_NAME, subtitle, printedOn, combined };
    try {
      if (kind === 'pdf') await exportProgramPdf(weeks, opts);
      else if (kind === 'docx') await exportProgramDocx(weeks, opts);
      else await exportProgramXlsx(weeks, opts);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al exportar');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 print:p-0 print:bg-white print:relative print:inset-auto">
      <style jsx global>{`
        @media print {
          header, nav, aside, footer, .no-print, button, .modal-sidebar { display: none !important; }
          .print-area { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
          body { background: white !important; color: black !important; }
          .week-block { page-break-inside: avoid; }
          .page-break { page-break-after: always; }
          .s89-slip { page-break-inside: avoid; margin-bottom: 24px; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 print:h-auto print:shadow-none print:border-none">

        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-bold">Imprimir Reportes</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden print:overflow-visible">

          {/* Sidebar */}
          <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-4 no-print flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Tipo de reporte</label>
                <div className="space-y-1.5">
                  {([
                    { key: 's140', label: 'Programa mensual', icon: <Calendar className="w-4 h-4" /> },
                    { key: 'combined', label: 'Programa combinado', icon: <LayoutGrid className="w-4 h-4" /> },
                    { key: 's89',  label: 'Hojas de asignación (S-89)', icon: <FileText className="w-4 h-4" /> },
                    { key: 's89ind', label: 'Hojas S-89 individuales (85 mm)', icon: <File className="w-4 h-4" /> },
                    { key: 'chairman', label: 'Hoja del presidente', icon: <UserCheck className="w-4 h-4" /> },
                    { key: 'publishers', label: 'Reporte de publicadores', icon: <FileSpreadsheet className="w-4 h-4" /> },
                   ] as const).map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setReportType(key)}
                      className={`w-full text-left px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-2.5 transition-all ${
                        reportType === key ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {icon}{label}
                    </button>
                  ))}
                </div>
              </div>

              {(reportType === 's140' || reportType === 'combined') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Mes</label>
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {availableMonths.map(m => <option key={m} value={m}>{getMonthES(m)}</option>)}
                  </select>
                </div>
              )}

              {(reportType === 's140' || reportType === 'combined') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Descargar programa</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => exportProgram('pdf')}
                      className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
                    >PDF</button>
                    <button
                      onClick={() => exportProgram('docx')}
                      className="px-3 py-2 rounded-lg bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800"
                    >DOCX</button>
                    <button
                      onClick={() => exportProgram('xlsx')}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                    >XLSX</button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => window.print()}
              className="w-full bg-sky-600 text-white hover:bg-sky-700 py-2.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Guardar PDF
            </button>
          </div>

          {/* Preview area */}
          <div className="flex-1 bg-slate-100 p-8 overflow-y-auto print:bg-white print:p-0 print:overflow-visible print:w-full">
            <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm max-w-3xl mx-auto print:border-none print:shadow-none print:p-0 print:mx-0 print:max-w-none print-area"
                 style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>

              {/* ── Programa Mensual (modelo La Estación) ─────────────────────── */}
              {reportType === 's140' && (
                <div>
                  {/* Título superior */}
                  <div className="flex items-end justify-between border-b-2 border-slate-800 pb-1 mb-4">
                    <h1 className="text-lg font-bold text-slate-900">Programa para la reunión de entre semana</h1>
                    <span className="text-lg font-bold text-slate-900">{CONGREGATION_NAME}</span>
                  </div>

                  {monthlyMeetings.length === 0 ? (
                    <p className="text-center py-12 text-slate-400">No hay reuniones para este mes.</p>
                  ) : monthlyMeetings.map((m, mIdx) => {
                    if (m.assembly_type) {
                      return (
                        <div key={m.id} className="week-block mb-5">
                          <div className="flex items-center text-white text-sm py-2 px-3" style={{ background: TEAL }}>
                            <span className="font-bold">{weekRangeLabel(m.date)}</span>
                            <span className="mx-3">—</span>
                            <span className="font-bold">{m.assembly_type === 'regional' ? 'ASAMBLEA REGIONAL' : 'ASAMBLEA DE CIRCUITO'}</span>
                          </div>
                        </div>
                      );
                    }
                    const allParts = (m.parts || []) as Part[];
                    const gems = allParts.find(p => p.part_type === 'spiritual_gems');
                    const scripture = gems ? extractScripture(gems.title) : '';

                    const mainParts = allParts.filter(p => p.part_type !== 'cbs').sort((a, b) => a.part_number - b.part_number);
                    const cbsPart = allParts.find(p => p.part_type === 'cbs');

                    const bibleIdx = mainParts.findIndex(p => p.part_type === 'bible_reading');
                    const firstStudentIdx = mainParts.findIndex(p => p.part_type === 'student_part');
                    const firstLivingIdx = mainParts.findIndex(p => p.part_type === 'living_part');

                    const chairmanName = m.chairman?.name || getName(m.chairman_id, publishers);
                    const openingName = m.opening_prayer?.name || getName(m.opening_prayer_id, publishers) || chairmanName;
                    const closingName = m.closing_prayer?.name || getName(m.closing_prayer_id, publishers);
                    const cbsConductor = m.cbs_conducer?.name || getName(m.cbs_conductor_id, publishers);
                    const cbsReader = m.cbs_reader?.name || getName(m.cbs_reader_id, publishers);
                    const cbsName = cbsConductor && cbsReader ? `${cbsConductor}/${cbsReader}` : (cbsConductor || cbsReader || '');

                    const isLast = mIdx === monthlyMeetings.length - 1;

                    return (
                      <div key={m.id} className={`week-block mb-5 ${!isLast ? 'page-break' : ''}`}>
                        {/* Cabecera teal */}
                        <div className="flex items-stretch text-white text-sm" style={{ background: TEAL }}>
                          <div className="font-bold px-2.5 py-1.5 flex-1 text-white">
                            {weekRangeLabel(m.date)}{scripture ? ` | ${scripture}` : ''}
                          </div>
                          <div className="px-3 py-1.5 flex items-center gap-1.5 border-l border-white/40">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-200">Presidente:</span>
                            <span className="font-semibold text-white">{chairmanName || '—'}</span>
                          </div>
                          <div className="px-3 py-1.5 flex items-center gap-1.5 border-l border-white/40">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-200">Oración:</span>
                            <span className="font-semibold text-white">{openingName || '—'}</span>
                          </div>
                        </div>

                        {/* Partes */}
                        <div className="text-sm">
                          {mainParts.map((p, idx) => (
                            <React.Fragment key={p.id}>
                              {idx === firstStudentIdx && idx !== -1 && (
                                <div style={{ height: 3, background: AMBER }} className="my-1" />
                              )}
                              {idx === firstLivingIdx && idx !== -1 && (
                                <div style={{ height: 3, background: MAROON }} className="my-1" />
                              )}
                              {idx === bibleIdx && idx !== -1 && (
                                <p className="font-bold text-slate-700 text-xs uppercase tracking-wide mt-1 mb-0.5">Sala principal</p>
                              )}
                              <PartRow
                                left={`${p.part_number}. ${programTitle(p)} (${p.duration_minutes} min.)`}
                                right={rowName(p)}
                              />
                            </React.Fragment>
                          ))}

                          {/* CBS */}
                          {cbsPart && (
                            <PartRow
                              left={`${cbsPart.part_number}. Estudio bíblico (${cbsPart.duration_minutes} min.)`}
                              right={cbsName}
                            />
                          )}
                        </div>

                        {/* Pie: Limpieza/Hospitalidad + Oración final */}
                        <div className="flex items-center justify-between mt-1.5 text-sm">
                          <span
                            className="font-bold px-2 py-0.5"
                            style={{ background: YELLOW }}
                          >
                            Limpieza&nbsp;&nbsp;{m.cleaning_group ?? '___'}&nbsp;&nbsp;&nbsp;&nbsp;HOSPITALIDAD&nbsp;&nbsp;{wkHospitality(weekendByMonday[mondayOf(m.date)]) || '___'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold uppercase text-slate-500">Oración</span>
                            <span className="text-slate-800">{closingName || '—'}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Pie de impresión */}
                  <p className="text-right text-[10px] text-slate-400 italic mt-4">Impreso {printedOn}</p>
                </div>
              )}

              {/* ── Programa Combinado (entre semana + fin de semana) ───────── */}
              {reportType === 'combined' && (
                <div>
                  <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>

                  {/* Títulos de las tres áreas */}
                  <div className="flex items-end border-b-2 border-slate-800 pb-1 mb-4 text-[13px] font-bold text-slate-900">
                    <span className="flex-1">Programa para la reunión de entre semana</span>
                    <span style={{ width: '38%' }} className="pl-2 flex justify-between">
                      <span>Reunión de fin de semana</span>
                      <span>{CONGREGATION_NAME}</span>
                    </span>
                  </div>

                  {monthlyMeetings.length === 0 ? (
                    <p className="text-center py-12 text-slate-400">No hay reuniones para este mes.</p>
                  ) : monthlyMeetings.map((m, mIdx) => {
                    if (m.assembly_type) {
                      return (
                        <div key={m.id} className="week-block mb-5">
                          <div className="flex items-center text-white text-sm py-2 px-3" style={{ background: TEAL }}>
                            <span className="font-bold">{weekRangeLabel(m.date)}</span>
                            <span className="mx-3">—</span>
                            <span className="font-bold">{m.assembly_type === 'regional' ? 'ASAMBLEA REGIONAL' : 'ASAMBLEA DE CIRCUITO'}</span>
                          </div>
                        </div>
                      );
                    }
                    const allParts = (m.parts || []) as Part[];
                    const gems = allParts.find(p => p.part_type === 'spiritual_gems');
                    const scripture = gems ? extractScripture(gems.title) : '';
                    const mainParts = allParts.filter(p => p.part_type !== 'cbs').sort((a, b) => a.part_number - b.part_number);
                    const cbsPart = allParts.find(p => p.part_type === 'cbs');
                    const bibleIdx = mainParts.findIndex(p => p.part_type === 'bible_reading');
                    const firstStudentIdx = mainParts.findIndex(p => p.part_type === 'student_part');
                    const firstLivingIdx = mainParts.findIndex(p => p.part_type === 'living_part');

                    const chairmanName = m.chairman?.name || getName(m.chairman_id, publishers);
                    const closingName = m.closing_prayer?.name || getName(m.closing_prayer_id, publishers);
                    const cbsConductor = m.cbs_conducer?.name || getName(m.cbs_conductor_id, publishers);
                    const cbsReader = m.cbs_reader?.name || getName(m.cbs_reader_id, publishers);
                    const cbsName = cbsConductor && cbsReader ? `${cbsConductor}/${cbsReader}` : (cbsConductor || cbsReader || '');

                    const w = weekendByMonday[mondayOf(m.date)];
                    const isLast = mIdx === monthlyMeetings.length - 1;

                    const wkRow = (label: string, value: string, highlight?: boolean) => (
                      <div className="flex py-0.5 text-sm">
                        <span className="font-bold text-slate-700" style={{ width: 96 }}>{label}</span>
                        <span className={`flex-1 text-slate-800 ${highlight ? 'px-1' : ''}`} style={highlight ? { background: YELLOW } : undefined}>{value || '—'}</span>
                      </div>
                    );

                    return (
                      <div key={m.id} className={`week-block flex mb-5 ${!isLast ? 'page-break' : ''}`}>
                        {/* Columna entre semana */}
                        <div className="flex-1 pr-3">
                          <div className="flex items-stretch text-white text-sm" style={{ background: TEAL }}>
                            <div className="font-bold px-2.5 py-1.5 flex-1 text-white">{weekRangeLabel(m.date)}{scripture ? ` | ${scripture}` : ''}</div>
                            <div className="px-3 py-1.5 border-l border-white/40 flex items-center gap-1.5">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-200">Pres. / Orac:</span>
                              <span className="font-semibold text-white">{chairmanName || '—'}</span>
                            </div>
                          </div>

                          <div className="text-sm">
                            {mainParts.map((p, idx) => (
                              <React.Fragment key={p.id}>
                                {idx === firstStudentIdx && idx !== -1 && <div style={{ height: 3, background: AMBER }} className="my-1" />}
                                {idx === firstLivingIdx && idx !== -1 && <div style={{ height: 3, background: MAROON }} className="my-1" />}
                                {idx === bibleIdx && idx !== -1 && (
                                  <p className="font-bold text-slate-700 text-xs uppercase tracking-wide mt-1 mb-0.5">Sala principal</p>
                                )}
                                <PartRow left={`${p.part_number}. ${programTitle(p)} (${p.duration_minutes} min.)`} right={rowName(p)} />
                              </React.Fragment>
                            ))}
                            {cbsPart && (
                              <PartRow left={`${cbsPart.part_number}. Estudio bíblico (${cbsPart.duration_minutes} min.)`} right={cbsName} />
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-1.5 text-sm">
                            <span className="font-bold px-2 py-0.5" style={{ background: YELLOW }}>
                              Limpieza&nbsp;&nbsp;{m.cleaning_group ?? '___'}&nbsp;&nbsp;&nbsp;&nbsp;HOSPITALIDAD&nbsp;&nbsp;{wkHospitality(weekendByMonday[mondayOf(m.date)]) || '___'}
                            </span>
                            <span className="flex items-center gap-1.5">
                              <span className="text-[11px] font-semibold uppercase text-slate-500">Oración final</span>
                              <span className="text-slate-800">{closingName || '—'}</span>
                            </span>
                          </div>
                        </div>

                        {/* Columna fin de semana */}
                        <div style={{ width: '38%' }} className="border-l-2 pl-3" >
                          <div className="flex items-stretch text-white text-sm font-bold" style={{ background: TEAL }}>
                            <div className="px-2 py-1 flex-1">Domingo</div>
                            <div className="px-2 py-1">{w ? fmtDMY(w.date) : '—'}</div>
                          </div>
                          <div className="mt-0.5">
                            {wkRow('Presidente', wkName(w?.chairman))}
                            {wkRow('Discurso', wkTalk(w))}
                            {wkRow('Orador', wkSpeaker(w))}
                            {wkRow('Congregación', wkCongregation(w))}
                            {wkRow('Conductor', wkName(w?.wt_conductor))}
                            {wkRow('Lector', wkName(w?.wt_reader))}
                            {wkRow('Limpieza', w?.cleaning_group ?? '___', true)}
                            {wkRow('Hospitalidad', wkHospitality(w), true)}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <p className="text-right text-[10px] text-slate-400 italic mt-4">Impreso {printedOn}</p>
                </div>
              )}

              {/* ── Hojas de Asignación (S-89) ─────────────────────────────── */}
              {reportType === 's89' && (
                <div>
                  {selectedMeeting ? (
                    <>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 no-print border-b pb-2">
                        Hojas S-89 — {fmtJW(selectedMeeting.date)}
                      </p>

                      {(selectedMeeting.parts as Part[])
                        .filter(p => p.role === 'student' && p.assigned_user_id)
                        .length === 0 ? (
                          <p className="text-center py-6 text-slate-400">No hay partes de estudiante asignadas en esta semana.</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-1">
                            {(selectedMeeting.parts as Part[])
                              .filter(p => p.role === 'student' && p.assigned_user_id)
                              .map(p => (
                                <div
                                  key={p.id}
                                  className="border border-black p-5 s89-slip max-w-sm mx-auto w-full"
                                  style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px' }}
                                >
                                  <div className="text-center border-b border-black pb-2 mb-3">
                                    <p className="font-bold uppercase text-sm leading-tight">Asignación para la reunión</p>
                                    <p className="font-bold uppercase text-sm leading-tight">Vida y Ministerio Cristianos</p>
                                  </div>

                                  <table className="w-full mb-3" style={{ borderCollapse: 'collapse' }}>
                                    <tbody>
                                      <tr>
                                        <td className="font-bold pr-2 py-0.5 whitespace-nowrap">Nombre:</td>
                                        <td className="border-b border-black w-full py-0.5">{p.users?.name || ''}</td>
                                      </tr>
                                      <tr>
                                        <td className="font-bold pr-2 py-0.5 whitespace-nowrap">Ayudante:</td>
                                        <td className="border-b border-black py-0.5">{p.assistant?.name || ''}</td>
                                      </tr>
                                      <tr>
                                        <td className="font-bold pr-2 py-0.5 whitespace-nowrap">Fecha:</td>
                                        <td className="border-b border-black py-0.5">{fmtJW(selectedMeeting.date)}</td>
                                      </tr>
                                    </tbody>
                                  </table>

                                  <div className="mb-3">
                                    <p className="font-bold">Núm. de Intervención:</p>
                                    <p className="font-semibold mt-0.5">{p.part_number}. {s89Title(p)}</p>
                                    <p className="mt-0.5 leading-snug">{s89Description(p)}</p>
                                  </div>

                                  <div className="mb-3">
                                    <p className="font-bold mb-1">Se presentará en:</p>
                                    {[
                                      { value: 'main',  label: 'Sala principal' },
                                      { value: 'aux_1', label: 'Sala auxiliar núm. 1' },
                                      { value: 'aux_2', label: 'Sala auxiliar núm. 2' },
                                    ].map(({ value, label }) => (
                                      <div key={value} className="flex items-center gap-1.5 mb-0.5">
                                        <span className="inline-block w-3 h-3 border border-black flex-shrink-0 flex items-center justify-center text-[10px]">
                                          {p.class_type === value ? '✓' : ''}
                                        </span>
                                        <span>{label}</span>
                                      </div>
                                    ))}
                                  </div>

                                  <div className="border-t border-slate-300 pt-2" style={{ fontSize: '9px', color: '#555', lineHeight: '1.3' }}>
                                    <p>{S89_NOTE}</p>
                                    <p className="mt-1 text-right font-bold">S-89&nbsp;&nbsp;&nbsp;&nbsp;11/23</p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                    </>
                  ) : (
                    <p className="text-center py-12 text-slate-400">Selecciona una semana en la vista principal para imprimir las hojas S-89.</p>
                  )}
                </div>
              )}

              {/* ── Hojas S-89 individuales (85 mm) ─────────────────────────── */}
              {reportType === 's89ind' && (
                <div>
                  {(() => {
                    const weekOptions = allMeetings.slice().sort((a, b) => b.date.localeCompare(a.date));
                    const countById: Record<string, number> = {};
                    for (const m of weekOptions) countById[m.id] = buildSlips(m).length;
                    if (!s89Meeting) {
                      return <p className="text-center py-12 text-slate-400">No hay reuniones cargadas.</p>;
                    }
                    const slips = buildSlips(s89Meeting);
                    return (
                      <>
                        <div className="mb-4 border-b pb-2">
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Semana</label>
                          <select
                            value={s89Meeting.id}
                            onChange={e => setS89WeekId(e.target.value || null)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          >
                            {weekOptions.map(m => (
                              <option key={m.id} value={m.id}>
                                {fmtJW(m.date)}{countById[m.id] ? ` (${countById[m.id]})` : ' (sin partes)'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm text-slate-600 mb-3">
                            Una hojita por asignación estudiantil (85 × 127 mm), solo con los datos del asignado,
                            como el modelo impreso. <span className="font-semibold">{slips.length}</span> hojita(s) para esta semana.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button disabled={s89Busy || slips.length === 0} onClick={() => runS89Export('pdf')}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40">
                              <FileText className="w-4 h-4" /> PDF
                            </button>
                            <button disabled={s89Busy || slips.length === 0} onClick={() => runS89Export('docx')}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-700 text-white text-sm font-semibold hover:bg-sky-800 disabled:opacity-40">
                              <File className="w-4 h-4" /> DOCX
                            </button>
                            <button disabled={s89Busy || slips.length === 0} onClick={() => runS89Export('xlsx')}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-40">
                              <FileSpreadsheet className="w-4 h-4" /> XLSX
                            </button>
                            <button disabled={s89Busy || slips.length === 0} onClick={() => runS89Export('csv')}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-600 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-40">
                              <FileSpreadsheet className="w-4 h-4" /> CSV
                            </button>
                            {s89Busy && <span className="text-sm text-slate-400 self-center">Generando…</span>}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-2">
                            CSV: Nombre, Ayudante, Fecha, Núm. de intervención, Sala.
                          </p>
                        </div>

                        {/* ── Ajuste de posiciones PDF ──────────────────────── */}
                        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                          <button
                            onClick={() => setShowPdfAdjust(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <span>⚙ Ajustar posiciones PDF (mm)</span>
                            <span className="text-slate-400 text-xs">{showPdfAdjust ? '▲' : '▼'}</span>
                          </button>
                          {showPdfAdjust && (
                            <div className="px-4 pb-3 pt-1 space-y-2 border-t border-slate-200">
                              {([
                                { key: 'nombre',     label: 'Nombre' },
                                { key: 'ayudante',   label: 'Ayudante' },
                                { key: 'fecha',      label: 'Fecha' },
                                { key: 'asignacion', label: 'Asignación' },
                                { key: 'sala',       label: 'Sala' },
                              ] as { key: keyof PdfOffsets; label: string }[]).map(({ key, label }) => {
                                const xKey = (key + 'X') as keyof PdfOffsets;
                                return (
                                  <div key={key} className="border border-slate-200 rounded-lg p-2">
                                    <div className="text-sm font-medium text-slate-600 mb-1">{label}</div>
                                    {(['X', 'Y'] as const).map(axis => {
                                      const k = axis === 'Y' ? key : xKey;
                                      const val = pdfOffsets[k] as number;
                                      return (
                                        <div key={axis} className="flex items-center gap-2 text-sm">
                                          <span className="w-5 text-slate-400 shrink-0 font-bold">{axis}</span>
                                          <button
                                            onClick={() => adjustOffset(k, -0.5)}
                                            className="w-7 h-7 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center"
                                          >−</button>
                                          <span className="w-14 text-center font-mono text-slate-800 tabular-nums">
                                            {val > 0 ? '+' : ''}{val.toFixed(1)}
                                          </span>
                                          <button
                                            onClick={() => adjustOffset(k, +0.5)}
                                            className="w-7 h-7 rounded bg-slate-200 hover:bg-slate-300 font-bold text-slate-700 flex items-center justify-center"
                                          >+</button>
                                          {val !== 0 && (
                                            <button
                                              onClick={() => setPdfOffsets(prev => ({ ...prev, [k]: 0 }))}
                                              className="text-[11px] text-slate-400 hover:text-slate-600 ml-1"
                                            >reset</button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                              <button
                                onClick={() => setPdfOffsets({ ...PDF_OFFSETS_DEFAULT })}
                                className="mt-1 text-[11px] text-slate-400 hover:text-slate-600"
                              >Restablecer todo</button>
                            </div>
                          )}
                        </div>

                        {slips.length === 0 ? (
                          <p className="text-center py-6 text-slate-400">No hay partes de estudiante asignadas en esta semana.</p>
                        ) : (
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                            {slips.map((s, i) => (
                              <div key={i} className="flex items-baseline gap-3 px-3 py-2 text-sm border-b border-slate-100 last:border-b-0">
                                <span className="font-bold text-slate-800 w-40 shrink-0 truncate">{s.nombre}</span>
                                <span className="text-slate-600 flex-1">
                                  {s.numIntervencion} {s.tituloCorto}{s.material ? <span className="text-slate-400"> › {s.material}</span> : null}
                                </span>
                                {s.ayudante && <span className="text-slate-400 shrink-0">+ {s.ayudante}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ── Hoja del Presidente ─────────────────────────────────────── */}
              {reportType === 'chairman' && (
                <div>
                  {selectedMeeting ? (
                    <div className="space-y-4 text-sm">
                      <div className="text-center pb-2 mb-4" style={{ borderBottom: `3px solid ${TEAL}` }}>
                        <h1 className="text-xl font-bold uppercase">Hoja del Presidente</h1>
                        <p className="text-slate-600">{CONGREGATION_NAME} — {fmtJW(selectedMeeting.date)}</p>
                      </div>

                      <Section color={TEAL} title="Apertura">
                        <p>Cántico: {selectedMeeting.song_opening || '—'}</p>
                        <p>Oración: {selectedMeeting.opening_prayer?.name || getName(selectedMeeting.opening_prayer_id, publishers) || '—'}</p>
                      </Section>

                      <Section color={AMBER} title="Tesoros de la Biblia">
                        {(selectedMeeting.parts as Part[])
                          .filter(p => ['treasures_talk', 'spiritual_gems', 'bible_reading'].includes(p.part_type))
                          .map(p => (
                            <p key={p.id}>
                              <span className="font-medium">{programTitle(p)} ({p.duration_minutes} min.):</span>{' '}
                              {p.users?.name || '—'}
                            </p>
                          ))}
                      </Section>

                      <Section color={MAROON} title="Seamos Mejores Maestros">
                        {(selectedMeeting.parts as Part[])
                          .filter(p => p.part_type === 'student_part')
                          .map(p => (
                            <p key={p.id}>
                              <span className="font-medium">{programTitle(p)} ({p.duration_minutes} min.):</span>{' '}
                              {p.users?.name || '—'}{p.assistant?.name ? ` & ${p.assistant.name}` : ''}
                            </p>
                          ))}
                      </Section>

                      <Section color={TEAL} title="Nuestra Vida Cristiana">
                        <p>Cántico intermedio: {selectedMeeting.song_middle || '—'}</p>
                        {(selectedMeeting.parts as Part[])
                          .filter(p => p.part_type === 'living_part')
                          .map(p => (
                            <p key={p.id}>
                              <span className="font-medium">{programTitle(p)} ({p.duration_minutes} min.):</span>{' '}
                              {p.users?.name || '—'}
                            </p>
                          ))}
                        <p>
                          <span className="font-medium">Estudio bíblico (30 min.) — Conductor:</span>{' '}
                          {selectedMeeting.cbs_conducer?.name || getName(selectedMeeting.cbs_conductor_id, publishers) || '—'}
                          {' / Lector: '}
                          {selectedMeeting.cbs_reader?.name || getName(selectedMeeting.cbs_reader_id, publishers) || '—'}
                        </p>
                      </Section>

                      <Section color={TEAL} title="Cierre">
                        <p>Comentarios finales: {selectedMeeting.chairman?.name || getName(selectedMeeting.chairman_id, publishers) || '—'}</p>
                        <p>Cántico: {selectedMeeting.song_closing || '—'}</p>
                        <p>Oración: {selectedMeeting.closing_prayer?.name || getName(selectedMeeting.closing_prayer_id, publishers) || '—'}</p>
                      </Section>
                    </div>
                  ) : (
                    <p className="text-center py-12 text-slate-400">Selecciona una semana para ver la hoja del presidente.</p>
                  )}
                </div>
              )}

              {/* ── Reporte de publicadores (XLSX) ──────────────────────────── */}
              {reportType === 'publishers' && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 no-print border-b pb-2">
                    Reporte de publicadores
                  </p>

                  <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm text-slate-600 mb-3">
                      Lista de publicadores con la fecha de su última asignación y una columna por
                      cada semana del <span className="font-semibold">historial completo</span>. En cada celda se muestra el <span className="font-semibold">número de asignación</span> que
                      dieron; si fue en <span className="font-semibold">sala auxiliar</span> se agrega <span className="font-semibold">A</span>. Los roles sin
                      número (presidente, oración, CBS) se marcan con <span className="font-semibold">✓</span>. El reporte se
                      divide en Ancianos, Siervos ministeriales y Publicadores.
                    </p>
                    <button
                      onClick={exportPublishers}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                    >
                      <FileSpreadsheet className="w-4 h-4" /> Exportar XLSX
                    </button>
                    <p className="text-[11px] text-slate-400 mt-2">
                      {publishers.length} publicador(es) · {publisherWeeks.length} semana(s) con asignaciones.
                    </p>
                  </div>

                  {pubGroups.map(g => {
                    const rows = buildPubRows(g.key);
                    return (
                      <div key={g.key} className="mb-6">
                        <h4 className="text-sm font-bold text-slate-700 mb-2">{g.label} ({rows.length})</h4>
                        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[40vh] overflow-y-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead className="sticky top-0 bg-slate-100">
                              <tr>
                                {pubWeekCols.map((c, i) => (
                                  <th key={i} className="border border-slate-200 px-2 py-1 text-left font-semibold whitespace-nowrap">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i} className={i % 2 ? 'bg-slate-50' : ''}>
                                  {r.map((cell, j) => (
                                    <td key={j} className="border border-slate-200 px-2 py-1 whitespace-nowrap">
                                      {cell || ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Fila de parte: viñeta teal + texto a la izquierda, nombre asignado a la derecha.
function PartRow({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="flex-1 text-slate-800 flex items-baseline gap-1.5">
        <span style={{ color: TEAL }} className="text-[10px] leading-none mt-1">●</span>
        <span>{left}</span>
      </span>
      <span className="w-2/5 text-slate-700">{right || '—'}</span>
    </div>
  );
}

function Section({ color, title, children }: { color: string; title: string; children: React.ReactNode }) {
  return (
    <div className="pl-4 py-1" style={{ borderLeft: `4px solid ${color}` }}>
      <p className="font-bold uppercase text-slate-600 text-xs mb-1 tracking-wide">{title}</p>
      {children}
    </div>
  );
}

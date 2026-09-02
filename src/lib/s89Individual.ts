/**
 * Datos puros para las Hojas de Asignación S-89 en tamaño individual (85 mm).
 *
 * SIN dependencias de React ni de `better-sqlite3`: este módulo se importa desde
 * el cliente (PrintModal) y desde los generadores de export. Es la única fuente
 * de verdad del contenido de cada hojita; PDF/DOCX/XLSX/CSV consumen `SlipData[]`.
 *
 * Modelo de referencia: `FORMATO ASIGNACIONES VYMC.docx`. Cada hojita contiene
 * SOLO los datos del asignado (sin títulos, líneas ni recuadros): nombre,
 * ayudante, fecha (formato largo), número + título de la intervención, y la sala.
 * Solo se incluyen las partes de estudiante (Lectura de la Biblia → partes 6/7).
 */

export type Sala = 'main' | 'aux_1' | 'aux_2';

/** Forma mínima de una parte necesaria para construir una hojita. */
export interface SlipPart {
  part_number: number;
  part_type: string;
  student_part_type?: string;
  title: string;
  class_type: Sala;
  role?: string;
  assigned_user_id?: string | null;
  users?: { name?: string } | null;
  assistant?: { name?: string } | null;
}

export interface SlipMeeting {
  date: string;            // ISO YYYY-MM-DD
  parts?: SlipPart[];
}

export interface SlipData {
  nombre: string;
  ayudante: string;
  fechaLarga: string;      // "10 de agosto 2026"
  fechaIso: string;        // "2026-08-10"
  numIntervencion: number;
  tituloCorto: string;     // "Lectura de la Biblia" / "Empiece conversaciones"
  material: string;        // "Jer 24:1-10 (th lección 5)" — referencia/fuente
  sala: Sala;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-08-10" → "10 de agosto 2026" (formato del modelo Word). */
export function fmtFechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} de ${MESES[m - 1]} ${y}`;
}

type PartTitleShape = Pick<SlipPart, 'part_type' | 'student_part_type' | 'title'> & { study_point?: string };

/**
 * Tema corto de la intervención (sin el material): "Lectura de la Biblia",
 * "Discurso", "Empiece conversaciones". Toma la parte anterior al primer `:` y
 * quita la ubicación entre paréntesis al final.
 */
export function s89Title(part: PartTitleShape): string {
  if (part.part_type === 'bible_reading') return 'Lectura de la Biblia';
  if (part.student_part_type === 'talk') return 'Discurso';
  const colon = part.title.indexOf(':');
  const topic = colon >= 0 ? part.title.slice(0, colon) : part.title;
  return topic.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Material / fuente de la intervención — lo que va tras el tema en la misma
 * línea: "Jer 24:1-10 (th lección 5)", "Jesús es el Hijo de Dios (th lección 15)",
 * o la ubicación "DE CASA EN CASA". Devuelve '' si no hay material.
 */
export function s89Material(part: PartTitleShape): string {
  // 1) Todo lo que sigue al primer `:` (el separador tema/material del programa).
  const colon = part.title.indexOf(':');
  if (colon >= 0) return part.title.slice(colon + 1).trim();
  // 2) Si no hay `:`, el grupo entre paréntesis final es la ubicación/fuente.
  const paren = part.title.match(/\(([^)]+)\)\s*$/);
  if (paren) return paren[1].trim();
  // 3) Último recurso: el punto de estudio.
  return part.study_point ?? '';
}

/** Etiqueta legible de la sala para CSV/XLSX. */
export const SALA_LABEL: Record<Sala, string> = {
  main:  'Principal',
  aux_1: 'Auxiliar 1',
  aux_2: 'Auxiliar 2',
};

export function salaCsv(sala: Sala): string {
  return SALA_LABEL[sala] ?? String(sala);
}

/**
 * Construye una hojita por cada parte de estudiante asignada, en orden de
 * número de parte (Lectura de la Biblia = 3 → partes 4,5,6,7). Es exactamente
 * el mismo filtro que usa el S-89 multi-up existente.
 */
export function buildSlips(meeting: SlipMeeting): SlipData[] {
  const parts = (meeting.parts ?? [])
    .filter(p => p.role === 'student' && p.assigned_user_id)
    .sort((a, b) => a.part_number - b.part_number);

  return parts.map(p => ({
    nombre:         p.users?.name ?? '',
    ayudante:       p.assistant?.name ?? '',
    fechaLarga:     fmtFechaLarga(meeting.date),
    fechaIso:       meeting.date,
    numIntervencion: p.part_number,
    tituloCorto:    s89Title(p),
    material:       s89Material(p),
    sala:           p.class_type,
  }));
}

// ─── JW Meeting Programs (Vida y Ministerio Cristianos) ────────────────────────
// Each program is keyed by the Monday (ISO weekday 1) of the meeting week.
// Parts are numbered 1-9 to match the JW program outline:
//
//   Treasures from God's Word
//     1. Treasures talk (10 min)
//     2. Spiritual Gems (10 min)
//     3. Bible Reading (4 min)
//
//   Apply Yourself to the Field Ministry
//     4. Starting a Conversation (3 min)
//     5. Following Up (varied)  (2-4 min)
//     6. Making Disciples / Explaining Beliefs (3-5 min)
//
//   Living as Christians
//     7. Living part 1 (6-15 min)
//     8. Living part 2 (9-15 min) — only some weeks
//     9. Congregation Bible Study (30 min) — cbs_conducer + cbs_reader
//
// The CBS is stored as a single part row; the UI splits it into
// conductor + reader using meetings.cbs_conductor_id / cbs_reader_id.

export type StudentPartType =
  | 'starting_conversation'
  | 'following_up'
  | 'making_disciples'
  | 'explaining_beliefs'
  | 'talk'
  | 'none';

export type PartType =
  | 'treasures_talk'
  | 'spiritual_gems'
  | 'bible_reading'
  | 'student_part'
  | 'living_part'
  | 'cbs';

export interface ProgramPart {
  number: number;
  type: PartType;
  title: string;
  duration: number;
  role: 'speaker' | 'student' | 'conductor';
  student_part_type?: StudentPartType;
  requires_assistant?: boolean;
  location?: string; // e.g., "DE CASA EN CASA", "PREDICACIÓN PÚBLICA"
  details?: string;  // e.g., "Jer 3:14-25 (th lección 12)"
}

export interface Program {
  weekLabel: string;        // e.g., "May 25-31"
  mondayDate: string;       // ISO date for the Monday of the week, e.g., "2026-05-25"
  sourceUrl: string;
  songOpening: number;      // song number for opening
  songMiddle: number;
  songClosing: number;
  parts: ProgramPart[];
}

// Build Monday of the meeting's week.
// JW meetings run Monday → Sunday; the JW "date" is typically the Monday.
export function getMondayOfWeek(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  if (isNaN(d.getTime())) return isoDate;
  const day = d.getUTCDay(); // 0..6, Sun=0, Mon=1
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export const PROGRAMS: Record<string, Program> = {
  // ── 2026 ────────────────────────────────────────────────────────────────────
  '2026-05-18': {
    weekLabel: 'May 18-24',
    mondayDate: '2026-05-18',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026163',
    songOpening: 44,
    songMiddle: 115,
    songClosing: 151,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'El Alfarero nos moldea con amor y compasión', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Is 64:4-12 (th lección 12)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN PÚBLICA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN PÚBLICA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga discípulos', duration: 5, role: 'student', student_part_type: 'making_disciples' },
      { number: 7, type: 'living_part', title: 'Preparados para las situaciones de emergencia: Esté listo para lo imprevisto (a cargo de un anciano)', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lección 86, introducción a la sección 13 y lección 87', duration: 30, role: 'conductor' },
    ],
  },
  '2026-05-25': {
    weekLabel: 'May 25-31',
    mondayDate: '2026-05-25',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026164',
    songOpening: 24,
    songMiddle: 80,
    songClosing: 55,
    parts: [
      { number: 1, type: 'treasures_talk', title: '¡Cuánto amamos nuestro paraíso espiritual!', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Is 65:17-25 (th lección 10)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN PÚBLICA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN PÚBLICA' },
      { number: 6, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 7, type: 'student_part', title: 'Explique sus creencias (Escenificación)', duration: 3, role: 'student', student_part_type: 'explaining_beliefs', location: 'Escenificación' },
      { number: 8, type: 'living_part', title: '¿Tendrás tú una vida llena de cosas buenas?', duration: 15, role: 'speaker' },
      { number: 9, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lecciones 88, 89', duration: 30, role: 'conductor' },
    ],
  },
  '2026-06-01': {
    weekLabel: 'June 1-7',
    mondayDate: '2026-06-01',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026165',
    songOpening: 84,
    songMiddle: 76,
    songClosing: 18,
    parts: [
      { number: 1, type: 'treasures_talk', title: '“No te dejes intimidar [...], porque ‘yo estoy contigo’”', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 3:14-25 (th lección 12)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga discípulos', duration: 5, role: 'student', student_part_type: 'making_disciples' },
      { number: 7, type: 'living_part', title: '¡Sé valiente como Jeremías!', duration: 6, role: 'speaker' },
      { number: 8, type: 'living_part', title: '“Listos para presentar una defensa [...] con apacibilidad y profundo respeto”', duration: 9, role: 'speaker' },
      { number: 9, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lecciones 90, 91', duration: 30, role: 'conductor' },
    ],
  },
  '2026-06-08': {
    weekLabel: 'June 8-14',
    mondayDate: '2026-06-08',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026166',
    songOpening: 56,
    songMiddle: 60,
    songClosing: 68,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'No nos enfermemos espiritualmente como les pasó a los de Judá', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 5:1-11 (th lección 5)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN PÚBLICA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN PÚBLICA' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga revisitas (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'PREDICACIÓN INFORMAL' },
      { number: 7, type: 'student_part', title: 'Explique sus creencias (Escenificación)', duration: 3, role: 'student', student_part_type: 'explaining_beliefs', location: 'Escenificación' },
      { number: 8, type: 'living_part', title: 'Proteja su corazón de la información falsa', duration: 8, role: 'speaker' },
      { number: 9, type: 'living_part', title: 'Necesidades de la congregación', duration: 7, role: 'speaker' },
      { number: 10, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lecciones 92, 93', duration: 30, role: 'conductor' },
    ],
  },
  '2026-06-15': {
    weekLabel: 'June 15-21',
    mondayDate: '2026-06-15',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026167',
    songOpening: 152,
    songMiddle: 91,
    songClosing: 71,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'No respetaron el templo de Jehová', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 7, 8', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 8:4-13 (th lección 2)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga discípulos', duration: 5, role: 'student', student_part_type: 'making_disciples' },
      { number: 7, type: 'living_part', title: '¿Cómo podemos demostrar que respetamos el Salón del Reino?', duration: 5, role: 'speaker' },
      { number: 8, type: 'living_part', title: 'Cómo usamos las donaciones: Mantenemos nuestros Salones del Reino en buen estado', duration: 10, role: 'speaker' },
      { number: 9, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb introducción a la sección 14 y lecciones 94, 95', duration: 30, role: 'conductor' },
    ],
  },
  '2026-06-22': {
    weekLabel: 'June 22-28',
    mondayDate: '2026-06-22',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026168',
    songOpening: 5,
    songMiddle: 48,
    songClosing: 58,
    parts: [
      { number: 1, type: 'treasures_talk', title: '¿De qué presumirá usted?', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 9, 10', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 9:13-24 (th lección 12)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga revisitas (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'PREDICACIÓN INFORMAL' },
      { number: 7, type: 'living_part', title: 'No nos dejemos engañar, apoyemos el Reino de Dios (Jer. 10:23)', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lecciones 96, 97', duration: 30, role: 'conductor' },
    ],
  },
  '2026-06-29': {
    weekLabel: 'June 29 – July 5',
    mondayDate: '2026-06-29',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026169',
    songOpening: 106,
    songMiddle: 109,
    songClosing: 69,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Cómo "competir en una carrera contra caballos"', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 11, 12', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 12:1-11 (th lección 2)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Discurso: Jesús fue un gran maestro y sus consejos siempre funcionan (th lección 14)', duration: 5, role: 'student', student_part_type: 'talk' },
      { number: 7, type: 'living_part', title: 'Necesidades de la congregación', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lecciones 98, 99', duration: 30, role: 'conductor' },
    ],
  },
  '2026-07-06': {
    weekLabel: 'July 6-12',
    mondayDate: '2026-07-06',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026241',
    songOpening: 123,
    songMiddle: 49,
    songClosing: 61,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Jehová merece que le obedezcamos', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 13-15', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 13:1-14 (th lección 2)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'PREDICACIÓN INFORMAL' },
      { number: 6, type: 'student_part', title: 'Discurso: Jesús predijo los acontecimientos que vemos hoy (th lección 7)', duration: 5, role: 'student', student_part_type: 'talk' },
      { number: 7, type: 'living_part', title: '"Obedecer es mejor que ofrecer un sacrificio" (Análisis con el auditorio)', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lecciones 100, 101', duration: 30, role: 'conductor' },
    ],
  },
  '2026-07-13': {
    weekLabel: 'July 13-19',
    mondayDate: '2026-07-13',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026242',
    songOpening: 34,
    songMiddle: 54,
    songClosing: 22,
    parts: [
      { number: 1, type: 'treasures_talk', title: '¿Estamos confiando en la persona correcta?', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 16, 17', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 17:5-18 (th lección 5)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga discípulos (lff lección 19)', duration: 5, role: 'student', student_part_type: 'making_disciples' },
      { number: 7, type: 'living_part', title: 'Joven, confía en los consejos de la Biblia (Análisis con el auditorio)', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: lfb lecciones 102, 103', duration: 30, role: 'conductor' },
    ],
  },
  '2026-07-20': {
    weekLabel: 'July 20-26',
    mondayDate: '2026-07-20',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026243',
    songOpening: 44,
    songMiddle: 38,
    songClosing: 153,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Recuperarnos en sentido espiritual es posible', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 18, 19', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 19:1-11 (th lección 5)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Explique sus creencias: ¿Qué dice la Biblia sobre el libre albedrío? (th lección 20)', duration: 4, role: 'student', student_part_type: 'explaining_beliefs' },
      { number: 7, type: 'living_part', title: 'Pasos para recuperarnos en sentido espiritual (Análisis con el auditorio)', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg "Carta del Cuerpo Gobernante" e introducción', duration: 30, role: 'conductor' },
    ],
  },
  '2026-07-27': {
    weekLabel: 'July 27 – August 2',
    mondayDate: '2026-07-27',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026244',
    songOpening: 73,
    songMiddle: 57,
    songClosing: 31,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Predicó con valor', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 20, 21', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 20:7-18 (th lección 2)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Explique sus creencias (Escenificación) (th lección 13)', duration: 4, role: 'student', student_part_type: 'explaining_beliefs', location: 'Escenificación' },
      { number: 7, type: 'living_part', title: 'Seamos adaptables y mostremos interés por las personas (Análisis con el auditorio)', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg introducción a la sección 1, línea de tiempo y cap. 1', duration: 30, role: 'conductor' },
    ],
  },
  '2026-08-03': {
    weekLabel: 'August 3-9',
    mondayDate: '2026-08-03',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026245',
    songOpening: 40,
    songMiddle: 103,
    songClosing: 60,
    parts: [
      { number: 1, type: 'treasures_talk', title: '¡Qué importante es tener buenos pastores!', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 22, 23', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 23:25-36 (th lección 11)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Discurso: Jesús es el Hijo de Dios (th lección 15)', duration: 4, role: 'student', student_part_type: 'talk' },
      { number: 7, type: 'living_part', title: 'Del pasado al presente: El Cuerpo Gobernante promueve la unidad (parte 1) (Análisis con el auditorio)', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 2', duration: 30, role: 'conductor' },
    ],
  },
  '2026-08-10': {
    weekLabel: 'August 10-16',
    mondayDate: '2026-08-10',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026246',
    songOpening: 124,
    songMiddle: 65,
    songClosing: 137,
    parts: [
      { number: 1, type: 'treasures_talk', title: '¿Qué hace que los "higos" sean buenos o malos?', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 24, 25', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 24:1-10 (th lección 5)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'PREDICACIÓN INFORMAL' },
      { number: 6, type: 'student_part', title: 'Haga discípulos: Anime a un estudiante que está luchando para dejar una adicción', duration: 4, role: 'student', student_part_type: 'making_disciples' },
      { number: 7, type: 'living_part', title: 'Necesidades de la congregación', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 3', duration: 30, role: 'conductor' },
    ],
  },
  '2026-08-17': {
    weekLabel: 'August 17-23',
    mondayDate: '2026-08-17',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026247',
    songOpening: 77,
    songMiddle: 16,
    songClosing: 71,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'No se deje engañar por los falsos profetas', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 26-28', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 28:5-17 (th lección 5)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN PÚBLICA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN PÚBLICA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga discípulos (lff lección 20)', duration: 5, role: 'student', student_part_type: 'making_disciples' },
      { number: 7, type: 'living_part', title: 'Necesidades de la congregación', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 4', duration: 30, role: 'conductor' },
    ],
  },
  '2026-08-24': {
    weekLabel: 'August 24-30',
    mondayDate: '2026-08-24',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026248',
    songOpening: 12,
    songMiddle: 3,
    songClosing: 156,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Jehová disciplina a sus siervos hasta el grado debido', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 29, 30', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 30:1-11 (th lección 2)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN PÚBLICA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN PÚBLICA' },
      { number: 6, type: 'student_part', title: 'Discurso: ¿Qué significa Jeremías 29:11?', duration: 5, role: 'student', student_part_type: 'talk' },
      { number: 7, type: 'living_part', title: 'Jehová llena de esperanza a sus siervos', duration: 10, role: 'speaker' },
      { number: 8, type: 'living_part', title: 'Campaña especial en septiembre', duration: 5, role: 'speaker' },
      { number: 9, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 5', duration: 30, role: 'conductor' },
    ],
  },
  '2026-08-31': {
    weekLabel: 'August 31 – September 6',
    mondayDate: '2026-08-31',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026249',
    songOpening: 27,
    songMiddle: 67,
    songClosing: 132,
    parts: [
      { number: 1, type: 'treasures_talk', title: '"Haré un nuevo pacto"', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 31', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 31:1-11 (th lección 12)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 6, type: 'student_part', title: 'Explique sus creencias: ¿Por qué no se involucran los testigos de Jehová en asuntos políticos?', duration: 5, role: 'student', student_part_type: 'explaining_beliefs' },
      { number: 7, type: 'living_part', title: 'Seamos adaptables y usemos JW.ORG', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 6', duration: 30, role: 'conductor' },
    ],
  },
  '2026-09-07': {
    weekLabel: 'September 7-13',
    mondayDate: '2026-09-07',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026252',
    songOpening: 1,
    songMiddle: 128,
    songClosing: 143,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Meditar en las cualidades de Jehová fortalece nuestra fe', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 32, 33', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 32:6-18 (th lección 2)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 6, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 5, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 7, type: 'living_part', title: 'En esta campaña, ni un golpe al aire', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 7', duration: 30, role: 'conductor' },
    ],
  },
  '2026-09-14': {
    weekLabel: 'September 14-20',
    mondayDate: '2026-09-14',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026253',
    songOpening: 161,
    songMiddle: 121,
    songClosing: 28,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Jehová recompensa a los que siempre le obedecen', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 34, 35', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 35:1-14 (th lección 5)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Haga revisitas (PREDICACIÓN INFORMAL)', duration: 3, role: 'student', student_part_type: 'following_up', location: 'PREDICACIÓN INFORMAL' },
      { number: 7, type: 'student_part', title: 'Haga discípulos', duration: 4, role: 'student', student_part_type: 'making_disciples' },
      { number: 8, type: 'living_part', title: 'El autocontrol nos ayuda a obedecer', duration: 6, role: 'speaker' },
      { number: 9, type: 'living_part', title: 'Logros de la organización para el mes de septiembre', duration: 9, role: 'speaker' },
      { number: 10, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 8', duration: 30, role: 'conductor' },
    ],
  },
  '2026-09-21': {
    weekLabel: 'September 21-27',
    mondayDate: '2026-09-21',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026254',
    songOpening: 74,
    songMiddle: 142,
    songClosing: 134,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Jehová ayuda a quienes apoyan su Reino', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 36, 37', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 36:1-13 (th lección 10)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN PÚBLICA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN PÚBLICA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: '¿Qué diría? (DE CASA EN CASA)', duration: 6, role: 'student', student_part_type: 'none', location: 'DE CASA EN CASA' },
      { number: 7, type: 'living_part', title: 'Seamos siempre neutrales en nuestro corazón', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 9', duration: 30, role: 'conductor' },
    ],
  },
  '2026-09-28': {
    weekLabel: 'September 28 – October 4',
    mondayDate: '2026-09-28',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026255',
    songOpening: 102,
    songMiddle: 90,
    songClosing: 56,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'No dejemos de ayudarnos unos a otros', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 38, 39', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 38:1-13 (th lección 12)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'PREDICACIÓN INFORMAL' },
      { number: 6, type: 'student_part', title: '¿Qué diría? (DE CASA EN CASA)', duration: 6, role: 'student', student_part_type: 'none', location: 'DE CASA EN CASA' },
      { number: 7, type: 'living_part', title: '"¿Quién me tocó?"', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 10', duration: 30, role: 'conductor' },
    ],
  },
  '2026-10-05': {
    weekLabel: 'October 5-11',
    mondayDate: '2026-10-05',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026256',
    songOpening: 33,
    songMiddle: 17,
    songClosing: 38,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Tengamos un punto de vista equilibrado de la protección de Jehová', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 40, 41', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 40:1-10 (th lección 2)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 6, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN PÚBLICA)', duration: 4, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN PÚBLICA' },
      { number: 7, type: 'student_part', title: 'Explique sus creencias (Escenificación): ¿Quién es Jehová?', duration: 3, role: 'student', student_part_type: 'explaining_beliefs', location: 'Escenificación' },
      { number: 8, type: 'living_part', title: 'Jehová protege a las viudas', duration: 15, role: 'speaker' },
      { number: 9, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 11', duration: 30, role: 'conductor' },
    ],
  },
  '2026-10-12': {
    weekLabel: 'October 12-18',
    mondayDate: '2026-10-12',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026257',
    songOpening: 103,
    songMiddle: 47,
    songClosing: 129,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Pidieron guía y luego la rechazaron', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 42-44', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 43:1-13 (th lección 11)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (DE CASA EN CASA)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: '¿Qué diría? (PREDICACIÓN INFORMAL)', duration: 6, role: 'student', student_part_type: 'none', location: 'PREDICACIÓN INFORMAL' },
      { number: 7, type: 'living_part', title: 'Necesidades de la congregación', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 12', duration: 30, role: 'conductor' },
    ],
  },
  '2026-10-19': {
    weekLabel: 'October 19-25',
    mondayDate: '2026-10-19',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026258',
    songOpening: 21,
    songMiddle: 117,
    songClosing: 87,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'La esperanza es clave para estar contentos', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 45, 46', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 46:13-24 (th lección 10)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (PREDICACIÓN INFORMAL)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'PREDICACIÓN INFORMAL' },
      { number: 5, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 6, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 2, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 7, type: 'student_part', title: 'Discurso: Jesús no es Dios', duration: 4, role: 'student', student_part_type: 'talk' },
      { number: 8, type: 'living_part', title: '"No se olviden [...] de compartir lo que tienen"', duration: 15, role: 'speaker' },
      { number: 9, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 13', duration: 30, role: 'conductor' },
    ],
  },
  '2026-10-26': {
    weekLabel: 'October 26 – November 1',
    mondayDate: '2026-10-26',
    sourceUrl: 'https://wol.jw.org/es/wol/d/r4/lp-s/202026259',
    songOpening: 125,
    songMiddle: 158,
    songClosing: 54,
    parts: [
      { number: 1, type: 'treasures_talk', title: 'Jehová es un juez justo y misericordioso', duration: 10, role: 'speaker' },
      { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas: Jeremías 48', duration: 10, role: 'speaker' },
      { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia: Jer 48:1-13 (th lección 11)', duration: 4, role: 'student' },
      { number: 4, type: 'student_part', title: 'Empiece conversaciones (DE CASA EN CASA)', duration: 3, role: 'student', student_part_type: 'starting_conversation', location: 'DE CASA EN CASA' },
      { number: 5, type: 'student_part', title: 'Haga revisitas (PREDICACIÓN INFORMAL)', duration: 4, role: 'student', student_part_type: 'following_up', location: 'PREDICACIÓN INFORMAL' },
      { number: 6, type: 'student_part', title: 'Haga discípulos', duration: 5, role: 'student', student_part_type: 'making_disciples' },
      { number: 7, type: 'living_part', title: 'Necesidades de la congregación', duration: 15, role: 'speaker' },
      { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación: wcg cap. 14', duration: 30, role: 'conductor' },
    ],
  },
};

// Generic fallback: 8-part outline matching the standard JW meeting structure
// used when no specific program is found for the week.
// Songs are 0 when the week isn't in the catalog — the UI should treat 0 as "not set".
export const FALLBACK_PROGRAM: Program = {
  weekLabel: '',
  mondayDate: '',
  sourceUrl: '',
  songOpening: 0,
  songMiddle: 0,
  songClosing: 0,
  parts: [
    { number: 1, type: 'treasures_talk', title: 'Tesoros de la Biblia: Discurso', duration: 10, role: 'speaker' },
    { number: 2, type: 'spiritual_gems', title: 'Busquemos perlas escondidas', duration: 10, role: 'speaker' },
    { number: 3, type: 'bible_reading', title: 'Lectura de la Biblia', duration: 4, role: 'student' },
    { number: 4, type: 'student_part', title: 'Empiece conversaciones', duration: 3, role: 'student', student_part_type: 'starting_conversation' },
    { number: 5, type: 'student_part', title: 'Haga revisitas', duration: 4, role: 'student', student_part_type: 'following_up' },
    { number: 6, type: 'student_part', title: 'Haga discípulos', duration: 5, role: 'student', student_part_type: 'making_disciples' },
    { number: 7, type: 'living_part', title: 'Nuestra vida cristiana — Parte 1', duration: 15, role: 'speaker' },
    { number: 8, type: 'cbs', title: 'Estudio bíblico de la congregación', duration: 30, role: 'conductor' },
  ],
};

export function getProgram(meetingDate: string): Program {
  const monday = getMondayOfWeek(meetingDate);
  return PROGRAMS[monday] || FALLBACK_PROGRAM;
}

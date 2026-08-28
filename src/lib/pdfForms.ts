/**
 * Relleno de los formularios oficiales S-30-S y S-25c. SOLO SERVIDOR.
 *
 * Los PDF que publica la organización son AcroForm con campos nombrados
 * (`900_1_Text`, `901_6_S30_Total`…). Rellenarlos da un documento idéntico al
 * que espera la sucursal; recrear el diseño en HTML nunca lo consigue.
 *
 * ── Sobre el mapa de campos ─────────────────────────────────────────────────
 * Los nombres son correlativos y no describen su contenido, y las plantillas
 * llegaron en blanco, así que la correspondencia campo→dato no puede deducirse
 * del archivo. En vez de adivinar en silencio, el mapa de abajo es explícito y
 * editable, y existe un MODO CALIBRACIÓN (`calibrate: true`) que rellena cada
 * casilla con su propio nombre: se imprime una vez, se ve qué casilla es cuál y
 * se corrigen aquí las que no coincidan. Cinco minutos, y queda fijado.
 */
import fs from 'fs';
import path from 'path';
import type { S26, S30, S25c } from './cuentas';

/**
 * Tipos mínimos de pdf-lib. Se declaran aquí y el paquete se carga de forma
 * diferida para que el proyecto compile aunque la dependencia no esté instalada
 * todavía: el resto del módulo Cuentas sigue funcionando y solo esta ruta avisa.
 */
interface PDFTextField { setText(v: string): void; setFontSize(n: number): void }
interface PDFField { getName(): string }
interface PDFForm {
  getTextField(name: string): PDFTextField;
  getFields(): PDFField[];
  updateFieldAppearances?(): void;
}
interface PDFDoc { getForm(): PDFForm; save(): Promise<Uint8Array> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PdfLib {
  PDFDocument: { load(b: Buffer): Promise<PDFDoc> };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PDFName: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PDFArray: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PDFDict: any;
}

async function loadPdfLib(): Promise<PdfLib> {
  // Especificador en variable: evita que TypeScript exija los tipos del paquete
  // en tiempo de compilación. La ruta devuelve un 501 explicable si no está.
  // Se devuelven PDFName/PDFArray/PDFDict junto con PDFDocument para que
  // repairAcroFormFields use la MISMA instancia del módulo: en webpack,
  // dos dynamic import() del mismo especificador pueden dar objetos distintos
  // y entonces instanceof falla, impidiendo que el repair encuentre los campos.
  const mod = 'pdf-lib';
  return import(/* webpackIgnore: false */ mod) as unknown as Promise<PdfLib>;
}
import { monthLabel, ACCOUNTS, type Account } from './cuentasDomain';

const TEMPLATES = path.join(process.cwd(), 'src', 'lib', 'pdf-templates');

export type FormKind = 's26' | 's30' | 's25c';

const TEMPLATE_FILE: Record<FormKind, string> = {
  s26:  'S-26-S.pdf',
  s30:  'S-30-S.pdf',
  s25c: 'S-25c-S.pdf',
};

export function templateExists(kind: FormKind): boolean {
  return fs.existsSync(path.join(TEMPLATES, TEMPLATE_FILE[kind]));
}

/** Importe tal como lo escribe el formulario oficial: sin símbolo, dos decimales. */
const amt = (n: number | null | undefined) =>
  n == null || n === 0 ? '' : n.toFixed(2);

/* ── Mapa S-30-S ────────────────────────────────────────────────────────────
 * Resuelto con el PDF de calibración: los números impresos son la posición del
 * campo en la lista alfabética, y al traducirlos salió esta correspondencia.
 *
 * OJO con las letras: las del formulario oficial NO coinciden con las que usa
 * el motor interno.
 *   oficial (a) fondos al inicio      = a
 *   oficial (b) recibido congregación = donaciones C/DC/DB/DE
 *   oficial (c) otros ingresos        = obra mundial y demás
 *   oficial (d) total de ingresos     = b del motor
 *   oficial (e) gastos congregación   = gastos sin remesas
 *   oficial (f) otros desembolsos     = remesas a la sucursal
 *   oficial (g) total desembolsos     = c del motor
 *   oficial (h) superávit / déficit   = d del motor
 *   oficial (i) fondos al final       = e del motor
 *   oficial (j) reservados            = f del motor
 *   oficial (k) disponibles           = g del motor
 */
function mapS30(s30: S30, header: { label: string; city: string; state: string; treasurer_name?: string }) {
  const inc = (...codes: string[]) =>
    codes.reduce((t, c) => t + (s30.incomeByCode.find(r => r.code === c)?.total ?? 0), 0);
  const exp = (...codes: string[]) =>
    codes.reduce((t, c) => t + (s30.expenseByCode.find(r => r.code === c)?.total ?? 0), 0);

  // INGRESOS
  const cajas       = inc('C', 'DC');
  const electronica = inc('DB', 'DE');
  const recibidoCongre = cajas + electronica;
  const obraMundial = inc('OM', 'DO');
  const otrosIngresos = Math.round((s30.b - recibidoCongre) * 100) / 100;

  // DESEMBOLSOS
  const gastosSalon  = exp('GL', 'GM');
  const resolucion   = exp('RM');
  const oradorVisit  = exp('OV');
  const otrosGastos  = exp('G', 'GA', 'GC', 'GS', 'OT');
  const gastosCongre = gastosSalon + resolucion + oradorVisit + otrosGastos;
  const remesas      = exp('SOM', 'RE', 'ROM');

  const money = (n: number) => amt(Math.round(n * 100) / 100);

  return {
    '900_1_Text': header.label,
    '900_2_Text': monthLabel(s30.ym),

    // (a) Fondos al comienzo del mes
    '901_1_S30_Value': money(s30.a),

    // RECIBIDO PARA LA CONGREGACIÓN
    '901_2_S30_Value': money(cajas),
    '901_3_S30_Value': money(electronica),
    '901_6_S30_Total': money(recibidoCongre),          // (b)

    // OTROS INGRESOS
    '901_7_S30_Value':  money(obraMundial),
    '901_10_S30_Total': money(otrosIngresos),          // (c)
    '901_11_S30_Total': money(s30.b),                  // (d) total de ingresos

    // GASTOS DE LA CONGREGACIÓN — la etiqueta de cada línea libre va en 900_*
    // y su importe en el 901_* de la MISMA fila; separarlos dejaba la cifra
    // huérfana y el concepto sin cantidad.
    '901_12_S30_Value': money(gastosSalon),
    '901_13_S30_Value': money(resolucion),
    '900_7_Text':       oradorVisit > 0 ? 'Orador visitante / discursante (OV)' : '',
    '901_14_S30_Value': money(oradorVisit),
    '900_8_Text':       otrosGastos > 0 ? 'Otros gastos de la congregación' : '',
    '901_15_S30_Value': money(otrosGastos),
    '901_19_S30_Total': money(gastosCongre),           // (e)

    // OTROS DESEMBOLSOS
    '901_20_S30_Value': money(remesas),
    '901_23_S30_Total': money(remesas),                // (f)

    '901_24_S30_Total': money(s30.c),                  // (g) total desembolsos
    '901_25_S30_Total': money(s30.d),                  // (h) superávit / déficit
    '901_26_S30_Total': money(s30.e),                  // (i) fondos al final

    // FONDOS RESERVADOS
    '900_14_Text':      s30.box_kingdom > 0 ? 'Contribuciones para Salones del Reino (DK)' : '',
    '901_27_S30_Value': money(s30.box_kingdom),
    '901_29_S30_Total': money(s30.f),                  // (j)
    '901_30_S30_Total': money(s30.g),                  // (k) disponibles

    // Siervo de cuentas — campo 900_16_Text_C (y≈83, fondo pág 1).
    // Si el campo es incorrecto, generar S-30 calibración para confirmar.
    '900_16_Text_C': header.treasurer_name ?? '',

    // Página 2 — anuncio que se lee a la congregación
    '900_17_Text_C':    monthLabel(s30.ym),
    '901_31_S30_Total': money(recibidoCongre),         // cantidad (b)
    '901_32_S30_Total': money(gastosCongre),           // cantidad (e)
    '901_33_S30_Total': money(s30.e),                  // cantidad (i)
    '901_34_S30_Total': money(remesas),                // cantidad (f)
  } as Record<string, string>;
}

/* ── Mapa S-25c ─────────────────────────────────────────────────────────────
 * Formulario de auditoría trimestral. Es un cuestionario Sí/No/N.A.; no tiene
 * celdas de importes. Los campos se identificaron con el PDF de calibración
 * (campo visual N = posición N en la lista de campos ordenados
 * alfabéticamente). Mapa COMPLETO de los 47 campos:
 *
 *  ENCABEZADO
 *   #11 900_1_Text   → Nombre de la congregación
 *   #22 900_2_Text_C → Trimestre auditado: desde (Mes/Año)
 *   #33 900_3_Text_C → hasta (Mes/Año)
 *   #42 900_4_Text_C → Fecha de la auditoría
 *
 *  VERIFICACIÓN DE LAS DONACIONES
 *   #43 900_5_Text_C  → don.1  ¿Coinciden los totales?
 *   #44 900_6_Text_C  → don.2  ¿Se registran todas las donaciones?
 *   #45 900_7_Text_C  → don.3  ¿Se anotan correctamente los códigos?
 *   #46 900_8_Text_C  → don.4  ¿Se hacen los depósitos semanalmente?
 *   #47 900_9_Text   → comentarios donaciones (línea 1)
 *    #1 900_10_Text  → comentarios donaciones (línea 2)
 *    #2 900_11_Text  → comentarios donaciones (línea 3)
 *
 *  VERIFICACIÓN DE LOS DESEMBOLSOS
 *    #3 900_12_Text_C → des.1a  ¿Hay factura/documento por todos los pagos?
 *    #4 900_13_Text_C → des.1b  ¿Aprueba el coordinador?
 *    #5 900_14_Text_C → des.1c  ¿Aprueba la congregación por resolución?
 *    #6 900_15_Text_C → des.2   ¿Se envían donaciones OM a la sucursal?
 *    #7 900_16_Text_C → des.3   ¿Se envían cantidades totales mensuales?
 *    #8 900_17_Text_C → des.4   ¿Se abonan cargos de la sucursal?
 *    #9 900_18_Text_C → des.5   ¿Coinciden Registro traspaso con acuse?
 *   #10 900_19_Text_C → des.6   ¿Se envían fondos que superan saldo máx?
 *   #12 900_20_Text  → comentarios desembolsos (línea 1)
 *   #13 900_21_Text  → comentarios desembolsos (línea 2)
 *   #14 900_22_Text  → comentarios desembolsos (línea 3)
 *
 *  VERIFICACIÓN DE LA CUENTA PRINCIPAL
 *   #15 900_23_Text_C → cta_p.1  ¿Coincide saldo conciliado?
 *   #16 900_24_Text_C → cta_p.2  ¿Hay S-24 por cada pago?
 *   #17 900_25_Text_C → cta_p.3  ¿Aprobaron coordinador y secretario ajustes?
 *   #18 900_26_Text  → comentarios cuenta principal (líneas 1-4)
 *   #19 900_27_Text
 *   #20 900_28_Text
 *   #21 900_29_Text
 *
 *  VERIFICACIÓN DE LA CUENTA SECUNDARIA
 *   #23 900_30_Text_C → cta_s.1  ¿Coincide saldo secundario conciliado?
 *   #24 900_31_Text_C → cta_s.2  ¿Se aprueban adecuadamente los traspasos?
 *   #25 900_32_Text_C → cta_s.3  ¿Aprobaron coordinador y secretario ajustes?
 *   #26 900_33_Text  → comentarios cuenta secundaria (líneas 1-3)
 *   #27 900_34_Text
 *   #28 900_35_Text
 *
 *  REPASO DE LOS PROCEDIMIENTOS GENERALES
 *   #29 900_36_Text_C → rep.1  ¿Se siguen instrucciones?
 *   #30 900_37_Text_C → rep.2  ¿Son exactos y ordenados los registros?
 *   #31 900_38_Text_C → rep.3  ¿Están al día los registros?
 *   #32 900_39_Text_C → rep.4  ¿Son exactos los informes mensuales?
 *   #34 900_40_Text_C → rep.5  ¿Hay anotación del saldo máximo aprobado?
 *   #35 900_41_Text  → comentarios repaso (líneas 1-5)
 *   … #39 900_45_Text
 *
 *  FIRMAS
 *   #40 900_46_Text_C → Auditoría realizada por
 *   #41 900_47_Text_C → Revisada por (Secretario)
 */
function mapS25c(
  s25c: S25c,
  header: { label: string; city: string; state: string },
  answers: Record<string, string> = {},
) {
  const m = s25c.months;

  // Formato "Mes/Año" para los campos de fecha del trimestre.
  const fmtMonthYear = (ym: string) => {
    if (!ym) return '';
    const [y, mo] = ym.split('-').map(Number);
    return `${String(mo).padStart(2, '0')}/${y}`;
  };

  const out: Record<string, string> = {
    // Encabezado
    '900_1_Text':  header.label,
    '900_2_Text_C': fmtMonthYear(m[0]?.ym ?? ''),
    '900_3_Text_C': fmtMonthYear(m[2]?.ym ?? ''),
    '900_4_Text_C': new Date().toLocaleDateString('es-MX'),
  };

  // Mapa de respuesta del cuestionario → nombre de campo PDF.
  const ANSWER_MAP: Record<string, string> = {
    // Donaciones
    'don.1':   '900_5_Text_C',
    'don.2':   '900_6_Text_C',
    'don.3':   '900_7_Text_C',
    'don.4':   '900_8_Text_C',
    // Desembolsos
    'des.1a':  '900_12_Text_C',
    'des.1b':  '900_13_Text_C',
    'des.1c':  '900_14_Text_C',
    'des.2':   '900_15_Text_C',
    'des.3':   '900_16_Text_C',
    'des.4':   '900_17_Text_C',
    'des.5':   '900_18_Text_C',
    'des.6':   '900_19_Text_C',
    // Cuenta principal
    'cta_p.1': '900_23_Text_C',
    'cta_p.2': '900_24_Text_C',
    'cta_p.3': '900_25_Text_C',
    // Cuenta secundaria
    'cta_s.1': '900_30_Text_C',
    'cta_s.2': '900_31_Text_C',
    'cta_s.3': '900_32_Text_C',
    // Repaso de procedimientos generales
    'rep.1':   '900_36_Text_C',
    'rep.2':   '900_37_Text_C',
    'rep.3':   '900_38_Text_C',
    'rep.4':   '900_39_Text_C',
    'rep.5':   '900_40_Text_C',
    // Firmas
    'auditor':     '900_46_Text_C',
    'secretario':  '900_47_Text_C',
  };

  // Mapa de notas/comentarios por sección → campos de texto libre.
  const NOTE_FIELDS: Record<string, string[]> = {
    'don_notes':   ['900_9_Text',  '900_10_Text', '900_11_Text'],
    'des_notes':   ['900_20_Text', '900_21_Text', '900_22_Text'],
    'cta_p_notes': ['900_26_Text', '900_27_Text', '900_28_Text', '900_29_Text'],
    'cta_s_notes': ['900_33_Text', '900_34_Text', '900_35_Text'],
    'rep_notes':   ['900_41_Text', '900_42_Text', '900_43_Text', '900_44_Text', '900_45_Text'],
  };

  const labelOf = (raw: string) =>
    raw === 'si' ? 'Sí' : raw === 'no' ? 'No' : raw === 'na' ? 'N.A.' : raw;

  for (const [key, field] of Object.entries(ANSWER_MAP)) {
    const raw = answers[key];
    if (raw) out[field] = labelOf(raw);
  }

  // Notas de sección: se unen hasta 5 notas individuales en las líneas disponibles.
  for (const [noteKey, fields] of Object.entries(NOTE_FIELDS)) {
    const raw = answers[noteKey] ?? '';
    if (!raw) continue;
    // Partir por saltos de línea y distribuir en los campos de línea.
    const lines = raw.split('\n').filter(Boolean);
    lines.forEach((line, i) => {
      if (fields[i]) out[fields[i]] = line.slice(0, 200);
    });
  }

  return out;
}

/* ── Mapa S-26-S ────────────────────────────────────────────────────────────
 * La hoja de cuentas tiene 533 campos en cuatro bloques (900_ a 904_): la
 * rejilla de asientos ocupa la mayoría y la página 2 lleva la conciliación.
 * Aquí van el encabezado y los totales, que son los que se pueden fijar sin
 * ambigüedad. La correspondencia fila→campo de la rejilla se establece con el
 * modo calibración: imprime el PDF con cada casilla rotulada, y con esa
 * referencia se completa ROW_FIELDS de abajo.
 */
/**
 * Rejilla del S-26, deducida de la numeración de los campos.
 *
 * El formulario tiene 53 filas. Las 52 primeras son asientos y la 53 es la de
 * totales. La correspondencia se obtuvo contrastando las coordenadas de los
 * widgets con una impresión real:
 *
 *   fila N   fecha        900_(6+N)_Text_C      → 900_7 … 900_58
 *            descripción  900_(58+N)_Text       → 900_59 … 900_110
 *            código CT    900_(110+N)_Text_C    → 900_111 … 900_162
 *            importes     90{1,2,3}_N (entrada) y 90{1,2,3}_(N+53) (salida)
 *
 * Confirmado con un PDF de calibración impreso: los números que muestra cada
 * casilla son la posición del campo en la lista ordenada alfabéticamente, y al
 * resolverlos salió que la primera fila usa 900_7 / 900_59 / 900_111.
 * Los totales de columna usan el índice 53 de cada bloque.
 */
const S26_ROWS = 52;
const S26_TOTALS_INDEX = 53;

function s26RowFields(n: number) {           // n es 1-based
  return {
    date: `900_${6 + n}_Text_C`,
    desc: `900_${58 + n}_Text`,
    code: `900_${110 + n}_Text_C`,
    cols: {
      caja:      { in: `901_${n}_S26Value`, out: `901_${n + 53}_S26Value` },
      corriente: { in: `902_${n}_S26Value`, out: `902_${n + 53}_S26Value` },
      sucursal:  { in: `903_${n}_S26Value`, out: `903_${n + 53}_S26Value` },
    } as Record<Account, { in: string; out: string }>,
  };
}

function mapS26(s26: S26, header: { label: string; city: string; state: string }) {
  const out: Record<string, string> = {
    '900_1_Text_C': header.label,
    '900_2_Text_C': header.city,
    '900_3_Text_C': header.state,
    '900_4_Text_C': s26.monthLabel,
  };

  // Primera línea: el saldo inicial del mes, como en la hoja del programa anterior.
  const first = s26RowFields(1);
  out[first.desc] = `SALDO INICIAL DEL MES — ${s26.openingTotal.toFixed(2)}`;

  s26.rows.slice(0, S26_ROWS - 1).forEach((r, i) => {
    const f = s26RowFields(i + 2);          // la fila 1 la ocupa el saldo inicial
    out[f.date] = String(Number(r.date.slice(8, 10)));
    out[f.desc] = r.description;
    out[f.code] = r.code ?? '';
    for (const a of ACCOUNTS) {
      out[f.cols[a].in]  = amt(r.cols[a].in);
      out[f.cols[a].out] = amt(r.cols[a].out);
    }
  });

  // Fila de totales de todas las columnas.
  // Los campos de totales usan S26TotalValue (no S26Value como los asientos).
  const t = S26_TOTALS_INDEX;
  out[`900_${58 + t}_Text`] = 'TOTALES DE TODAS LAS COLUMNAS';
  const blocks: Record<Account, string> = { caja: '901', corriente: '902', sucursal: '903' };
  for (const a of ACCOUNTS) {
    out[`${blocks[a]}_${t}_S26TotalValue`]      = amt(s26.totals[a].in);
    out[`${blocks[a]}_${t + 53}_S26TotalValue`] = amt(s26.totals[a].out);
  }

  // Página 2 — Conciliación Cuenta Principal (Caja de dinero en efectivo).
  // La congregación no tiene cuenta secundaria, así que 904_44-56 se dejan
  // en blanco (son los campos de CONCILIACIÓN CUENTA SECUNDARIA, no del resumen).
  out['904_1_Text_C']          = new Date().toLocaleDateString('es-MX');
  out['904_24_S26Amount']      = amt(s26.closing.corriente);   // dinero en caja
  out['904_27_S26TotalAmount'] = amt(s26.closing.corriente);   // saldo conciliado

  // Página 2 — RESUMEN DE LA HOJA DE CUENTAS
  out['904_28_Text_C']         = s26.monthLabel;
  out['904_29_S26Amount']      = amt(s26.opening.caja);
  out['904_30_S26TotalAmount'] = amt(s26.totals.caja.in);
  out['904_31_S26TotalAmount'] = amt(s26.totals.caja.out);
  out['904_32_S26TotalAmount'] = amt(s26.closing.caja);
  out['904_33_S26Amount']      = amt(s26.opening.corriente);
  out['904_34_S26TotalAmount'] = amt(s26.totals.corriente.in);
  out['904_35_S26TotalAmount'] = amt(s26.totals.corriente.out);
  out['904_36_S26TotalAmount'] = amt(s26.closing.corriente);
  // 904_38-41: CUENTA SECUNDARIA — vacío (la congregación no tiene cuenta secundaria)
  out['904_42_S26TotalAmount'] = amt(s26.closingTotal);

  return out;
}

export async function fillS26(
  s26: S26,
  header: { label: string; city: string; state: string },
  opts: FillOptions = {},
): Promise<Uint8Array> {
  return fill('s26', mapS26(s26, header), opts);
}

/** Valores que se escribirían, para verificar el mapa sin abrir el PDF. */
export function previewValues(
  kind: FormKind,
  data: { s26?: S26; s30?: S30; s25c?: S25c },
  header: { label: string; city: string; state: string },
  answers: Record<string, string> = {},
): Record<string, string> {
  if (kind === 's26'  && data.s26)  return mapS26(data.s26, header);
  if (kind === 's30'  && data.s30)  return mapS30(data.s30, header);
  if (kind === 's25c' && data.s25c) return mapS25c(data.s25c, header, answers);
  return {};
}

/* ── Relleno ────────────────────────────────────────────────────────────────── */

function setField(form: PDFForm, name: string, value: string, size = 8) {
  try {
    const f = form.getTextField(name);
    f.setText(value);
    // Sin tamaño explícito, pdf-lib usa el automático y el texto sale enorme:
    // los campos del encabezado son altos y el ajuste automático los llena.
    try { f.setFontSize(size); } catch { /* campo sin tipografía propia */ }
  } catch {
    // Campo inexistente o de otro tipo (casilla de verificación): se ignora.
  }
}

/** Correspondencia número→campo de la última calibración generada. */
export let calibrationLegend: string[] = [];

export interface FillOptions {
  /** Rellena cada casilla con su propio nombre, para ajustar el mapa. */
  calibrate?: boolean;
}

export async function fillS30(
  s30: S30,
  header: { label: string; city: string; state: string; treasurer_name?: string },
  opts: FillOptions = {},
): Promise<Uint8Array> {
  return fill('s30', mapS30(s30, header), opts);
}

export async function fillS25c(
  s25c: S25c,
  header: { label: string; city: string; state: string },
  opts: FillOptions = {},
  answers: Record<string, string> = {},
): Promise<Uint8Array> {
  return fill('s25c', mapS25c(s25c, header, answers), opts);
}

/**
 * Algunos PDF de la organización (S-25c-S.pdf) tienen los Widget annotations
 * en las páginas pero el array /AcroForm/Fields vacío, así que pdf-lib
 * devuelve form.getFields() === [] aunque haya campos físicamente en el PDF.
 * Esta función los vincula antes de operar.
 *
 * Usa duck-typing en vez de instanceof para evitar fallos cuando webpack
 * crea instancias distintas del módulo (instanceof PDFDict/PDFArray falla
 * cross-chunk y el repair se silencia sin escribir nada).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function repairAcroFormFields(pdf: any, lib: PdfLib): Promise<void> {
  try {
    const { PDFName, PDFArray } = lib;

    const context = pdf.context;
    const pages = pdf.getPages();
    const widgetRefs: unknown[] = [];

    for (const page of pages) {
      const annotsRaw = page.node.get(PDFName.of('Annots'));
      if (!annotsRaw) continue;
      // PDFArray guard funciona aquí porque Annots siempre viene de la misma
      // instancia del módulo que cargó el PDF.
      const arr = context.lookupMaybe(annotsRaw, PDFArray) ?? annotsRaw;
      if (typeof arr?.size !== 'function') continue;
      for (let i = 0; i < arr.size(); i++) widgetRefs.push(arr.get(i));
    }
    if (widgetRefs.length === 0) return;

    // AcroForm puede estar inline (PDFDict con .get()) o como ref (PDFRef sin .get()).
    // Se usa duck-typing para no depender de instanceof cross-chunk.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acroFormRaw: any = pdf.catalog.get(PDFName.of('AcroForm'));
    if (!acroFormRaw) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const acroForm: any = typeof acroFormRaw.get === 'function'
      ? acroFormRaw
      : context.indirectObjects?.get(acroFormRaw);
    if (typeof acroForm?.get !== 'function') return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fieldsRaw: any = acroForm.get(PDFName.of('Fields'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any = fieldsRaw
      ? (typeof fieldsRaw.size === 'function'
          ? fieldsRaw
          : context.indirectObjects?.get(fieldsRaw))
      : null;
    if (existing && typeof existing.size === 'function' && existing.size() > 0) return;

    acroForm.set(PDFName.of('Fields'), context.obj(widgetRefs));
  } catch {
    // Fallo silencioso — si la reparación no corre, los campos no se escriben
    // pero el PDF sigue siendo válido y editable a mano.
  }
}

async function fill(
  kind: FormKind, values: Record<string, string>, opts: FillOptions,
): Promise<Uint8Array> {
  const file = path.join(TEMPLATES, TEMPLATE_FILE[kind]);
  if (!fs.existsSync(file)) {
    throw new Error(`Falta la plantilla oficial ${TEMPLATE_FILE[kind]} en src/lib/pdf-templates/`);
  }

  const lib = await loadPdfLib();
  const pdf = await lib.PDFDocument.load(fs.readFileSync(file));

  // Vincular widgets sueltos al AcroForm (necesario para S-25c-S.pdf).
  // Se pasa `lib` para que PDFName/PDFArray/PDFDict sean de la misma instancia.
  await repairAcroFormFields(pdf, lib);

  const form = pdf.getForm();

  // La plantilla puede traer valores previos —la del S-25c llegó con una
  // auditoría de ejemplo rellena—, y lo que no se sobrescriba se imprimiría como
  // si fuera de esta congregación. Se vacían todos los campos primero.
  for (const f of form.getFields()) setField(form, f.getName(), '');

  if (opts.calibrate) {
    // Cada casilla lleva un número correlativo, no el nombre interno del campo:
    // el nombre no dice nada a quien mira el formulario impreso. Con el número
    // basta para señalar «la casilla 37 debería llevar el total de ingresos».
    const names = form.getFields().map(f => f.getName()).sort();
    names.forEach((n, i) => setField(form, n, String(i + 1), 6));
    calibrationLegend = names.map((n, i) => `${i + 1} = ${n}`);
  } else {
    for (const [name, value] of Object.entries(values)) {
      if (value !== '') setField(form, name, value);
    }
  }

  // Deja el PDF editable: el siervo de cuentas suele completar a mano las
  // preguntas de la auditoría y las líneas que el sistema no conoce.
  form.updateFieldAppearances?.();
  return pdf.save();
}

/** Nombres de todos los campos de una plantilla, para depuración. */
export async function listFields(kind: FormKind): Promise<string[]> {
  const file = path.join(TEMPLATES, TEMPLATE_FILE[kind]);
  const { PDFDocument } = await loadPdfLib();
  const pdf = await PDFDocument.load(fs.readFileSync(file));
  return pdf.getForm().getFields().map(f => f.getName());
}

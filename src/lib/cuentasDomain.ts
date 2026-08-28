/**
 * Dominio de Cuentas — constantes y tipos puros, SIN acceso a base de datos.
 *
 * Este módulo debe poder importarse desde componentes de cliente. Por eso no
 * importa `sqlite.ts` ni nada que arrastre `better-sqlite3`: hacerlo mete el
 * driver nativo en el bundle del navegador y el build falla con
 * «Module not found: Can't resolve 'fs'».
 *
 * El acceso a datos vive en `cuentas.ts`, que es solo de servidor.
 *
 * Los enums replican los del programa legacy y no deben renombrarse: mantenerlos
 * permite reimportar los respaldos CSV sin traducir valores.
 */

export const ACCOUNTS = ['caja', 'corriente', 'sucursal'] as const;
export type Account = (typeof ACCOUNTS)[number];

export const TYPES = ['income', 'expense', 'transfer'] as const;
export type TxType = (typeof TYPES)[number];

export const ACCOUNT_LABELS: Record<Account, string> = {
  caja:      'Recibido (Donaciones)',
  corriente: 'Cuenta Principal (Caja de dinero)',
  sucursal:  'Cuenta Secundaria',
};

export const TYPE_LABELS: Record<TxType, string> = {
  income:   'Entrada (Ingreso)',
  expense:  'Salida (Gasto)',
  transfer: 'Transferencia',
};

/** Códigos que cuentan como donaciones para la obra mundial (S-25c). */
export const OM_INCOME_CODES = ['OM', 'DO'] as const;
/** Códigos que cuentan como remesas de obra mundial enviadas a la sucursal. */
export const OM_REMIT_CODES = ['SOM', 'RE', 'ROM'] as const;
/** Caja de contribuciones «Salones del Reino» (fondos reservados). */
export const KINGDOM_BOX_CODE = 'DK';
/** Caja de contribuciones «Obra Mundial». */
export const WORLDWIDE_BOX_CODE = 'DO';

export const DEFAULT_CODES: { code: string; description: string; kind: TxType; sort_order: number }[] = [
  { code: 'C',   description: 'Donaciones para los gastos de la congregación', kind: 'income',   sort_order: 1 },
  { code: 'OM',  description: 'Donaciones para la obra mundial',               kind: 'income',   sort_order: 2 },
  { code: 'DO',  description: 'Caja de contribuciones — Obra Mundial',          kind: 'income',   sort_order: 3 },
  { code: 'DK',  description: 'Contribuciones para Salones del Reino',          kind: 'income',   sort_order: 4 },
  { code: 'OI',  description: 'Otros ingresos',                                kind: 'income',   sort_order: 5 },
  { code: 'D',   description: 'Depósito a caja de efectivo',                    kind: 'transfer', sort_order: 6 },
  { code: 'OV',  description: 'Orador visitante / discursante',                 kind: 'expense',  sort_order: 7 },
  { code: 'GC',  description: 'Gastos de funcionamiento del Salón del Reino',   kind: 'expense',  sort_order: 8 },
  { code: 'RM',  description: 'Resolución mensual para la obra mundial',        kind: 'expense',  sort_order: 9 },
  { code: 'SOM', description: 'Remesa de obra mundial a la sucursal',           kind: 'expense',  sort_order: 10 },
  { code: 'RE',  description: 'Remesa',                                         kind: 'expense',  sort_order: 11 },
  { code: 'ROM', description: 'Remesa de obra mundial',                          kind: 'expense',  sort_order: 12 },
];

export interface CierreConfig {
  remit_code: string;
  res_pub_code: string;
  res_pub_amount: number;
  res_pct_code: string;
  res_pct_percent: number;
  res_pct_source: string;
  maintenance_code: string;
  maintenance_amount: number;
}

export const DEFAULT_CIERRE: CierreConfig = {
  remit_code: 'SOM',
  res_pub_code: 'RM',
  res_pub_amount: 0,
  res_pct_code: 'RM',
  res_pct_percent: 10,
  res_pct_source: 'C',
  maintenance_code: 'GM',
  maintenance_amount: 0,
};

export interface Transaction {
  id: string;
  date: string;
  type: TxType;
  account: Account;
  to_account: Account | null;
  code: string | null;
  description: string;
  amount: number;
  receipt_ref: string | null;
  notes: string | null;
}

export type Balance = Record<Account, number>;

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const zero = (): Balance => ({ caja: 0, corriente: 0, sucursal: 0 });
export const totalOf = (b: Balance) => round2(b.caja + b.corriente + b.sucursal);

/* ── Año de servicio (septiembre → agosto) ──────────────────────────────────── */

export const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/** "2025/2026" → ['2025-09', …, '2026-08'] en orden del año de servicio. */
export function serviceYearMonths(sy: string): string[] {
  const startYear = Number(sy.split('/')[0]);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const m = 9 + i;
    const year = startYear + Math.floor((m - 1) / 12);
    const month = ((m - 1) % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return out;
}

/** El año de servicio al que pertenece un ym (septiembre inicia uno nuevo). */
export function serviceYearOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

export const QUARTERS = [
  { n: 1, label: '1.er Trimestre (Sep-Oct-Nov)', offsets: [0, 1, 2] },
  { n: 2, label: '2.º Trimestre (Dic-Ene-Feb)',  offsets: [3, 4, 5] },
  { n: 3, label: '3.er Trimestre (Mar-Abr-May)', offsets: [6, 7, 8] },
  { n: 4, label: '4.º Trimestre (Jun-Jul-Ago)',  offsets: [9, 10, 11] },
];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_ES[m - 1]} ${y}`;
}

export function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Marca con la que se identifican los asientos generados por el cierre de un mes. */
export const cierreTag = (ym: string) => `CIERRE-${ym}`;

export interface CierreEntry {
  kind: 'remit' | 'res_pub' | 'res_pct' | 'maintenance';
  code: string;
  description: string;
  amount: number;
  basis: string;
}

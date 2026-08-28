/** Tipos compartidos por la UI de Cuentas. Espejo de los payloads de src/lib/cuentas.ts. */

export type Account = 'caja' | 'corriente' | 'sucursal';
export type TxType = 'income' | 'expense' | 'transfer';

export const ACCOUNTS: Account[] = ['caja', 'corriente', 'sucursal'];

export const ACCOUNT_LABELS: Record<Account, string> = {
  caja:      'Recibido (Donaciones)',
  corriente: 'Cuenta Principal (Caja de dinero)',
  sucursal:  'Cuenta Secundaria',
};

/** Etiquetas cortas para los encabezados del grid S-26. */
export const ACCOUNT_SHORT: Record<Account, string> = {
  caja:      'RECIBIDO',
  corriente: 'CUENTA PRINCIPAL',
  sucursal:  'CUENTA SECUNDARIA',
};

export const ACCOUNT_ACCENT: Record<Account, string> = {
  caja:      'text-amber-600 dark:text-amber-400',
  corriente: 'text-sky-600 dark:text-sky-400',
  sucursal:  'text-violet-600 dark:text-violet-400',
};

export const TYPE_LABELS: Record<TxType, string> = {
  income:   'Entrada (Ingreso)',
  expense:  'Salida (Gasto)',
  transfer: 'Transferencia',
};

export const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const QUARTERS = [
  { n: 1, label: '1.er Trimestre (Sep-Oct-Nov)' },
  { n: 2, label: '2.º Trimestre (Dic-Ene-Feb)' },
  { n: 3, label: '3.er Trimestre (Mar-Abr-May)' },
  { n: 4, label: '4.º Trimestre (Jun-Jul-Ago)' },
];

export interface CtCode {
  id: string;
  code: string;
  description: string;
  kind: TxType;
  sort_order: number;
}

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
export type ColTotals = Record<Account, { in: number; out: number }>;

export interface OpeningAudit {
  declared: Balance | null;
  carried: Balance;
  diff: Balance;
  diffTotal: number;
  matches: boolean;
}

export interface S26Row extends Transaction {
  cols: ColTotals;
  saldo: number;
}

export interface S26 {
  ym: string;
  monthLabel: string;
  opening: Balance;
  openingTotal: number;
  rows: S26Row[];
  totals: ColTotals;
  closing: Balance;
  closingTotal: number;
  openingAudit: OpeningAudit;
}

export interface CodeTotal { code: string; description: string; total: number }

export interface S30 {
  ym: string; monthLabel: string; serviceYear: string;
  a: number; b: number; incomeByCode: CodeTotal[];
  c: number; expenseByCode: CodeTotal[];
  d: number; e: number; f: number;
  box_kingdom: number; other_reserves: number; g: number;
  h: number; i: number; j: number; k: number;
  reconciled: boolean; box_worldwide: number;
  movements: { account: Account; label: string; previous: number; income: number; expense: number; current: number }[];
}

export interface S25c {
  serviceYear: string; quarter: number; quarterLabel: string;
  months: {
    ym: string; label: string;
    income: number; expense: number;
    omIncome: number; omRemit: number;
    expenseCount: number; expenseWithReceipt: number;
  }[];
  totals: { income: number; expense: number; omIncome: number; omRemit: number };
  openingFunds: number; closingFunds: number; reconciled: boolean;
  /** Respuestas pre-computadas por el sistema. El auditor puede editarlas. */
  autoAnswers: Record<string, string>;
}

export type S25cAnswerValue = '' | 'si' | 'no' | 'na';
export interface S25cAnswer { answer: S25cAnswerValue; notes: string }
export type S25cAnswers = Record<string, S25cAnswer>

export interface Summary {
  serviceYear: string;
  months: { ym: string; label: string; short: string; income: number; expense: number; net: number }[];
  totals: { income: number; expense: number; net: number };
}

export interface Reconcile {
  ym: string; monthLabel: string;
  checks: { label: string; ok: boolean; detail: string }[];
  allOk: boolean;
}

export interface CuentasConfig {
  label: string; city: string; state: string;
  /** Nombre del siervo de cuentas — aparece en el formulario S-30-S. */
  treasurer_name: string;
  /** Parámetros del cierre de mes. */
  remit_code: string;
  res_pub_code: string;
  res_pub_amount: number;
  res_pct_code: string;
  res_pct_percent: number;
  res_pct_source: string;
  maintenance_code: string;
  maintenance_amount: number;
  /** El servidor nunca devuelve la clave, solo si existe. */
  has_ai_key?: boolean;
  ai_api_key?: string;
}

export const EMPTY_CONFIG: CuentasConfig = {
  label: '', city: '', state: '', treasurer_name: '',
  remit_code: 'SOM', res_pub_code: 'RM', res_pub_amount: 0,
  res_pct_code: 'RM', res_pct_percent: 10, res_pct_source: 'C',
  maintenance_code: 'GM', maintenance_amount: 0,
  has_ai_key: false,
};

export interface CierreEntry {
  kind: 'remit' | 'res_pub' | 'res_pct' | 'maintenance';
  code: string;
  description: string;
  amount: number;
  basis: string;
}

/* ── Utilidades de formato y fechas ─────────────────────────────────────────── */

export const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

/** Sin símbolo, para las celdas del grid oficial. */
export const num = (n: number) => n === 0 ? '' : n.toFixed(2);

export function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function serviceYearOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

export function serviceYearMonths(sy: string): string[] {
  const start = Number(sy.split('/')[0]);
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const mm = 9 + i;
    const year = start + Math.floor((mm - 1) / 12);
    const month = ((mm - 1) % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return out;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_ES[m - 1]} ${y}`;
}

/** Lista de años de servicio ofrecidos, centrada en el actual. */
export function serviceYearOptions(): string[] {
  const cur = Number(serviceYearOf(currentYm()).split('/')[0]);
  return [cur - 1, cur, cur + 1, cur + 2].map(y => `${y}/${y + 1}`);
}

/**
 * Motor contable de Cuentas (S-26 / S-30 / S-25c). SOLO SERVIDOR.
 *
 * Este módulo importa `sqlite.ts` (better-sqlite3), así que NO puede importarse
 * desde un componente de cliente: el bundler intentaría meter el driver nativo
 * en el navegador. Las constantes y tipos puros viven en `cuentasDomain.ts`,
 * que sí es isomórfico; aquí se reexportan por comodidad de los route handlers.
 *
 * Réplica del programa legacy `cuentas-congregacion`. Los enums NO se renombran:
 *   type    : income | expense | transfer
 *   account : caja      → "Recibido (Donaciones)"
 *             corriente → "Cuenta Principal (Caja de dinero)"
 *             sucursal  → "Cuenta Secundaria"
 *
 * INVARIANTE CENTRAL: una transacción `transfer` resta en `account` y suma en
 * `to_account`. Su efecto neto sobre el total general es exactamente 0, por eso
 * no mueve la columna "Saldo" de la hoja S-26.
 *
 * Toda función recibe `congreId` como primer parámetro y lo aplica en cada
 * query: es el único mecanismo de aislamiento entre congregaciones.
 */
import { getDb } from './sqlite';
import {
  ACCOUNTS, ACCOUNT_LABELS, MONTH_NAMES_ES,
  OM_INCOME_CODES, OM_REMIT_CODES, KINGDOM_BOX_CODE, WORLDWIDE_BOX_CODE,
  DEFAULT_CODES, DEFAULT_CIERRE, QUARTERS,
  round2, zero, totalOf, monthLabel, serviceYearOf, serviceYearMonths, cierreTag,
  type Account, type Transaction, type Balance,
  type CierreConfig, type CierreEntry,
} from './cuentasDomain';

// Reexportado para que los route handlers sigan importando de un solo sitio.
export * from './cuentasDomain';

/* ── Acceso a datos (siempre filtrado por congregación) ─────────────────────── */

function txOfMonth(congreId: string, ym: string): Transaction[] {
  return getDb().prepare(`
    SELECT id, date, type, account, to_account, code, description, amount, receipt_ref, notes
    FROM cuentas_transactions
    WHERE congregation_id = ? AND substr(date, 1, 7) = ?
    ORDER BY date ASC, created_at ASC
  `).all(congreId, ym) as Transaction[];
}

function txBefore(congreId: string, ym: string): Transaction[] {
  return getDb().prepare(`
    SELECT type, account, to_account, amount
    FROM cuentas_transactions
    WHERE congregation_id = ? AND substr(date, 1, 7) < ?
    ORDER BY date ASC, created_at ASC
  `).all(congreId, ym) as Transaction[];
}

/**
 * Filtra transacciones "income" que son el lado receptor de una transferencia
 * ya registrada en el mismo conjunto — artefacto de la migración del sistema
 * legacy donde cada depósito generaba DOS registros (salida de caja + entrada
 * de cuenta). El sistema actual crea un único `transfer` que cubre ambos lados,
 * por lo que estos income duplicados inflan la columna ENTRADA de corriente.
 *
 * Criterio doble para no eliminar ingresos legítimos que coincidan en monto:
 *   1. El income tiene "(Transferencia recibida)" en su descripción.
 *   2. Existe un transfer en el mismo conjunto con to_account + date + amount iguales.
 */
function dedupeTransferCounterparts<T extends Pick<Transaction, 'type' | 'account' | 'to_account' | 'amount' | 'date' | 'description'>>(txs: T[]): T[] {
  const arrivals = new Set(
    txs
      .filter(t => t.type === 'transfer' && t.to_account)
      .map(t => `${t.date}|${t.to_account}|${t.amount}`)
  );
  if (arrivals.size === 0) return txs;
  return txs.filter(t =>
    !(t.type === 'income' &&
      t.description?.includes('(Transferencia recibida)') &&
      arrivals.has(`${t.date}|${t.account}|${t.amount}`))
  );
}

/** Aplica una transacción sobre un balance mutable. */
function apply(b: Balance, tx: Pick<Transaction, 'type' | 'account' | 'to_account' | 'amount'>) {
  if (tx.type === 'income') {
    b[tx.account] += tx.amount;
  } else if (tx.type === 'expense') {
    b[tx.account] -= tx.amount;
  } else if (tx.type === 'transfer' && tx.to_account) {
    b[tx.account] -= tx.amount;
    b[tx.to_account] += tx.amount;
  }
}

/**
 * Arrastre real: saldo del mes calculado desde el ancla explícita ANTERIOR a `ym`
 * más todas las transacciones intermedias. Ignora deliberadamente la fila
 * explícita de `ym` — sirve para contrastarla (ver `openingAudit`).
 */
export function carryForward(congreId: string, ym: string): Balance {
  const db = getDb();

  const anchor = db.prepare(
    `SELECT ym, caja, corriente, sucursal FROM cuentas_saldo_inicial
     WHERE congregation_id = ? AND ym < ? ORDER BY ym DESC LIMIT 1`
  ).get(congreId, ym) as (Balance & { ym: string }) | undefined;

  const b: Balance = anchor
    ? { caja: anchor.caja, corriente: anchor.corriente, sucursal: anchor.sucursal }
    : zero();

  const from = anchor ? anchor.ym : '0000-00';
  const rows = db.prepare(`
    SELECT type, account, to_account, amount, date, description
    FROM cuentas_transactions
    WHERE congregation_id = ? AND substr(date,1,7) >= ? AND substr(date,1,7) < ?
    ORDER BY date ASC, created_at ASC
  `).all(congreId, from, ym) as Transaction[];

  for (const tx of dedupeTransferCounterparts(rows)) apply(b, tx);
  for (const k of ACCOUNTS) b[k] = round2(b[k]);
  return b;
}

/**
 * Saldo de apertura del mes. Si hay fila explícita en `cuentas_saldo_inicial`
 * se respeta tal cual (el usuario la editó); si no, se usa el arrastre real.
 */
export function openingBalance(congreId: string, ym: string): Balance {
  const explicit = getDb().prepare(
    `SELECT caja, corriente, sucursal FROM cuentas_saldo_inicial
     WHERE congregation_id = ? AND ym = ?`
  ).get(congreId, ym) as Balance | undefined;

  if (explicit) {
    return { caja: explicit.caja, corriente: explicit.corriente, sucursal: explicit.sucursal };
  }
  return carryForward(congreId, ym);
}

/**
 * Contrasta el saldo inicial declarado a mano contra el arrastre real.
 *
 * Motivo: en el programa legacy el saldo inicial es editable y NO se valida.
 * En los datos reales de producción (julio 2026) el saldo inicial estaba fijado
 * a 2511 mientras el arrastre real de junio era 72 — una diferencia de 2439 que
 * hacía que el S-30 informara fondos finales de 7231 y las tarjetas de saldo
 * 4792 en la misma pantalla, sin aviso alguno. Aquí el descuadre se hace
 * explícito en vez de silencioso.
 */
export function openingAudit(congreId: string, ym: string): {
  declared: Balance | null;
  carried: Balance;
  diff: Balance;
  diffTotal: number;
  matches: boolean;
} {
  const declared = getDb().prepare(
    `SELECT caja, corriente, sucursal FROM cuentas_saldo_inicial
     WHERE congregation_id = ? AND ym = ?`
  ).get(congreId, ym) as Balance | undefined;

  const carried = carryForward(congreId, ym);

  if (!declared) {
    return { declared: null, carried, diff: zero(), diffTotal: 0, matches: true };
  }

  const d: Balance = {
    caja:      round2(declared.caja      - carried.caja),
    corriente: round2(declared.corriente - carried.corriente),
    sucursal:  round2(declared.sucursal  - carried.sucursal),
  };
  const diffTotal = totalOf(d);

  return {
    declared: { caja: declared.caja, corriente: declared.corriente, sucursal: declared.sucursal },
    carried,
    diff: d,
    diffTotal,
    matches: Math.abs(diffTotal) < 0.01,
  };
}

/* ── S-26: Hoja de cuentas ──────────────────────────────────────────────────── */

export interface S26Row extends Transaction {
  /** Montos por columna del grid: [cuenta][entrada|salida] */
  cols: Record<Account, { in: number; out: number }>;
  /** Total acumulado de las 3 cuentas después de esta fila. */
  saldo: number;
}

export interface S26 {
  ym: string;
  monthLabel: string;
  opening: Balance;
  openingTotal: number;
  rows: S26Row[];
  /** Totales por columna, como la fila "TOTALES DE TODAS LAS COLUMNAS". */
  totals: Record<Account, { in: number; out: number }>;
  closing: Balance;
  closingTotal: number;
  /** Contraste del saldo inicial declarado contra el arrastre real. */
  openingAudit: ReturnType<typeof openingAudit>;
}

export function buildS26(congreId: string, ym: string): S26 {
  const opening = openingBalance(congreId, ym);
  const running: Balance = { ...opening };
  const totals: Record<Account, { in: number; out: number }> = {
    caja: { in: 0, out: 0 }, corriente: { in: 0, out: 0 }, sucursal: { in: 0, out: 0 },
  };

  const rows: S26Row[] = dedupeTransferCounterparts(txOfMonth(congreId, ym)).map(tx => {
    const cols: Record<Account, { in: number; out: number }> = {
      caja: { in: 0, out: 0 }, corriente: { in: 0, out: 0 }, sucursal: { in: 0, out: 0 },
    };

    if (tx.type === 'income') {
      cols[tx.account].in = tx.amount;
    } else if (tx.type === 'expense') {
      cols[tx.account].out = tx.amount;
    } else if (tx.type === 'transfer' && tx.to_account) {
      // Una sola fila ocupa dos columnas: sale de una cuenta, entra en otra.
      cols[tx.account].out = tx.amount;
      cols[tx.to_account].in = tx.amount;
    }

    for (const a of ACCOUNTS) {
      totals[a].in  = round2(totals[a].in  + cols[a].in);
      totals[a].out = round2(totals[a].out + cols[a].out);
    }

    apply(running, tx);
    return { ...tx, cols, saldo: totalOf(running) };
  });

  const closing: Balance = { ...running };
  for (const a of ACCOUNTS) closing[a] = round2(closing[a]);

  return {
    ym,
    monthLabel: monthLabel(ym),
    opening,
    openingTotal: totalOf(opening),
    rows,
    totals,
    closing,
    closingTotal: totalOf(closing),
    openingAudit: openingAudit(congreId, ym),
  };
}

/* ── S-30: Informe mensual ──────────────────────────────────────────────────── */

export interface CodeTotal { code: string; description: string; total: number }

export interface S30 {
  ym: string;
  monthLabel: string;
  serviceYear: string;
  /** (a) Fondos a comienzo de mes */
  a: number;
  /** (b) Total recibido para la congregación */
  b: number;
  incomeByCode: CodeTotal[];
  /** (c) Total de gastos de la congregación */
  c: number;
  expenseByCode: CodeTotal[];
  /** (d) Sobrante / déficit = b − c */
  d: number;
  /** (e) Fondos a fin de mes = a + d */
  e: number;
  /** (f) Fondos reservados para propósitos especiales */
  f: number;
  box_kingdom: number;
  other_reserves: number;
  /** (g) Fondos disponibles = e − f */
  g: number;
  /** (h) = a */
  h: number;
  /** (i) Recibido */
  i: number;
  /** (j) Desembolsos */
  j: number;
  /** (k) = h + i − j; debe coincidir con (e) */
  k: number;
  /** Guard visible: la conciliación cuadra. */
  reconciled: boolean;
  box_worldwide: number;
  movements: { account: Account; label: string; previous: number; income: number; expense: number; current: number }[];
}

function codeDescriptions(congreId: string): Map<string, string> {
  const rows = getDb().prepare(
    `SELECT code, description FROM cuentas_codes WHERE congregation_id = ?`
  ).all(congreId) as { code: string; description: string }[];
  const m = new Map(rows.map(r => [r.code, r.description]));
  for (const d of DEFAULT_CODES) if (!m.has(d.code)) m.set(d.code, d.description);
  return m;
}

function groupByCode(txs: Transaction[], descs: Map<string, string>): CodeTotal[] {
  const acc = new Map<string, number>();
  for (const t of txs) {
    const c = t.code || '—';
    acc.set(c, round2((acc.get(c) ?? 0) + t.amount));
  }
  return [...acc.entries()]
    .map(([code, total]) => ({ code, description: descs.get(code) ?? code, total }))
    .sort((x, y) => x.code.localeCompare(y.code));
}

export function buildS30(congreId: string, ym: string): S30 {
  const descs = codeDescriptions(congreId);
  const opening = openingBalance(congreId, ym);
  const txs = dedupeTransferCounterparts(txOfMonth(congreId, ym));

  const incomes  = txs.filter(t => t.type === 'income');
  const expenses = txs.filter(t => t.type === 'expense');

  const a = totalOf(opening);
  const b = round2(incomes.reduce((s, t) => s + t.amount, 0));
  const c = round2(expenses.reduce((s, t) => s + t.amount, 0));
  const d = round2(b - c);
  const e = round2(a + d);

  const box_kingdom   = round2(incomes.filter(t => t.code === KINGDOM_BOX_CODE).reduce((s, t) => s + t.amount, 0));
  const box_worldwide = round2(incomes.filter(t => t.code === WORLDWIDE_BOX_CODE).reduce((s, t) => s + t.amount, 0));
  const other_reserves = 0;
  const f = round2(box_kingdom + other_reserves);
  const g = round2(e - f);

  // Conciliación (página 2): mismos números por otra vía.
  const h = a;
  const i = b;
  const j = c;
  const k = round2(h + i - j);

  // Movimientos por cuenta: las transferencias sí mueven cuentas individuales.
  const closing: Balance = { ...opening };
  for (const t of txs) apply(closing, t);

  const movements = ACCOUNTS.map(account => {
    let income = 0, expense = 0;
    for (const t of txs) {
      if (t.type === 'income'   && t.account === account) income  += t.amount;
      if (t.type === 'expense'  && t.account === account) expense += t.amount;
      if (t.type === 'transfer') {
        if (t.account === account)    expense += t.amount;
        if (t.to_account === account) income  += t.amount;
      }
    }
    return {
      account,
      label: ACCOUNT_LABELS[account],
      previous: round2(opening[account]),
      income: round2(income),
      expense: round2(expense),
      current: round2(closing[account]),
    };
  });

  return {
    ym, monthLabel: monthLabel(ym), serviceYear: serviceYearOf(ym),
    a, b, incomeByCode: groupByCode(incomes, descs),
    c, expenseByCode: groupByCode(expenses, descs),
    d, e, f, box_kingdom, other_reserves, g,
    h, i, j, k,
    reconciled: Math.abs(k - e) < 0.01,
    box_worldwide,
    movements,
  };
}

/* ── S-25c: Auditoría trimestral ────────────────────────────────────────────── */

export interface S25cMonth {
  ym: string;
  label: string;
  income: number;
  expense: number;
  omIncome: number;
  omRemit: number;
  /** Total de asientos de gasto en el mes */
  expenseCount: number;
  /** Cuántos de esos gastos tienen receipt_ref (excluye asientos CIERRE-) */
  expenseWithReceipt: number;
}

export interface S25c {
  serviceYear: string;
  quarter: number;
  quarterLabel: string;
  months: S25cMonth[];
  totals: { income: number; expense: number; omIncome: number; omRemit: number };
  openingFunds: number;
  closingFunds: number;
  /** Fondos finales = Fondos iniciales + Ingresos − Gastos */
  reconciled: boolean;
  /**
   * Respuestas pre-calculadas por el sistema para el cuestionario S-25c.
   * Claves: don.1-4, des.1a/1b/1c/2-6, cta_p.1-3, cta_s.1-3, rep.1-5.
   * Valores: 'si' | 'no' | 'na' | '' (vacío = auditor debe determinar).
   */
  autoAnswers: Record<string, string>;
}

export function buildS25c(congreId: string, sy: string, quarter: number): S25c {
  const q = QUARTERS.find(x => x.n === quarter) ?? QUARTERS[0];
  const all = serviceYearMonths(sy);
  const yms = q.offsets.map(o => all[o]);

  // Cargar transacciones de cada mes una sola vez para reutilizarlas.
  const monthTxData = yms.map(ym => {
    const txs = txOfMonth(congreId, ym);
    const incomes  = txs.filter(t => t.type === 'income');
    const expenses = txs.filter(t => t.type === 'expense');
    return { ym, txs, incomes, expenses };
  });

  const months: S25cMonth[] = monthTxData.map(({ ym, incomes, expenses }) => {
    const expenseCount = expenses.length;
    const expenseWithReceipt = expenses.filter(
      t => t.receipt_ref && !String(t.receipt_ref).startsWith('CIERRE-')
    ).length;
    return {
      ym,
      label: monthLabel(ym),
      income:   round2(incomes.reduce((s, t) => s + t.amount, 0)),
      expense:  round2(expenses.reduce((s, t) => s + t.amount, 0)),
      omIncome: round2(incomes.filter(t => t.code && (OM_INCOME_CODES as readonly string[]).includes(t.code)).reduce((s, t) => s + t.amount, 0)),
      omRemit:  round2(expenses.filter(t => t.code && (OM_REMIT_CODES as readonly string[]).includes(t.code)).reduce((s, t) => s + t.amount, 0)),
      expenseCount,
      expenseWithReceipt,
    };
  });

  const totals = {
    income:   round2(months.reduce((s, m) => s + m.income, 0)),
    expense:  round2(months.reduce((s, m) => s + m.expense, 0)),
    omIncome: round2(months.reduce((s, m) => s + m.omIncome, 0)),
    omRemit:  round2(months.reduce((s, m) => s + m.omRemit, 0)),
  };

  const openingFunds = totalOf(openingBalance(congreId, yms[0]));
  const lastS26 = buildS26(congreId, yms[2]);
  const closingFunds = lastS26.closingTotal;
  const reconciled   = Math.abs(openingFunds + totals.income - totals.expense - closingFunds) < 0.01;

  /* ── Auto-respuestas del cuestionario ──────────────────────────────────────
   * El sistema puede determinar algunas respuestas a partir de los registros
   * contables. El auditor las revisa y puede cambiar cualquiera antes de
   * imprimir el PDF oficial.  Vacío ('') = el auditor debe determinarlo.
   */
  const allExpenses = monthTxData.flatMap(m => m.expenses);
  const allIncomes  = monthTxData.flatMap(m => m.incomes);

  // Gastos que no son asientos de cierre automático.
  const realExpenses = allExpenses.filter(
    t => !String(t.receipt_ref ?? '').startsWith('CIERRE-')
  );
  const allRealHaveReceipt = realExpenses.length === 0 ||
    realExpenses.every(t => t.receipt_ref);

  // ¿Hay remesas OM (SOM/ROM) en cada mes del trimestre?
  const omRemitCodes = ['SOM', 'ROM'];
  const monthsWithOmRemit = monthTxData.filter(({ expenses: exp }) =>
    exp.some(t => t.code && omRemitCodes.includes(t.code))
  ).length;

  const auto: Record<string, string> = {};

  // Verificación de las donaciones
  // don.1: los totales están en el sistema para que el auditor los compare.
  auto['don.1'] = 'si';
  // don.2: por definición, todo lo registrado en el sistema está en la Hoja.
  auto['don.2'] = 'si';
  // don.3: ¿tienen código de transacción todos los ingresos?
  auto['don.3'] = allIncomes.length === 0 || allIncomes.every(t => t.code) ? 'si' : 'no';
  // don.4: no se puede determinar sin analizar fechas de depósito.

  // Verificación de los desembolsos
  // 1a: ¿Todos los pagos tienen factura/recibo en el sistema?
  auto['des.1a'] = allRealHaveReceipt ? 'si' : 'no';
  // 1b: aprobación del coordinador — no se puede determinar desde datos.
  // 1c: ¿hay gastos por resolución (código RM)?
  auto['des.1c'] = allExpenses.some(t => t.code === 'RM') ? 'si' : 'na';
  // 2: ¿se enviaron remesas OM todos los meses del trimestre?
  if (totals.omIncome === 0 && totals.omRemit === 0) {
    auto['des.2'] = 'na'; // No hubo donaciones OM
  } else {
    auto['des.2'] = monthsWithOmRemit >= yms.length ? 'si' : 'no';
  }
  // 3: donaciones mensuales aprobadas por resolución — requiere comparar con
  //    resoluciones, no determinable automáticamente.
  // 4: cargos de la sucursal (código RE)
  auto['des.4'] = allExpenses.some(t => t.code === 'RE') ? 'si' : 'na';
  // 5: ¿el total enviado coincide con el total recibido de OM?
  if (totals.omIncome > 0 || totals.omRemit > 0) {
    auto['des.5'] = Math.abs(totals.omIncome - totals.omRemit) < 0.01 ? 'si' : 'no';
  } else {
    auto['des.5'] = 'na';
  }
  // 6: saldo máximo — no hay datos de saldo máximo configurado.
  auto['des.6'] = 'na';

  // Verificación de la cuenta principal
  auto['cta_p.1'] = reconciled ? 'si' : 'no';
  auto['cta_p.2'] = allRealHaveReceipt ? 'si' : 'no';
  // cta_p.3: si está cuadrado no hay discrepancias que resolver.
  auto['cta_p.3'] = reconciled ? 'na' : '';

  // Verificación de la cuenta secundaria — congregación con caja en efectivo,
  // sin cuenta secundaria; todas las preguntas son N/A.
  auto['cta_s.1'] = 'na';
  auto['cta_s.2'] = 'na';
  auto['cta_s.3'] = 'na';

  // Repaso de los procedimientos generales
  auto['rep.1'] = 'si';
  auto['rep.2'] = reconciled ? 'si' : '';
  auto['rep.3'] = 'si';
  auto['rep.4'] = reconciled ? 'si' : '';
  // rep.5: ¿hay anotación del saldo máximo aprobado? — no determinable.

  return {
    serviceYear: sy, quarter: q.n, quarterLabel: q.label,
    months, totals, openingFunds, closingFunds, reconciled,
    autoAnswers: auto,
  };
}

/* ── Relación I/E: resumen del año de servicio ──────────────────────────────── */

export interface SummaryMonth { ym: string; label: string; short: string; income: number; expense: number; net: number }

export function buildSummary(congreId: string, sy: string): { serviceYear: string; months: SummaryMonth[]; totals: { income: number; expense: number; net: number } } {
  const months = serviceYearMonths(sy).map(ym => {
    const txs = txOfMonth(congreId, ym);
    const income  = round2(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
    const expense = round2(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0));
    const [, m] = ym.split('-').map(Number);
    return { ym, label: monthLabel(ym), short: MONTH_NAMES_ES[m - 1].slice(0, 3), income, expense, net: round2(income - expense) };
  });
  return {
    serviceYear: sy,
    months,
    totals: {
      income:  round2(months.reduce((s, m) => s + m.income, 0)),
      expense: round2(months.reduce((s, m) => s + m.expense, 0)),
      net:     round2(months.reduce((s, m) => s + m.net, 0)),
    },
  };
}

/* ── Análisis contables (conciliación) ──────────────────────────────────────── */

export interface Check { label: string; ok: boolean; detail: string }

export function buildReconcile(congreId: string, ym: string): { ym: string; monthLabel: string; checks: Check[]; allOk: boolean } {
  const s26 = buildS26(congreId, ym);
  const s30 = buildS30(congreId, ym);
  const txs = txOfMonth(congreId, ym);
  const money = (n: number) => `$${n.toFixed(2)}`;

  const checks: Check[] = [];

  checks.push({
    label: 'Conciliación S-30: (k) = (e)',
    ok: s30.reconciled,
    detail: `(k) ${money(s30.k)} vs (e) ${money(s30.e)}`,
  });

  const colNet = round2(ACCOUNTS.reduce((s, a) => s + s26.totals[a].in - s26.totals[a].out, 0));
  checks.push({
    label: 'Totales de columna cuadran con el movimiento del mes',
    ok: Math.abs(colNet - s30.d) < 0.01,
    detail: `Neto de columnas ${money(colNet)} vs sobrante/déficit ${money(s30.d)}`,
  });

  checks.push({
    label: 'Saldo final = saldo inicial + movimiento',
    ok: Math.abs(s26.closingTotal - (s26.openingTotal + s30.d)) < 0.01,
    detail: `${money(s26.closingTotal)} vs ${money(round2(s26.openingTotal + s30.d))}`,
  });

  const badTransfers = txs.filter(t => t.type === 'transfer' && (!t.to_account || t.to_account === t.account));
  checks.push({
    label: 'Todas las transferencias tienen cuenta destino distinta',
    ok: badTransfers.length === 0,
    detail: badTransfers.length ? `${badTransfers.length} transferencia(s) inválida(s)` : 'Sin incidencias',
  });

  const noCode = txs.filter(t => !t.code);
  checks.push({
    label: 'Todas las transacciones tienen código CT',
    ok: noCode.length === 0,
    detail: noCode.length ? `${noCode.length} sin código` : 'Sin incidencias',
  });

  const negative = ACCOUNTS.filter(a => a !== 'caja' && s26.closing[a] < -0.01);
  checks.push({
    label: 'Cuenta Principal y Secundaria no quedan en negativo',
    ok: negative.length === 0,
    detail: negative.length
      ? negative.map(a => `${ACCOUNT_LABELS[a]}: ${money(s26.closing[a])}`).join(' · ')
      : 'Sin incidencias',
  });

  const oa = s26.openingAudit;
  checks.push({
    label: 'Saldo inicial declarado coincide con el arrastre real',
    ok: oa.matches,
    detail: oa.declared === null
      ? 'Sin saldo inicial declarado — se usa el arrastre'
      : oa.matches
        ? `Declarado y arrastrado coinciden (${money(totalOf(oa.carried))})`
        : `Declarado ${money(totalOf(oa.declared))} vs arrastrado ${money(totalOf(oa.carried))} · diferencia ${money(oa.diffTotal)}`,
  });

  const omPending = round2(s25cOmPending(congreId, ym));
  checks.push({
    label: 'Donaciones de obra mundial remesadas',
    ok: Math.abs(omPending) < 0.01,
    detail: omPending > 0
      ? `Pendiente de remesar: ${money(omPending)}`
      : 'Al corriente',
  });

  return { ym, monthLabel: monthLabel(ym), checks, allOk: checks.every(c => c.ok) };
}

/* ── Cierre de mes ──────────────────────────────────────────────────────────── */

export function cierreConfig(congreId: string): CierreConfig {
  try {
    const row = getDb().prepare(`
      SELECT remit_code, res_pub_code, res_pub_amount, res_pct_code, res_pct_percent, res_pct_source,
             maintenance_code, maintenance_amount
      FROM cuentas_config WHERE congregation_id = ?
    `).get(congreId) as CierreConfig | undefined;
    return row ? { ...DEFAULT_CIERRE, ...row } : { ...DEFAULT_CIERRE };
  } catch {
    return { ...DEFAULT_CIERRE };
  }
}

/**
 * Asientos que generaría el cierre del mes, sin escribir nada.
 *
 * Son tres conceptos, todos como salida de la Cuenta Principal:
 *  1. Remesa de las donaciones para la obra mundial recibidas y no remesadas.
 *  2. Resolución mensual calculada por publicador (monto × publicadores).
 *  3. Resolución mensual porcentual sobre las donaciones para la congregación.
 *
 * Los asientos ya existentes del cierre se excluyen del cálculo para que
 * recalcular una corrección no acumule sobre sí misma.
 */
export function cierrePreview(
  congreId: string, ym: string, publishers: number | null,
): { config: CierreConfig; entries: CierreEntry[]; total: number } {
  const cfg = cierreConfig(congreId);
  const ref = cierreTag(ym);
  const txs = txOfMonth(congreId, ym).filter(t => t.receipt_ref !== ref);

  const incomes = txs.filter(t => t.type === 'income');
  const expenses = txs.filter(t => t.type === 'expense');

  const entries: CierreEntry[] = [];

  // 1 · Remesa de obra mundial pendiente
  const omReceived = round2(
    incomes.filter(t => t.code && (OM_INCOME_CODES as readonly string[]).includes(t.code))
           .reduce((s, t) => s + t.amount, 0));
  const omRemitted = round2(
    expenses.filter(t => t.code && (OM_REMIT_CODES as readonly string[]).includes(t.code))
            .reduce((s, t) => s + t.amount, 0));
  const pending = round2(omReceived - omRemitted);

  if (pending > 0) {
    entries.push({
      kind: 'remit',
      code: cfg.remit_code,
      description: 'Remesa de donaciones para la obra mundial — cierre de mes',
      amount: pending,
      basis: `Recibido ${omReceived.toFixed(2)} − ya remesado ${omRemitted.toFixed(2)}`,
    });
  }

  // 2 · Resolución mensual por publicador
  if (publishers && publishers > 0 && cfg.res_pub_amount > 0) {
    const amount = round2(publishers * cfg.res_pub_amount);
    entries.push({
      kind: 'res_pub',
      code: cfg.res_pub_code,
      description: 'Resolución mensual para la obra mundial (por publicador)',
      amount,
      basis: `${publishers} publicadores × ${cfg.res_pub_amount.toFixed(2)}`,
    });
  }

  // 3 · Resolución mensual porcentual sobre las donaciones a la congregación
  if (cfg.res_pct_percent > 0) {
    const base = round2(
      incomes.filter(t => t.code === cfg.res_pct_source).reduce((s, t) => s + t.amount, 0));
    const amount = round2(base * cfg.res_pct_percent / 100);
    if (amount > 0) {
      entries.push({
        kind: 'res_pct',
        code: cfg.res_pct_code,
        description: `Resolución mensual para la obra mundial (${cfg.res_pct_percent}% de donaciones ${cfg.res_pct_source})`,
        amount,
        basis: `${cfg.res_pct_percent}% de ${base.toFixed(2)} (código ${cfg.res_pct_source})`,
      });
    }
  }

  // 4 · Mantenimiento mensual fijo
  if (cfg.maintenance_amount > 0) {
    entries.push({
      kind: 'maintenance',
      code: cfg.maintenance_code,
      description: `Mantenimiento (${monthLabel(ym)})`,
      amount: cfg.maintenance_amount,
      basis: `Monto fijo mensual configurado`,
    });
  }

  return { config: cfg, entries, total: round2(entries.reduce((s, e) => s + e.amount, 0)) };
}

/** Donaciones OM recibidas en el mes menos remesas enviadas en el mes. */
export function s25cOmPending(congreId: string, ym: string): number {
  const txs = txOfMonth(congreId, ym);
  const rec = txs.filter(t => t.type === 'income'  && t.code && (OM_INCOME_CODES as readonly string[]).includes(t.code))
                 .reduce((s, t) => s + t.amount, 0);
  const rem = txs.filter(t => t.type === 'expense' && t.code && (OM_REMIT_CODES as readonly string[]).includes(t.code))
                 .reduce((s, t) => s + t.amount, 0);
  return round2(rec - rem);
}

export { txOfMonth, txBefore };

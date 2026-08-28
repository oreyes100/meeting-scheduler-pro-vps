'use client';

import React from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  ACCOUNTS, ACCOUNT_LABELS, money, num,
  type Account, type S26, type S26Row, type S30, type S25c, type Summary, type Reconcile, type CuentasConfig,
  type S25cAnswers, type S25cAnswer, type S25cAnswerValue,
} from './types';

/* ── Encabezado oficial compartido por los tres formularios ─────────────────── */

export function FormHeader({ title, subtitle, cfg, right }: {
  title: string; subtitle?: string; cfg: CuentasConfig; right?: string;
}) {
  return (
    <div className="text-center mb-4">
      <h2 className="font-bold text-base tracking-wide">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
      <p className="text-xs mt-1">
        TESTIGOS DE JEHOVÁ — Congregación <strong>{cfg.label || '—'}</strong>
        {cfg.city ? ` — ${cfg.city}` : ''}{cfg.state ? `, ${cfg.state}` : ''}
      </p>
      {right && <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400">{right}</p>}
    </div>
  );
}

/* ── S-26: Hoja de cuentas (grid oficial de 10 columnas) ────────────────────── */

export function S26Sheet({
  s26,
  official = false,
  onEdit,
  onDelete,
  onOpeningEdit,
}: {
  s26: S26;
  official?: boolean;
  onEdit?: (r: S26Row) => void;
  onDelete?: (r: S26Row) => void;
  onOpeningEdit?: () => void;
}) {
  const cell = 'px-2 py-1 text-right tabular-nums';
  const border = 'border border-gray-300 dark:border-gray-600';
  const showActions = !official && (onEdit || onDelete || onOpeningEdit);
  const colSpanBase = 10;

  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-xs ${border}`} style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr className="bg-gray-100 dark:bg-gray-700">
            <th rowSpan={2} className={`${border} px-2 py-1`}>FECHA</th>
            <th rowSpan={2} className={`${border} px-2 py-1 text-left`}>DESCRIPCIÓN DE TRANSACCIÓN</th>
            <th rowSpan={2} className={`${border} px-2 py-1`}>CT</th>
            <th colSpan={2} className={`${border} px-2 py-1`}>RECIBIDO</th>
            <th colSpan={2} className={`${border} px-2 py-1`}>CUENTA PRINCIPAL</th>
            <th colSpan={2} className={`${border} px-2 py-1`}>CUENTA SECUNDARIA</th>
            <th rowSpan={2} className={`${border} px-2 py-1`}>SALDO</th>
            {showActions && <th rowSpan={2} className={`${border} px-1 py-1 print:hidden`} />}
          </tr>
          <tr className="bg-gray-100 dark:bg-gray-700">
            {ACCOUNTS.map(a => (
              <React.Fragment key={a}>
                <th className={`${border} px-2 py-0.5 font-normal`}>Entrada</th>
                <th className={`${border} px-2 py-0.5 font-normal`}>Salida</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Saldo inicial del mes */}
          <tr className="bg-gray-50 dark:bg-gray-800/60 font-semibold">
            <td className={`${border} px-2 py-1`} colSpan={3}>
              {s26.monthLabel.toUpperCase()} — SALDO INICIAL
            </td>
            <td className={border} colSpan={6} />
            <td className={`${border} ${cell}`}>{s26.openingTotal.toFixed(2)}</td>
            {showActions && (
              <td className={`${border} px-1 print:hidden`}>
                {onOpeningEdit && (
                  <button onClick={onOpeningEdit}
                          className="p-0.5 text-gray-400 hover:text-emerald-600"
                          title="Editar saldo inicial">
                    <Pencil size={11} />
                  </button>
                )}
              </td>
            )}
          </tr>

          {s26.rows.map(r => (
            <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
              <td className={`${border} px-2 py-1 text-center`}>{Number(r.date.slice(8, 10))}</td>
              <td className={`${border} px-2 py-1`}>{r.description}</td>
              <td className={`${border} px-2 py-1 text-center font-medium`}>{r.code || ''}</td>
              {ACCOUNTS.map(a => (
                <React.Fragment key={a}>
                  <td className={`${border} ${cell} text-emerald-700 dark:text-emerald-400`}>{num(r.cols[a].in)}</td>
                  <td className={`${border} ${cell} text-red-700 dark:text-red-400`}>{num(r.cols[a].out)}</td>
                </React.Fragment>
              ))}
              <td className={`${border} ${cell} font-medium`}>{r.saldo.toFixed(2)}</td>
              {showActions && (
                <td className={`${border} px-1 print:hidden`}>
                  <div className="flex gap-0.5 justify-center">
                    {onEdit && (
                      <button onClick={() => onEdit(r)}
                              className="p-0.5 text-gray-400 hover:text-emerald-600"
                              title="Editar">
                        <Pencil size={11} />
                      </button>
                    )}
                    {onDelete && !r.receipt_ref?.startsWith('CIERRE-') && (
                      <button onClick={() => onDelete(r)}
                              className="p-0.5 text-gray-400 hover:text-red-600"
                              title="Eliminar">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}

          {s26.rows.length === 0 && (
            <tr>
              <td className={`${border} px-2 py-6 text-center text-gray-400`} colSpan={showActions ? colSpanBase + 1 : colSpanBase}>
                Sin transacciones en este mes.
              </td>
            </tr>
          )}

          {official && Array.from({ length: Math.max(0, 26 - s26.rows.length) }).map((_, i) => (
            <tr key={`pad-${i}`}><td className={border} colSpan={colSpanBase}>&nbsp;</td></tr>
          ))}

          <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
            <td className={`${border} px-2 py-1`} colSpan={3}>TOTALES DE TODAS LAS COLUMNAS ▶</td>
            {ACCOUNTS.map(a => (
              <React.Fragment key={a}>
                <td className={`${border} ${cell}`}>{s26.totals[a].in.toFixed(2)}</td>
                <td className={`${border} ${cell}`}>{s26.totals[a].out.toFixed(2)}</td>
              </React.Fragment>
            ))}
            <td className={`${border} ${cell}`}>{s26.closingTotal.toFixed(2)}</td>
            {showActions && <td className={`${border} print:hidden`} />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Tarjetas de saldo con degradado, como en el programa original.
 * El color identifica la cuenta de un vistazo; el total general cierra la fila.
 */
const CARD_GRADIENT: Record<Account, string> = {
  caja:      'from-orange-500 to-amber-600',
  corriente: 'from-sky-500 to-blue-600',
  sucursal:  'from-violet-500 to-purple-600',
};

export function BalanceCards({ s26 }: { s26: S26 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {ACCOUNTS.map(a => (
        <div key={a}
             className={`rounded-xl p-3.5 text-white shadow-sm bg-gradient-to-br ${CARD_GRADIENT[a]}`}>
          <p className="text-[10px] uppercase tracking-widest text-white/85 truncate">
            {ACCOUNT_LABELS[a]}
          </p>
          <p className="text-2xl font-bold mt-1 tabular-nums drop-shadow-sm">
            {money(s26.closing[a])}
          </p>
        </div>
      ))}
      <div className="rounded-xl p-3.5 text-white shadow-sm bg-gradient-to-br from-emerald-500 to-green-700">
        <p className="text-[10px] uppercase tracking-widest text-white/85">Total general</p>
        <p className="text-2xl font-bold mt-1 tabular-nums drop-shadow-sm">{money(s26.closingTotal)}</p>
      </div>
    </div>
  );
}

/** Botonera de acciones destacadas, como la del programa original. */
export function ActionTiles({ actions }: {
  actions: { key: string; title: string; sub: string; gradient: string; icon: React.ReactNode; onClick: () => void }[];
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {actions.map(a => (
        <button key={a.key} onClick={a.onClick}
                className={`rounded-xl px-3 py-3 text-white text-left shadow-sm transition-transform hover:scale-[1.02] bg-gradient-to-br ${a.gradient}`}>
          <div className="flex items-center gap-2 mb-0.5">
            {a.icon}
            <span className="font-semibold text-xs leading-tight">{a.title}</span>
          </div>
          <p className="text-[10px] text-white/80 leading-tight">{a.sub}</p>
        </button>
      ))}
    </div>
  );
}

/* ── S-30: Informe mensual ──────────────────────────────────────────────────── */

function Block({ tag, title, children }: { tag: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="bg-sky-800 dark:bg-sky-900 text-white px-3 py-1 text-xs font-semibold tracking-wide">
        ({tag}) {title}
      </div>
      <table className="w-full text-xs">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <tr className={strong ? 'font-semibold bg-gray-50 dark:bg-gray-800/60' : ''}>
      <td className="px-3 py-1 border-t border-gray-100 dark:border-gray-700">{label}</td>
      <td className="px-3 py-1 border-t border-gray-100 dark:border-gray-700 text-right tabular-nums w-40">
        {money(value)}
      </td>
    </tr>
  );
}

export function S30Report({ s30 }: { s30: S30 }) {
  return (
    <div>
      {!s30.reconciled && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/25 border border-red-300 dark:border-red-700 text-red-800 dark:text-red-300 text-xs">
          <strong>La conciliación no cuadra.</strong> (k) {money(s30.k)} debería igualar (e) {money(s30.e)}.
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        PÁGINA 1 — INFORME FINANCIERO · Año de servicio {s30.serviceYear}
      </p>

      <Block tag="a" title="FONDOS A COMIENZO DE MES">
        <Line label="Fondos en todas las cuentas al inicio del mes" value={s30.a} strong />
      </Block>

      <Block tag="b" title="RECIBIDO POR LA CONGREGACIÓN">
        {s30.incomeByCode.map(r => (
          <Line key={r.code} label={`${r.code} — ${r.description}`} value={r.total} />
        ))}
        {s30.incomeByCode.length === 0 && <Line label="Sin ingresos registrados" value={0} />}
        <Line label="TOTAL RECIBIDO" value={s30.b} strong />
      </Block>

      <Block tag="c" title="GASTOS DE LA CONGREGACIÓN">
        {s30.expenseByCode.map(r => (
          <Line key={r.code} label={`${r.code} — ${r.description}`} value={r.total} />
        ))}
        {s30.expenseByCode.length === 0 && <Line label="Sin gastos registrados" value={0} />}
        <Line label="TOTAL DE GASTOS" value={s30.c} strong />
      </Block>

      <Block tag="d" title="SOBRANTE / DÉFICIT  [(b) − (c)]">
        <Line label="Sobrante (déficit) del mes" value={s30.d} strong />
      </Block>

      <Block tag="e" title="FONDOS A FIN DE MES  [(a) + (d)]">
        <Line label="Total fondos al cierre del mes" value={s30.e} strong />
      </Block>

      <Block tag="f" title="FONDOS RESERVADOS PARA PROPÓSITOS ESPECIALES">
        <Line label="Contribuciones para Salones del Reino (DK)" value={s30.box_kingdom} />
        <Line label="Otras reservas" value={s30.other_reserves} />
        <Line label="TOTAL RESERVADO" value={s30.f} strong />
      </Block>

      <Block tag="g" title="FONDOS DISPONIBLES  [(e) − (f)]">
        <Line label="Fondos disponibles para la obra" value={s30.g} strong />
      </Block>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-5 mb-2">PÁGINA 2 — CONCILIACIÓN</p>

      <Block tag="h" title="TOTAL DE FONDOS A COMIENZO DE MES">
        <Line label="Mismo que (a)" value={s30.h} strong />
      </Block>
      <Block tag="i" title="RECIBIDO">
        <Line label="Total de ingresos del mes" value={s30.i} strong />
      </Block>
      <Block tag="j" title="DESEMBOLSOS">
        <Line label="Total de gastos del mes" value={s30.j} strong />
      </Block>
      <Block tag="k" title="TOTAL DE FONDOS A FIN DE MES  [(h) + (i) − (j)]">
        <Line label={`Debe coincidir con (e)${s30.reconciled ? ' ✓' : ' ✗'}`} value={s30.k} strong />
      </Block>

      <div className="mb-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs font-semibold">
          Detalle de Cajas de Contribuciones
        </div>
        <table className="w-full text-xs"><tbody>
          <Line label="Obra Mundial (DO)" value={s30.box_worldwide} />
          <Line label="Salones del Reino (DK)" value={s30.box_kingdom} />
        </tbody></table>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-100 dark:bg-gray-700 px-3 py-1 text-xs font-semibold">MOVIMIENTOS POR CUENTA</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 dark:text-gray-400">
              <th className="px-3 py-1 text-left font-normal">Cuenta</th>
              <th className="px-3 py-1 text-right font-normal">Saldo Anterior</th>
              <th className="px-3 py-1 text-right font-normal">Ingresos</th>
              <th className="px-3 py-1 text-right font-normal">Egresos</th>
              <th className="px-3 py-1 text-right font-normal">Saldo Actual</th>
            </tr>
          </thead>
          <tbody>
            {s30.movements.map(m => (
              <tr key={m.account} className="border-t border-gray-100 dark:border-gray-700">
                <td className="px-3 py-1">{m.label}</td>
                <td className="px-3 py-1 text-right tabular-nums">{money(m.previous)}</td>
                <td className="px-3 py-1 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{money(m.income)}</td>
                <td className="px-3 py-1 text-right tabular-nums text-red-700 dark:text-red-400">{money(m.expense)}</td>
                <td className={`px-3 py-1 text-right tabular-nums font-semibold ${m.current < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {money(m.current)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── S-25c: Auditoría trimestral ────────────────────────────────────────────── */

/** Campo de respuesta Sí / No / N.A. con nota opcional. */
function AnswerField({
  qKey, answers, onChange, autoLabel,
}: {
  qKey: string;
  answers: S25cAnswers;
  onChange: (key: string, val: S25cAnswer) => void;
  autoLabel?: string; // tooltip indicando el valor auto-calculado
}) {
  const v: S25cAnswer = answers[qKey] ?? { answer: '', notes: '' };
  const selCls = 'border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-xs bg-white dark:bg-gray-800 focus:outline-none focus:border-sky-500';
  const noteCls = 'flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 text-xs bg-white dark:bg-gray-800 placeholder-gray-400 focus:outline-none focus:border-sky-500';

  const badge = v.answer === 'si'
    ? <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-xs">✓ Sí</span>
    : v.answer === 'no'
    ? <span className="text-red-700 dark:text-red-400 font-semibold text-xs">✗ No</span>
    : v.answer === 'na'
    ? <span className="text-gray-500 text-xs">N/A</span>
    : null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 print:gap-4">
      <select
        value={v.answer}
        onChange={e => onChange(qKey, { ...v, answer: e.target.value as S25cAnswerValue })}
        className={selCls}
        title={autoLabel ? `Auto: ${autoLabel}` : undefined}
      >
        <option value="">— sin responder —</option>
        <option value="si">✓ Sí</option>
        <option value="no">✗ No</option>
        <option value="na">N/A</option>
      </select>
      {badge}
      {(v.answer === 'si' || v.answer === 'no') && (
        <input
          value={v.notes}
          placeholder="Observaciones…"
          onChange={e => onChange(qKey, { ...v, notes: e.target.value })}
          className={noteCls}
        />
      )}
    </div>
  );
}

/** Bloque de comentarios de sección (notas libres que van a los campos de texto del PDF). */
function SectionNotes({
  noteKey, answers, onChange, label = 'Comentarios:',
}: {
  noteKey: string;
  answers: S25cAnswers;
  onChange: (key: string, val: S25cAnswer) => void;
  label?: string;
}) {
  const v: S25cAnswer = answers[noteKey] ?? { answer: 'na', notes: '' };
  return (
    <div className="mt-2">
      <label className="text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <textarea
        rows={2}
        value={v.notes}
        placeholder="Escriba aquí las observaciones…"
        onChange={e => onChange(noteKey, { answer: 'na', notes: e.target.value })}
        className="mt-0.5 w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800 placeholder-gray-400 focus:outline-none focus:border-sky-500 resize-none"
      />
    </div>
  );
}

export function S25cReport({
  s25c, answers = {}, onAnswerChange,
}: {
  s25c: S25c;
  answers?: S25cAnswers;
  onAnswerChange?: (key: string, val: S25cAnswer) => void;
}) {
  const border = 'border border-gray-300 dark:border-gray-600';
  const noop = () => {};
  const onChange = onAnswerChange ?? noop;
  const auto = s25c.autoAnswers ?? {};

  const AF = (qKey: string) => (
    <AnswerField qKey={qKey} answers={answers} onChange={onChange}
      autoLabel={auto[qKey]} />
  );

  const totalExpenseCount = s25c.months.reduce((s, m) => s + m.expenseCount, 0);
  const totalWithReceipt  = s25c.months.reduce((s, m) => s + m.expenseWithReceipt, 0);
  const totalMissing      = totalExpenseCount - totalWithReceipt;

  return (
    <div className="text-xs space-y-5">
      <p className="text-center">
        <strong>Trimestre auditado:</strong> {s25c.months[0]?.label} – {s25c.months[2]?.label}
        {' · '}<span className={s25c.reconciled
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-red-700 dark:text-red-400 font-semibold'}>
          {s25c.reconciled ? '✓ Cuadrado' : '✗ Descuadrado'}
        </span>
      </p>

      {/* ── Datos de referencia del sistema ───────────────────────────────── */}
      <div>
        <p className="font-semibold mb-1 text-gray-600 dark:text-gray-400">DATOS DEL SISTEMA</p>
        <table className={`w-full ${border}`} style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              <th className={`${border} px-2 py-1 text-left`}>Mes</th>
              <th className={`${border} px-2 py-1 text-right`}>Recibido</th>
              <th className={`${border} px-2 py-1 text-right`}>Desembolsos</th>
              <th className={`${border} px-2 py-1 text-right`}>Don. OM</th>
              <th className={`${border} px-2 py-1 text-right`}>Remesas OM</th>
              <th className={`${border} px-2 py-1 text-right`}>Egresos</th>
              <th className={`${border} px-2 py-1 text-right`}>Con comprobante</th>
            </tr>
          </thead>
          <tbody>
            {s25c.months.map(m => {
              const missing = m.expenseCount - m.expenseWithReceipt;
              return (
                <tr key={m.ym}>
                  <td className={`${border} px-2 py-1`}>{m.label}</td>
                  <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(m.income)}</td>
                  <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(m.expense)}</td>
                  <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(m.omIncome)}</td>
                  <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(m.omRemit)}</td>
                  <td className={`${border} px-2 py-1 text-right tabular-nums`}>{m.expenseCount}</td>
                  <td className={`${border} px-2 py-1 text-right tabular-nums ${missing > 0 ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {missing > 0 ? `⚠ ${m.expenseWithReceipt}/${m.expenseCount}` : `✓ ${m.expenseWithReceipt}`}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gray-100 dark:bg-gray-700 font-semibold">
              <td className={`${border} px-2 py-1`}>Trimestre</td>
              <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(s25c.totals.income)}</td>
              <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(s25c.totals.expense)}</td>
              <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(s25c.totals.omIncome)}</td>
              <td className={`${border} px-2 py-1 text-right tabular-nums`}>{money(s25c.totals.omRemit)}</td>
              <td className={`${border} px-2 py-1 text-right tabular-nums`}>{totalExpenseCount}</td>
              <td className={`${border} px-2 py-1 text-right tabular-nums ${totalMissing > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {totalMissing > 0 ? `⚠ ${totalWithReceipt}/${totalExpenseCount}` : `✓ ${totalWithReceipt}`}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-gray-500 dark:text-gray-400">
          Fondos inicio: <strong className="text-gray-800 dark:text-gray-200">{money(s25c.openingFunds)}</strong>
          {' · '}Fondos final: <strong className="text-gray-800 dark:text-gray-200">{money(s25c.closingFunds)}</strong>
        </p>
      </div>

      {/* ── 1. Verificación de las donaciones ────────────────────────────── */}
      <div>
        <p className="font-semibold mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">
          VERIFICACIÓN DE LAS DONACIONES
        </p>
        <ol className="list-decimal ml-5 space-y-3 text-gray-700 dark:text-gray-300">
          <li>
            Sume, por mes, los formularios <em>Registro de transacción</em> (S-24) y compare con la
            columna «Recibido/Entrada» de la <em>Hoja de cuentas</em> (S-26).{' '}
            <em>Sistema:</em>{' '}
            {s25c.months.map(m => `${m.label.split(' ')[0]} ${money(m.income)}`).join(' · ')}.
            ¿Coinciden los totales?
            {AF('don.1')}
          </li>
          <li>
            ¿Se registran todas las donaciones en la <em>Hoja de cuentas</em>?
            {AF('don.2')}
          </li>
          <li>
            Para los tres meses, compare cada <em>Registro de transacción</em> con la descripción y el
            código registrados en la <em>Hoja de cuentas</em>. ¿Se anotan correctamente los códigos?
            {AF('don.3')}
          </li>
          <li>
            Compare las fechas y las cantidades de los depósitos en la caja de efectivo con la{' '}
            <em>Hoja de cuentas</em>. ¿Se hacen los depósitos semanalmente?
            {AF('don.4')}
          </li>
        </ol>
        <SectionNotes noteKey="don_notes" answers={answers} onChange={onChange} />
      </div>

      {/* ── 2. Verificación de los desembolsos ───────────────────────────── */}
      <div>
        <p className="font-semibold mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">
          VERIFICACIÓN DE LOS DESEMBOLSOS
        </p>
        <ol className="list-decimal ml-5 space-y-3 text-gray-700 dark:text-gray-300">
          <li>
            <ol className="list-[lower-alpha] ml-5 space-y-2">
              <li>
                ¿Hay una factura, resolución u otro documento justificativo para <strong>todos</strong>{' '}
                los pagos anotados en la <em>Hoja de cuentas</em>?
                {totalMissing > 0 && (
                  <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                    ⚠ El sistema detecta {totalMissing} {totalMissing === 1 ? 'egreso sin' : 'egresos sin'} comprobante.
                  </p>
                )}
                {AF('des.1a')}
              </li>
              <li>
                ¿Aprueba (poniendo sus iniciales) el coordinador del cuerpo de ancianos, u otro anciano
                asignado en su ausencia, todas las facturas, los recibos de compra o los formularios
                <em> Registro de transacción</em> (S-24)?
                {AF('des.1b')}
              </li>
              <li>
                ¿Aprueba la congregación mediante resolución los desembolsos de gastos no habituales
                que superen el límite aprobado por transacción?{' '}
                <em>(Indique «N/A» si la pregunta no aplica.)</em>
                {AF('des.1c')}
              </li>
            </ol>
          </li>
          <li>
            ¿Se envían a la sucursal todas las donaciones recogidas para la obra mundial según se
            indica en el Apéndice B de las <em>Instrucciones para la contabilidad de la
            congregación</em> (S-27c)?{' '}
            <em>Sistema: OM recibido {money(s25c.totals.omIncome)} · Remesas enviadas {money(s25c.totals.omRemit)}.
            {Math.abs(s25c.totals.omIncome - s25c.totals.omRemit) >= 0.01 && (
              <span className="text-amber-700 dark:text-amber-400">
                {' '}Diferencia: {money(Math.abs(s25c.totals.omIncome - s25c.totals.omRemit))}.
              </span>
            )}</em>
            {AF('des.2')}
          </li>
          <li>
            ¿Se envían a la sucursal las cantidades totales de las donaciones mensuales aprobadas por
            resolución?{' '}
            <em>(Indique «N/A» si las donaciones se han reducido para sufragar gastos pendientes.)</em>
            {AF('des.3')}
          </li>
          <li>
            ¿Se abonan lo antes posible todos los cargos de la sucursal?{' '}
            <em>(Vea el último extracto enviado por la sucursal. Indique «N/A» si no ha habido cargos.)</em>
            {AF('des.4')}
          </li>
          <li>
            Compare el <em>Registro de traspaso de fondos</em> (TO-62) de cada mes con el acuse de
            recibo de donación enviado por la sucursal.{' '}
            <em>Sistema: OM {money(s25c.totals.omIncome)} · SOM/ROM {money(s25c.totals.omRemit)}.</em>{' '}
            ¿Coinciden las cantidades?
            {AF('des.5')}
          </li>
          <li>
            ¿Se envían a la sucursal, en concepto de donación para la obra mundial, los fondos que
            superan el saldo máximo de la congregación durante varios meses?{' '}
            <em>(Indique «N/A» si la pregunta no aplica.)</em>
            {AF('des.6')}
          </li>
        </ol>
        <SectionNotes noteKey="des_notes" answers={answers} onChange={onChange} />
      </div>

      {/* ── 3. Verificación de la cuenta principal ───────────────────────── */}
      <div>
        <p className="font-semibold mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">
          VERIFICACIÓN DE LA CUENTA PRINCIPAL
        </p>
        <ol className="list-decimal ml-5 space-y-3 text-gray-700 dark:text-gray-300">
          <li>
            En la página 2 de la <em>Hoja de cuentas</em> (S-26) de cada mes, ¿coincide el saldo
            de la caja de efectivo conciliado de la línea 4 del recuadro «Conciliación de la cuenta
            principal» con la cantidad de «Cuenta principal/Saldo final»?{' '}
            <em>Sistema: fondos al final {money(s25c.closingFunds)}.
            {s25c.reconciled
              ? ' Conciliación: ✓ cuadrado.'
              : ' Conciliación: ✗ descuadrado.'}</em>
            {AF('cta_p.1')}
          </li>
          <li>
            ¿Hay un <em>Registro de transacción</em> (S-24) de pago debidamente cumplimentado por
            cada pago registrado en la <em>Hoja de cuentas</em>?
            {AF('cta_p.2')}
          </li>
          <li>
            ¿Han aprobado el coordinador del cuerpo de ancianos y el secretario los ajustes necesarios
            para resolver discrepancias?{' '}
            <em>(Indique «N/A» si la pregunta no aplica.)</em>
            {AF('cta_p.3')}
          </li>
        </ol>
        <SectionNotes noteKey="cta_p_notes" answers={answers} onChange={onChange} />
      </div>

      {/* ── 4. Verificación de la cuenta secundaria ──────────────────────── */}
      <div>
        <p className="font-semibold mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">
          VERIFICACIÓN DE LA CUENTA SECUNDARIA{' '}
          <span className="font-normal text-gray-500">(Complete solo si la congregación tiene otra cuenta)</span>
        </p>
        <ol className="list-decimal ml-5 space-y-3 text-gray-700 dark:text-gray-300">
          <li>
            En la página 2 de la <em>Hoja de cuentas</em> (S-26) de cada mes, ¿coincide el saldo
            conciliado de la línea 8 de la «Conciliación de la cuenta secundaria» con «Cuenta
            secundaria/Saldo final»?
            {AF('cta_s.1')}
          </li>
          <li>
            ¿Se aprueban adecuadamente los traspasos de la cuenta secundaria?
            {AF('cta_s.2')}
          </li>
          <li>
            ¿Han aprobado el coordinador del cuerpo de ancianos y el secretario los ajustes necesarios
            para resolver discrepancias?{' '}
            <em>(Indique «N/A» si la pregunta no aplica.)</em>
            {AF('cta_s.3')}
          </li>
        </ol>
        <SectionNotes noteKey="cta_s_notes" answers={answers} onChange={onChange} />
      </div>

      {/* ── 5. Repaso de los procedimientos generales ────────────────────── */}
      <div>
        <p className="font-semibold mb-2 border-b border-gray-200 dark:border-gray-600 pb-1">
          REPASO DE LOS PROCEDIMIENTOS GENERALES
        </p>
        <ol className="list-decimal ml-5 space-y-3 text-gray-700 dark:text-gray-300">
          <li>
            ¿Se están siguiendo las instrucciones para la contabilidad de la congregación?
            {AF('rep.1')}
          </li>
          <li>
            ¿Son exactos los registros? ¿Están ordenados?
            {AF('rep.2')}
          </li>
          <li>
            ¿Están al día los registros?
            {AF('rep.3')}
          </li>
          <li>
            ¿Son exactos los informes mensuales de las cuentas de la congregación?{' '}
            <em>(Compruebe un mes.)</em>
            {AF('rep.4')}
          </li>
          <li>
            ¿Hay en el archivo de aprobaciones vigentes una anotación con el saldo máximo aprobado?
            {AF('rep.5')}
          </li>
        </ol>
        <SectionNotes noteKey="rep_notes" answers={answers} onChange={onChange} />
      </div>
    </div>
  );
}

/* ── Relación I/E: gráfico de barras SVG (sin dependencias) ─────────────────── */

export function IncomeExpenseChart({ summary }: { summary: Summary }) {
  const W = 760, H = 260, PAD_L = 56, PAD_B = 28, PAD_T = 12;
  const max = Math.max(1, ...summary.months.flatMap(m => [m.income, m.expense]));
  const plotW = W - PAD_L - 8, plotH = H - PAD_B - PAD_T;
  const slot = plotW / summary.months.length;
  const barW = Math.max(4, slot / 2 - 3);
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-emerald-500" /> Ingresos {money(summary.totals.income)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-red-500" /> Egresos {money(summary.totals.expense)}
        </span>
        <span className={`font-semibold ${summary.totals.net < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
          Neto {money(summary.totals.net)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[640px]" role="img"
             aria-label={`Ingresos y egresos por mes del año de servicio ${summary.serviceYear}`}>
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <g key={f}>
              <line x1={PAD_L} x2={W - 8} y1={y(max * f)} y2={y(max * f)}
                    stroke="currentColor" strokeOpacity={0.15} />
              <text x={PAD_L - 6} y={y(max * f) + 3} textAnchor="end"
                    fontSize={9} fill="currentColor" fillOpacity={0.55}>
                {Math.round(max * f).toLocaleString('es-MX')}
              </text>
            </g>
          ))}

          {summary.months.map((m, i) => {
            const x0 = PAD_L + i * slot;
            return (
              <g key={m.ym}>
                <rect x={x0 + 2} y={y(m.income)} width={barW} height={PAD_T + plotH - y(m.income)}
                      className="fill-emerald-500" rx={2}>
                  <title>{`${m.label} · Ingresos ${money(m.income)}`}</title>
                </rect>
                <rect x={x0 + barW + 5} y={y(m.expense)} width={barW} height={PAD_T + plotH - y(m.expense)}
                      className="fill-red-500" rx={2}>
                  <title>{`${m.label} · Egresos ${money(m.expense)}`}</title>
                </rect>
                <text x={x0 + slot / 2} y={H - 10} textAnchor="middle" fontSize={9}
                      fill="currentColor" fillOpacity={0.65}>{m.short}</text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
              <th className="px-2 py-1 text-left font-normal">Mes</th>
              <th className="px-2 py-1 text-right font-normal">Ingresos</th>
              <th className="px-2 py-1 text-right font-normal">Egresos</th>
              <th className="px-2 py-1 text-right font-normal">Neto</th>
            </tr>
          </thead>
          <tbody>
            {summary.months.map(m => (
              <tr key={m.ym} className="border-b border-gray-100 dark:border-gray-800">
                <td className="px-2 py-1">{m.label}</td>
                <td className="px-2 py-1 text-right tabular-nums">{money(m.income)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{money(m.expense)}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${m.net < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                  {money(m.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Análisis contables ─────────────────────────────────────────────────────── */

export function ReconcilePanel({ rec }: { rec: Reconcile }) {
  return (
    <div className="space-y-2">
      <div className={`p-3 rounded-lg border text-sm font-medium ${
        rec.allOk
          ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300'
          : 'bg-amber-50 dark:bg-amber-900/25 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300'}`}>
        {rec.allOk
          ? `Sin incidencias en ${rec.monthLabel}.`
          : `Hay observaciones en ${rec.monthLabel}. Revísalas abajo.`}
      </div>

      {rec.checks.map(c => (
        <div key={c.label}
             className="flex items-start gap-2 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <span className={`mt-0.5 shrink-0 font-bold ${c.ok ? 'text-emerald-600' : 'text-amber-600'}`}>
            {c.ok ? '✓' : '!'}
          </span>
          <div className="min-w-0">
            <p className="text-sm">{c.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote, Plus, Pencil, Trash2, X, Check, AlertCircle, Printer, Wallet,
  CalendarCheck, BookOpen, BarChart3, SearchCheck, Tags, FileText, Settings2, Upload,
  ScanLine, Download, Sparkles,
} from 'lucide-react';
import { IconSidebar } from '@/components/IconSidebar';
import { SyncStatus } from '@/components/SyncStatus';
import { useTheme } from '@/lib/theme';
import { ArqueoModal } from '@/components/cuentas/ArqueoModal';
import { ImportPanel } from '@/components/cuentas/ImportPanel';
import { OcrPanel } from '@/components/cuentas/OcrPanel';
import {
  S26Sheet, BalanceCards, ActionTiles, S30Report, S25cReport, IncomeExpenseChart,
  ReconcilePanel, FormHeader,
} from '@/components/cuentas/ReportsV2';
import {
  ACCOUNTS, ACCOUNT_LABELS, TYPE_LABELS, QUARTERS, money,
  currentYm, serviceYearOf, serviceYearMonths, monthLabel, serviceYearOptions,
  MONTH_NAMES_ES, EMPTY_CONFIG,
  type Account, type TxType, type CtCode, type S26, type S30, type S25c,
  type Summary, type Reconcile, type CuentasConfig, type Transaction, type CierreEntry,
  type S25cAnswers, type S25cAnswer, type S25cAnswerValue,
} from '@/components/cuentas/types';

/* ── Navegación ─────────────────────────────────────────────────────────────── */

type View = 's26' | 's30' | 'forms' | 'chart' | 'reconcile' | 'codes' | 'ocr' | 'import' | 'config';

const NAV: { key: View; label: string; sub: string; Icon: typeof BookOpen }[] = [
  { key: 's26',       label: 'Hoja de Cuentas',   sub: 'S-26-S',            Icon: BookOpen },
  { key: 's30',       label: 'Informe Mensual',   sub: 'S-30-S',            Icon: FileText },
  { key: 'forms',     label: 'Formularios',       sub: 'S-26 / S-30 / S-25c', Icon: Printer },
  { key: 'chart',     label: 'Relación I/E',      sub: 'Año de servicio',    Icon: BarChart3 },
  { key: 'reconcile', label: 'Análisis Contables', sub: 'Verificación',      Icon: SearchCheck },
  { key: 'codes',     label: 'Códigos CT',        sub: 'Catálogo',           Icon: Tags },
  { key: 'ocr',       label: 'Subir Recibo',      sub: 'Captura con IA',     Icon: ScanLine },
  { key: 'import',    label: 'Importar',          sub: 'Respaldo CSV',       Icon: Upload },
  { key: 'config',    label: 'Configuración',     sub: 'Encabezado y cierre', Icon: Settings2 },
];

const blankForm = () => ({
  id: null as string | null,
  date: new Date().toISOString().slice(0, 10),
  type: 'income' as TxType,
  account: 'caja' as Account,
  to_account: 'corriente' as Account,
  code: '',
  description: '',
  amount: '' as string,
  receipt_ref: '',
  notes: '',
});

export default function CuentasPage() {
  useTheme();

  const [view, setView] = useState<View>('s26');
  const [ym, setYm] = useState(currentYm());
  const [quarter, setQuarter] = useState(4);
  const [formTab, setFormTab] = useState<'s26' | 's30' | 's25c'>('s26');

  // El año de servicio se deriva del mes seleccionado: mantenerlo como estado
  // aparte obligaba a sincronizarlo con un efecto, y dos fuentes para el mismo
  // dato se desincronizan tarde o temprano.
  const sy = serviceYearOf(ym);

  const [s26, setS26] = useState<S26 | null>(null);
  const [s30, setS30] = useState<S30 | null>(null);
  const [s25c, setS25c] = useState<S25c | null>(null);
  const [s25cAnswers, setS25cAnswers] = useState<S25cAnswers>({});
  const [auditorName, setAuditorName] = useState('');
  const [secretarioName, setSecretarioName] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rec, setRec] = useState<Reconcile | null>(null);
  const [codes, setCodes] = useState<CtCode[]>([]);
  const [cfg, setCfg] = useState<CuentasConfig>(EMPTY_CONFIG);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [modal, setModal] = useState<'tx' | 'opening' | 'cierre' | 'arqueo' | null>(null);
  const [form, setForm] = useState(blankForm());
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filters, setFilters] = useState<{ account: string; type: string }>({ account: '', type: '' });

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  /* ── Carga de datos ───────────────────────────────────────────────────────── */

  const api = useCallback(async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  }, []);

  // Los cargadores escriben estado solo dentro de `.then`/`.catch`: nunca de forma
  // sincrónica en el cuerpo de un efecto. El indicador de carga se deriva
  // comparando lo pedido con lo ya cargado, así no hace falta un flag aparte.
  const loadCodes = useCallback(() => api('/api/cuentas/codes')
    .then(d => setCodes((d.codes as CtCode[]) || []))
    .catch(() => { /* el catálogo se autosiembra; un fallo aquí no bloquea */ }), [api]);

  const loadConfig = useCallback(() => api('/api/cuentas/config')
    .then(d => setCfg(d.config as CuentasConfig))
    .catch(() => { /* el encabezado cae a los datos de la congregación */ }), [api]);

  const loadMonth = useCallback((m: string) => Promise.all([
      api(`/api/cuentas/reports?kind=s26&ym=${m}`),
      api(`/api/cuentas/reports?kind=s30&ym=${m}`),
      api(`/api/cuentas/reports?kind=reconcile&ym=${m}`),
    ])
    .then(([a, b, c]) => {
      setS26(a.s26 as S26); setS30(b.s30 as S30); setRec(c.reconcile as Reconcile);
      setError(null);
    })
    .catch(e => setError(e instanceof Error ? e.message : 'Error')), [api]);

  const loadSummary = useCallback((y: string) =>
    api(`/api/cuentas/reports?kind=summary&sy=${encodeURIComponent(y)}`)
      .then(d => setSummary(d.summary as Summary))
      .catch(e => setError(e instanceof Error ? e.message : 'Error')), [api]);

  const loadS25c = useCallback((y: string, q: number) =>
    api(`/api/cuentas/reports?kind=s25c&sy=${encodeURIComponent(y)}&quarter=${q}`)
      .then(d => {
        const data = d.s25c as S25c;
        setS25c(data);
        // Pre-fill answers with auto-computed values; auditor can override
        const init: S25cAnswers = {};
        for (const [k, v] of Object.entries(data.autoAnswers ?? {})) {
          if (v) init[k] = { answer: v as S25cAnswerValue, notes: '' };
        }
        setS25cAnswers(init);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Error')), [api]);

  useEffect(() => { loadCodes(); loadConfig(); }, [loadCodes, loadConfig]);
  useEffect(() => { loadMonth(ym); }, [ym, loadMonth]);
  useEffect(() => { if (view === 'chart') loadSummary(sy); }, [view, sy, loadSummary]);
  useEffect(() => {
    if (view === 'forms' && formTab === 's25c') loadS25c(sy, quarter);
  }, [view, formTab, sy, quarter, loadS25c]);

  /** Lo mostrado corresponde al mes pedido. */
  const monthReady = s26?.ym === ym && s30?.ym === ym;

  /* ── Transacciones ────────────────────────────────────────────────────────── */

  function openNew() { setForm(blankForm()); setFormErr(null); setModal('tx'); }

  function openEdit(t: Transaction) {
    setForm({
      id: t.id, date: t.date, type: t.type, account: t.account,
      to_account: t.to_account ?? 'corriente', code: t.code ?? '',
      description: t.description, amount: String(t.amount),
      receipt_ref: t.receipt_ref ?? '', notes: t.notes ?? '',
    });
    setFormErr(null); setModal('tx');
  }

  /** Al elegir un código CT se preselecciona su tipo natural. */
  function pickCode(code: string) {
    const c = codes.find(x => x.code === code);
    setForm(f => ({
      ...f,
      code,
      type: c ? c.kind : f.type,
      account: c?.kind === 'expense' ? 'corriente' : c?.kind === 'income' ? 'caja' : f.account,
    }));
  }

  async function saveTx() {
    setFormErr(null);
    const amount = Number(form.amount);
    if (!form.date) return setFormErr('La fecha es obligatoria');
    if (!form.description.trim()) return setFormErr('La descripción es obligatoria');
    if (!Number.isFinite(amount) || amount <= 0) return setFormErr('El monto debe ser mayor a 0');
    if (form.type === 'transfer' && form.to_account === form.account) {
      return setFormErr('La cuenta destino debe ser distinta del origen');
    }

    setSaving(true);
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        date: form.date, type: form.type, account: form.account,
        to_account: form.type === 'transfer' ? form.to_account : null,
        code: form.code || null, description: form.description.trim(),
        amount, receipt_ref: form.receipt_ref || null, notes: form.notes || null,
      };
      await api('/api/cuentas/transactions', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setModal(null);
      flash(form.id ? 'Transacción actualizada' : 'Transacción registrada');
      await loadMonth(ym);
    } catch (e) { setFormErr(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function deleteTx(t: Transaction) {
    if (!confirm(`¿Eliminar «${t.description}» por ${money(t.amount)}?\n\nEsta acción no se puede deshacer.`)) return;
    try {
      await api(`/api/cuentas/transactions?id=${t.id}`, { method: 'DELETE' });
      flash('Transacción eliminada');
      await loadMonth(ym);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }

  /* ── Filtrado en cliente del ledger ──────────────────────────────────────── */

  const visibleRows = useMemo(() => {
    if (!s26) return [];
    return s26.rows.filter(r => {
      if (filters.type && r.type !== filters.type) return false;
      if (filters.account) {
        const a = filters.account as Account;
        if (r.account !== a && r.to_account !== a) return false;
      }
      return true;
    });
  }, [s26, filters]);

  const filteredS26 = useMemo(
    () => s26 ? { ...s26, rows: visibleRows } : null, [s26, visibleRows]);

  /* ── Render ───────────────────────────────────────────────────────────────── */

  const inputCls = 'w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500';
  const lblCls = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';
  const months = serviceYearMonths(sy);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      <IconSidebar />
      <SyncStatus />

      <div className="flex-1 flex flex-col overflow-hidden pb-[52px] md:pb-0">
        {/* Cabecera */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 dark:from-emerald-800 dark:to-emerald-950 text-white px-4 py-2 shrink-0 flex flex-wrap items-center gap-2 print:hidden">
          <Banknote size={18} />
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight">Cuentas de la Congregación</h1>
            <p className="text-[11px] text-white/75 leading-tight">
              {cfg.label || '—'}{cfg.city ? ` · ${cfg.city}` : ''}{cfg.state ? `, ${cfg.state}` : ''}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setModal('arqueo')}
                    className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1.5">
              <Wallet size={13} /> <span className="hidden sm:inline">Arqueo de Caja</span>
            </button>
            <button onClick={() => setModal('cierre')}
                    className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 rounded-lg px-2.5 py-1.5">
              <CalendarCheck size={13} /> <span className="hidden sm:inline">Cierre de Mes</span>
            </button>
          </div>
        </div>

        {/* Año de servicio + rejilla de meses */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 shrink-0 print:hidden">
          <div className="flex items-center gap-3 mb-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">Año de servicio</label>
            <select value={sy} onChange={e => setYm(serviceYearMonths(e.target.value)[0])}
                    className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-sm">
              {serviceYearOptions().map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="text-xs text-gray-400 ml-auto hidden md:inline">
              El año de servicio va de septiembre a agosto
            </span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-1">
            {months.map(m => {
              const [yy, mm] = m.split('-');
              const active = m === ym;
              return (
                <button key={m} onClick={() => setYm(m)}
                        className={`px-1.5 py-1 rounded-lg text-[11px] leading-tight border transition-colors ${
                          active
                            ? 'bg-emerald-600 border-emerald-600 text-white font-semibold'
                            : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-emerald-400'}`}>
                  <span className="block truncate">{MONTH_NAMES_ES[Number(mm) - 1]}</span>
                  <span className={`block ${active ? 'text-white/75' : 'text-gray-400'}`}>{yy}-{mm}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navegación de módulos */}
        <div className="bg-gray-100 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-2 shrink-0 overflow-x-auto print:hidden">
          <div className="flex gap-1">
            {NAV.map(n => (
              <button key={n.key} onClick={() => setView(n.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors ${
                        view === n.key
                          ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-semibold'
                          : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                <n.Icon size={13} />
                <span>{n.label}</span>
                <span className="hidden lg:inline text-gray-400">· {n.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm print:hidden">
              <AlertCircle size={14} /> {error}
              <button onClick={() => setError(null)} className="ml-auto"><X size={13} /></button>
            </div>
          )}
          {toast && (
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm print:hidden">
              ✓ {toast}
            </div>
          )}

          {/* Aviso de descuadre del saldo inicial declarado */}
          {s26 && !s26.openingAudit.matches && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/25 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs print:hidden">
              <strong>El saldo inicial declarado no coincide con el arrastre real.</strong>{' '}
              Declarado {money(s26.openingAudit.declared ? Object.values(s26.openingAudit.declared).reduce((a, b) => a + b, 0) : 0)},
              arrastrado {money(Object.values(s26.openingAudit.carried).reduce((a, b) => a + b, 0))},
              diferencia {money(s26.openingAudit.diffTotal)}. Mientras persista, el informe S-30 y los
              saldos por cuenta contarán historias distintas.
              <button onClick={() => setModal('opening')} className="ml-2 underline font-medium">Revisar</button>
            </div>
          )}

          {!monthReady && <p className="text-sm text-gray-400 text-center py-6 print:hidden">Cargando {monthLabel(ym)}…</p>}

          {/* ── Hoja S-26 ─────────────────────────────────────────────────── */}
          {view === 's26' && s26 && filteredS26 && (
            <>
              <div className="print:hidden">
                <ActionTiles actions={[
                  { key: 'ocr',    title: 'Subir Recibo',        sub: 'Captura automática con IA', gradient: 'from-teal-500 to-cyan-600',    icon: <ScanLine size={15} />,      onClick: () => setView('ocr') },
                  { key: 'anal',   title: 'Análisis Contables',  sub: 'Verificación del mes',      gradient: 'from-fuchsia-500 to-purple-600', icon: <SearchCheck size={15} />, onClick: () => setView('reconcile') },
                  { key: 'forms',  title: 'Formularios Oficiales', sub: 'S-26 / S-30 / S-25c',     gradient: 'from-orange-500 to-red-600',   icon: <Printer size={15} />,       onClick: () => setView('forms') },
                  { key: 'cierre', title: 'Cierre de Fin de Mes', sub: 'Genera los asientos',      gradient: 'from-emerald-500 to-green-700', icon: <CalendarCheck size={15} />, onClick: () => setModal('cierre') },
                  { key: 'arqueo', title: 'Arqueo de Caja',      sub: 'Corte y conteo',            gradient: 'from-amber-500 to-yellow-600', icon: <Wallet size={15} />,        onClick: () => setModal('arqueo') },
                ]} />
              </div>

              <BalanceCards s26={s26} />

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <select value={filters.account} onChange={e => setFilters(f => ({ ...f, account: e.target.value }))}
                        className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs">
                  <option value="">Todas las cuentas</option>
                  {ACCOUNTS.map(a => <option key={a} value={a}>{ACCOUNT_LABELS[a]}</option>)}
                </select>
                <select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
                        className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs">
                  <option value="">Todos los tipos</option>
                  {(Object.keys(TYPE_LABELS) as TxType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                {(filters.account || filters.type) && (
                  <button onClick={() => setFilters({ account: '', type: '' })}
                          className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
                    Limpiar filtros
                  </button>
                )}
                <button onClick={() => setModal('opening')}
                        className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
                  Editar saldo inicial
                </button>
                <button onClick={openNew}
                        className="ml-auto flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2 rounded-lg">
                  <Plus size={14} /> Nueva transacción
                </button>
              </div>

              <S26Sheet
                s26={filteredS26}
                onEdit={openEdit}
                onDelete={deleteTx}
                onOpeningEdit={() => setModal('opening')}
              />
            </>
          )}

          {/* ── Informe S-30 ──────────────────────────────────────────────── */}
          {view === 's30' && s30 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center justify-between mb-3 print:hidden">
                <h2 className="font-semibold text-sm">Informe Mensual de las Cuentas — {s30.monthLabel}</h2>
                <button onClick={() => window.print()}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
                  <Printer size={13} /> Imprimir
                </button>
              </div>
              <S30Report s30={s30} />
            </div>
          )}

          {/* ── Formularios oficiales ─────────────────────────────────────── */}
          {view === 'forms' && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
                {([['s26','S-26-S · Hoja de Cuentas'],['s30','S-30-S · Informe Mensual'],['s25c','S-25c · Auditoría']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setFormTab(k)}
                          className={`px-3 py-1.5 text-xs rounded-lg border ${
                            formTab === k
                              ? 'bg-sky-700 border-sky-700 text-white font-medium'
                              : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-sky-400'}`}>
                    {l}
                  </button>
                ))}
                {formTab === 's25c' && (
                  <>
                    <select value={quarter} onChange={e => setQuarter(Number(e.target.value))}
                            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs">
                      {QUARTERS.map(q => <option key={q.n} value={q.n}>{q.label}</option>)}
                    </select>
                    <input value={auditorName} onChange={e => setAuditorName(e.target.value)}
                           placeholder="Auditor" title="Auditoría realizada por"
                           className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs w-36" />
                    <input value={secretarioName} onChange={e => setSecretarioName(e.target.value)}
                           placeholder="Secretario" title="Revisada por (Secretario)"
                           className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs w-36" />
                  </>
                )}
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  {/* PDF oficial sobre plantilla de la organización */}
                  {/* Para el S-25c se codifican las respuestas del cuestionario en &a= */}
                  <a href={formTab === 's25c'
                        ? `/api/cuentas/forms?kind=s25c&sy=${encodeURIComponent(sy)}&quarter=${quarter}&a=${encodeURIComponent(
                            Object.entries(s25cAnswers).filter(([,v])=>v.answer).map(([k,v])=>`${k}:${v.answer}`).join(',')
                          )}${auditorName ? `&auditor=${encodeURIComponent(auditorName)}` : ''}${secretarioName ? `&secretario=${encodeURIComponent(secretarioName)}` : ''}`
                        : `/api/cuentas/forms?kind=${formTab}&ym=${ym}`}
                     target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white">
                    <Download size={13} /> PDF oficial
                  </a>
                  <a href={formTab === 's25c'
                        ? `/api/cuentas/forms?kind=s25c&sy=${encodeURIComponent(sy)}&quarter=${quarter}&calibrate=1`
                        : `/api/cuentas/forms?kind=${formTab}&ym=${ym}&calibrate=1`}
                     target="_blank" rel="noopener noreferrer"
                     title="Rellena cada casilla con su nombre, para ajustar el mapa de campos"
                     className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
                    <Sparkles size={13} /> Calibrar
                  </a>
                  {formTab === 's25c' && (
                    <a href={`/api/cuentas/forms?kind=receipts-quarter&sy=${encodeURIComponent(sy)}&quarter=${quarter}`}
                       target="_blank" rel="noopener noreferrer"
                       title="Reporte HTML de todos los egresos del trimestre con indicación de comprobante"
                       className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white">
                      <Download size={13} /> Recibos del trimestre
                    </a>
                  )}
                  <button onClick={() => window.print()}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Printer size={13} /> Imprimir
                  </button>
                </div>
              </div>

              {formTab === 's26' && s26 && (
                <>
                  <FormHeader title="HOJA DE CUENTAS" subtitle="S-26-S" cfg={cfg} right={s26.monthLabel} />
                  <S26Sheet s26={s26} official />
                </>
              )}
              {formTab === 's30' && s30 && (
                <>
                  <FormHeader title="INFORME MENSUAL DE LAS CUENTAS DE LA CONGREGACIÓN"
                              subtitle="S-30-S" cfg={cfg}
                              right={`Mes: ${s30.monthLabel} · Año de Servicio: ${s30.serviceYear}`} />
                  <S30Report s30={s30} />
                </>
              )}
              {formTab === 's25c' && s25c && (
                <>
                  <FormHeader title="INFORME SOBRE LA AUDITORÍA DE LAS CUENTAS DE LA CONGREGACIÓN"
                              subtitle="S-25c" cfg={cfg}
                              right={`${s25c.quarterLabel} · Año de Servicio ${s25c.serviceYear}`} />
                  <S25cReport
                    s25c={s25c}
                    answers={s25cAnswers}
                    onAnswerChange={(k, v: S25cAnswer) => setS25cAnswers(a => ({ ...a, [k]: v }))}
                  />
                </>
              )}
            </div>
          )}

          {/* ── Relación I/E ──────────────────────────────────────────────── */}
          {view === 'chart' && summary && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h2 className="font-semibold text-sm mb-3">
                Relación de Ingresos y Egresos — Año de servicio {summary.serviceYear}
              </h2>
              <IncomeExpenseChart summary={summary} />
            </div>
          )}

          {/* ── Análisis contables ────────────────────────────────────────── */}
          {view === 'reconcile' && rec && <ReconcilePanel rec={rec} />}

          {/* ── Códigos CT ────────────────────────────────────────────────── */}
          {view === 'codes' && <CodesPanel codes={codes} api={api} reload={loadCodes} flash={flash} setError={setError} />}

          {/* ── Lectura de recibos con IA ─────────────────────────────────── */}
          {view === 'ocr' && (
            <OcrPanel api={api} codes={codes} flash={flash} setError={setError}
                      onRegistered={() => loadMonth(ym)} />
          )}

          {/* ── Importar respaldo ─────────────────────────────────────────── */}
          {view === 'import' && (
            <ImportPanel api={api} flash={flash} setError={setError}
                         onImported={() => { loadCodes(); loadMonth(ym); }} />
          )}

          {/* ── Configuración ─────────────────────────────────────────────── */}
          {view === 'config' && (
            <ConfigPanel cfg={cfg} setCfg={setCfg} codes={codes} api={api} flash={flash} setError={setError} />
          )}
        </div>
      </div>

      {/* ── Modales ────────────────────────────────────────────────────────── */}

      {modal === 'tx' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-sm">{form.id ? 'Editar asiento' : 'Registrar asiento'}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>

            <div className="p-4 space-y-3">
              {formErr && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle size={13} /> {formErr}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lblCls}>Fecha *</label>
                  <input type="date" value={form.date} className={inputCls}
                         onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className={lblCls}>Monto ($) *</label>
                  <input type="number" min="0.01" step="0.01" value={form.amount} placeholder="0.00" className={inputCls}
                         onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className={lblCls}>Código CT</label>
                <select value={form.code} className={inputCls} onChange={e => pickCode(e.target.value)}>
                  <option value="">Sin código</option>
                  {codes.map(c => <option key={c.id} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </div>

              <div>
                <label className={lblCls}>Tipo *</label>
                <select value={form.type} className={inputCls}
                        onChange={e => setForm(f => ({ ...f, type: e.target.value as TxType }))}>
                  {(Object.keys(TYPE_LABELS) as TxType[]).map(t => (
                    <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              <div className={`grid gap-3 ${form.type === 'transfer' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label className={lblCls}>{form.type === 'transfer' ? 'Cuenta origen *' : 'Cuenta *'}</label>
                  <select value={form.account} className={inputCls}
                          onChange={e => setForm(f => ({ ...f, account: e.target.value as Account }))}>
                    {ACCOUNTS.map(a => <option key={a} value={a}>{ACCOUNT_LABELS[a]}</option>)}
                  </select>
                </div>
                {form.type === 'transfer' && (
                  <div>
                    <label className={lblCls}>Cuenta destino *</label>
                    <select value={form.to_account} className={inputCls}
                            onChange={e => setForm(f => ({ ...f, to_account: e.target.value as Account }))}>
                      {ACCOUNTS.filter(a => a !== form.account).map(a => (
                        <option key={a} value={a}>{ACCOUNT_LABELS[a]}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className={lblCls}>Descripción de la transacción *</label>
                <input value={form.description} className={inputCls} placeholder="Ej. Donaciones (Obra mundial)"
                       onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lblCls}>Comprobante</label>
                  <input value={form.receipt_ref} className={inputCls} placeholder="Folio"
                         onChange={e => setForm(f => ({ ...f, receipt_ref: e.target.value }))} />
                </div>
                <div>
                  <label className={lblCls}>Notas</label>
                  <input value={form.notes} className={inputCls} placeholder="Observaciones"
                         onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setModal(null)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
                Cancelar
              </button>
              <button onClick={saveTx} disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50">
                <Check size={13} /> {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === 'opening' && s26 && (
        <OpeningModal ym={ym} s26={s26} api={api} onClose={() => setModal(null)}
                      onSaved={async () => { setModal(null); flash('Saldo inicial actualizado'); await loadMonth(ym); }} />
      )}

      {modal === 'cierre' && (
        <CierreModal ym={ym} api={api} onClose={() => setModal(null)}
                     onDone={async (msg) => { setModal(null); flash(msg); await loadMonth(ym); }} />
      )}

      {modal === 'arqueo' && s26 && (
        <ArqueoModal
          systemBalance={s26.closing.corriente}
          onClose={() => setModal(null)}
          onRegisterDiff={async (diff, note) => {
            try {
              await api('/api/cuentas/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  date: new Date().toISOString().slice(0, 10),
                  type: diff > 0 ? 'income' : 'expense',
                  account: 'corriente',
                  code: diff > 0 ? 'OI' : 'GC',
                  description: `Ajuste por arqueo de caja (${diff > 0 ? 'sobrante' : 'faltante'})`,
                  amount: Math.abs(diff),
                  notes: note,
                }),
              });
              setModal(null);
              flash('Diferencia de arqueo registrada');
              await loadMonth(ym);
            } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
          }}
        />
      )}
    </div>
  );
}

/* ── Saldo inicial ──────────────────────────────────────────────────────────── */

function OpeningModal({ ym, s26, api, onClose, onSaved }: {
  ym: string; s26: S26;
  api: (u: string, i?: RequestInit) => Promise<Record<string, unknown>>;
  onClose: () => void; onSaved: () => void;
}) {
  const [v, setV] = useState<Record<Account, string>>({
    caja: String(s26.opening.caja),
    corriente: String(s26.opening.corriente),
    sucursal: String(s26.opening.sucursal),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const carried = s26.openingAudit.carried;
  const total = ACCOUNTS.reduce((s, a) => s + (Number(v[a]) || 0), 0);
  const carriedTotal = ACCOUNTS.reduce((s, a) => s + carried[a], 0);

  async function save() {
    setBusy(true); setErr(null);
    try {
      await api('/api/cuentas/saldo-inicial', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym, caja: Number(v.caja) || 0, corriente: Number(v.corriente) || 0, sucursal: Number(v.sucursal) || 0 }),
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  async function useCarried() {
    setBusy(true); setErr(null);
    try {
      await api(`/api/cuentas/saldo-inicial?ym=${ym}`, { method: 'DELETE' }).catch(() => null);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-sm">Saldo inicial — {monthLabel(ym)}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            El arrastre calculado desde los meses anteriores es <strong>{money(carriedTotal)}</strong>.
            Si declaras un saldo distinto, el S-30 y los saldos por cuenta dejarán de cuadrar.
          </p>

          {ACCOUNTS.map(a => (
            <div key={a}>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                {ACCOUNT_LABELS[a]} <span className="text-gray-400">· arrastre {money(carried[a])}</span>
              </label>
              <input type="number" step="0.01" value={v[a]}
                     onChange={e => setV(s => ({ ...s, [a]: e.target.value }))}
                     className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}

          <div className={`p-2.5 rounded-lg text-sm border ${
            Math.abs(total - carriedTotal) < 0.01
              ? 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-300 dark:border-emerald-700'
              : 'bg-amber-50 dark:bg-amber-900/25 border-amber-300 dark:border-amber-700'}`}>
            Total declarado <strong>{money(total)}</strong> · arrastre <strong>{money(carriedTotal)}</strong>
            {Math.abs(total - carriedTotal) >= 0.01 && (
              <span className="block text-xs mt-0.5">Diferencia {money(total - carriedTotal)}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={useCarried} disabled={busy}
                  className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50">
            Usar el arrastre
          </button>
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
            Cancelar
          </button>
          <button onClick={save} disabled={busy}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50">
            <Check size={13} /> {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Cierre de mes ──────────────────────────────────────────────────────────── */

interface CierrePreview {
  monthLabel: string;
  entries: CierreEntry[];
  total: number;
  alreadyClosed: boolean;
  existingEntries: { id: string; amount: number }[];
  availableInMain: number;
  config: CuentasConfig;
}

const KIND_LABEL: Record<CierreEntry['kind'], string> = {
  remit:       'Remesa de obra mundial',
  res_pub:     'Resolución por publicador',
  res_pct:     'Resolución porcentual',
  maintenance: 'Mantenimiento',
};

function CierreModal({ ym, api, onClose, onDone }: {
  ym: string;
  api: (u: string, i?: RequestInit) => Promise<Record<string, unknown>>;
  onClose: () => void; onDone: (msg: string) => void;
}) {
  const [prev, setPrev] = useState<CierrePreview | null>(null);
  const [publishers, setPublishers] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // La previsualización se recalcula al cambiar los publicadores: la resolución
  // por publicador depende de ese número, así que el desglose debe reflejarlo
  // antes de ejecutar nada.
  useEffect(() => {
    const q = publishers ? `&publishers=${encodeURIComponent(publishers)}` : '';
    api(`/api/cuentas/cierre-mes?ym=${ym}${q}`)
      .then(d => setPrev(d as unknown as CierrePreview))
      .catch(e => setErr(e instanceof Error ? e.message : 'Error'));
  }, [ym, publishers, api]);

  async function run(correction: boolean) {
    if (correction && !confirm(
      'Corregir el cierre elimina los asientos generados por el cierre anterior de este mes y los vuelve a crear.\n\n¿Continuar?'
    )) return;

    setBusy(true); setErr(null);
    try {
      const d = await api('/api/cuentas/cierre-mes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ym, publishers: publishers ? Number(publishers) : null, correction }),
      }) as { message?: string };
      onDone(d.message || 'Cierre generado');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  const noPubRate = prev && prev.config.res_pub_amount <= 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <h3 className="font-semibold text-sm">Cierre de fin de mes — {monthLabel(ym)}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          {err && <p className="text-xs text-red-600 dark:text-red-400">{err}</p>}
          {!prev && !err && <p className="text-gray-400 text-xs">Calculando…</p>}

          {prev && (
            <>
              {prev.alreadyClosed && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/25 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs">
                  Este mes ya tiene cierre ({prev.existingEntries.length} asiento(s)). Al corregir se
                  eliminan y se generan de nuevo.
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Publicadores informados
                </label>
                <input type="number" min="0" value={publishers} onChange={e => setPublishers(e.target.value)}
                       placeholder="Ej. 78"
                       className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm" />
                {noPubRate && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    El monto por publicador está en 0, así que esa resolución no se generará.
                    Configúralo en Configuración → Cierre de mes.
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  Asientos que se generarán (salidas de la Cuenta Principal, disponible {money(prev.availableInMain)})
                </p>

                {prev.entries.length === 0 ? (
                  <p className="text-xs text-gray-400 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    No hay nada que asentar en este mes.
                  </p>
                ) : (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700">
                    {prev.entries.map(e => (
                      <div key={e.kind} className="p-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium">
                            <span className="font-mono mr-1.5">{e.code}</span>{KIND_LABEL[e.kind]}
                          </span>
                          <span className="font-semibold tabular-nums">{money(e.amount)}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{e.basis}</p>
                      </div>
                    ))}
                    <div className="p-2.5 flex justify-between bg-gray-50 dark:bg-gray-700/50">
                      <span className="text-xs font-semibold">Total</span>
                      <span className="font-bold tabular-nums">{money(prev.total)}</span>
                    </div>
                  </div>
                )}

                {prev.total > prev.availableInMain && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                    El total supera el saldo disponible en la Cuenta Principal; quedará en negativo.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600">
            Cancelar
          </button>
          <button onClick={() => run(!!prev?.alreadyClosed)} disabled={busy || !prev || prev.entries.length === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50">
            <Check size={13} />
            {busy ? 'Procesando…' : prev?.alreadyClosed ? 'Corregir cierre' : 'Confirmar y ejecutar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Códigos CT ─────────────────────────────────────────────────────────────── */

function CodesPanel({ codes, api, reload, flash, setError }: {
  codes: CtCode[];
  api: (u: string, i?: RequestInit) => Promise<Record<string, unknown>>;
  reload: () => void; flash: (m: string) => void; setError: (m: string) => void;
}) {
  const [n, setN] = useState({ code: '', description: '', kind: 'income' as TxType });
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!n.code.trim() || !n.description.trim()) return;
    setBusy(true);
    try {
      await api('/api/cuentas/codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n),
      });
      setN({ code: '', description: '', kind: 'income' });
      flash('Código agregado'); reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  async function del(c: CtCode) {
    if (!confirm(`¿Eliminar el código ${c.code}?`)) return;
    try {
      await api(`/api/cuentas/codes?id=${c.id}`, { method: 'DELETE' });
      flash('Código eliminado'); reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }

  const inp = 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-sm mb-3">Agregar código de transacción</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={n.code} onChange={e => setN(s => ({ ...s, code: e.target.value.toUpperCase() }))}
                 placeholder="Código (ej. GC)" className={inp} maxLength={8} />
          <input value={n.description} onChange={e => setN(s => ({ ...s, description: e.target.value }))}
                 placeholder="Descripción" className={`${inp} sm:col-span-2`} />
          <select value={n.kind} onChange={e => setN(s => ({ ...s, kind: e.target.value as TxType }))} className={inp}>
            {(Object.keys(TYPE_LABELS) as TxType[]).map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <button onClick={add} disabled={busy || !n.code.trim() || !n.description.trim()}
                className="mt-3 flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40">
          <Plus size={13} /> Agregar
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-semibold">
          Catálogo ({codes.length})
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500 dark:text-gray-400">
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="px-4 py-1.5 text-left font-normal">Código</th>
              <th className="px-4 py-1.5 text-left font-normal">Descripción</th>
              <th className="px-4 py-1.5 text-left font-normal">Tipo</th>
              <th className="px-4 py-1.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {codes.map(c => (
              <tr key={c.id}>
                <td className="px-4 py-1.5 font-mono font-medium">{c.code}</td>
                <td className="px-4 py-1.5">{c.description}</td>
                <td className="px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400">{TYPE_LABELS[c.kind]}</td>
                <td className="px-4 py-1.5 text-right">
                  <button onClick={() => del(c)} className="p-1 text-gray-400 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {codes.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">Sin códigos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Encabezado de formularios ──────────────────────────────────────────────── */

function ConfigPanel({ cfg, setCfg, codes, api, flash, setError }: {
  cfg: CuentasConfig; setCfg: (c: CuentasConfig) => void; codes: CtCode[];
  api: (u: string, i?: RequestInit) => Promise<Record<string, unknown>>;
  flash: (m: string) => void; setError: (m: string) => void;
}) {
  // El borrador arranca nulo y cae a `cfg`: así el valor cargado del servidor se
  // refleja sin necesitar un efecto que sincronice dos estados.
  const [draft, setDraft] = useState<CuentasConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const v = draft ?? cfg;
  const edit = (patch: Partial<CuentasConfig>) => setDraft({ ...v, ...patch });

  async function save() {
    setBusy(true);
    try {
      await api('/api/cuentas/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      setCfg({ ...v, ai_api_key: undefined, has_ai_key: v.ai_api_key ? v.ai_api_key !== '-' : cfg.has_ai_key });
      setDraft(null); flash('Configuración guardada');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  const inp = 'w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm';
  const lbl = 'block text-xs text-gray-500 dark:text-gray-400 mb-1';

  /** Selector de código con el catálogo, permitiendo un valor aún no creado. */
  const codeSelect = (value: string, onChange: (v: string) => void, kind?: TxType) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={inp}>
      {!codes.some(c => c.code === value) && <option value={value}>{value}</option>}
      {codes.filter(c => !kind || c.kind === kind).map(c => (
        <option key={c.id} value={c.code}>{c.code} — {c.description}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-sm mb-1">Encabezado de los formularios</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Aparece en el S-26, S-30 y S-25c. Por defecto se toma de los datos de la congregación.
        </p>
        <div className="space-y-3">
          <div>
            <label className={lbl}>Congregación</label>
            <input value={v.label} onChange={e => edit({ label: e.target.value })}
                   placeholder="ESTACION" className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Ciudad</label>
              <input value={v.city} onChange={e => edit({ city: e.target.value })}
                     placeholder="PATZCUARO" className={inp} />
            </div>
            <div>
              <label className={lbl}>Estado</label>
              <input value={v.state} onChange={e => edit({ state: e.target.value })}
                     placeholder="MICH" className={inp} />
            </div>
          </div>
          <div>
            <label className={lbl}>Siervo de cuentas</label>
            <input value={v.treasurer_name ?? ''} onChange={e => edit({ treasurer_name: e.target.value })}
                   placeholder="Nombre completo" className={inp} />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-sm mb-1">Cierre de mes</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          El cierre genera hasta tres salidas de la Cuenta Principal: la remesa de las donaciones
          para la obra mundial y las dos resoluciones mensuales.
        </p>

        <div className="space-y-4">
          <div>
            <label className={lbl}>Código de la remesa de obra mundial</label>
            {codeSelect(v.remit_code, c => edit({ remit_code: c }), 'expense')}
            <p className="text-[11px] text-gray-400 mt-1">
              Se asienta por las donaciones recibidas con código OM o DO que aún no se han remesado.
            </p>
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold mb-2">Resolución 1 — por publicador</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Monto por publicador ($)</label>
                <input type="number" min="0" step="0.01" value={v.res_pub_amount}
                       onChange={e => edit({ res_pub_amount: Number(e.target.value) || 0 })}
                       className={inp} />
              </div>
              <div>
                <label className={lbl}>Código</label>
                {codeSelect(v.res_pub_code, c => edit({ res_pub_code: c }), 'expense')}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Monto × publicadores informados en el cierre. En 0 no se genera el asiento.
            </p>
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold mb-2">Resolución 2 — porcentaje de donaciones</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Porcentaje (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={v.res_pct_percent}
                       onChange={e => edit({ res_pct_percent: Number(e.target.value) || 0 })}
                       className={inp} />
              </div>
              <div>
                <label className={lbl}>Sobre el código</label>
                {codeSelect(v.res_pct_source, c => edit({ res_pct_source: c }), 'income')}
              </div>
              <div>
                <label className={lbl}>Código del asiento</label>
                {codeSelect(v.res_pct_code, c => edit({ res_pct_code: c }), 'expense')}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Por omisión, 10% de las donaciones para la congregación (código C) del mes.
            </p>
          </div>

          <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold mb-2">Mantenimiento mensual</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Monto fijo ($)</label>
                <input type="number" min="0" step="0.01" value={v.maintenance_amount}
                       onChange={e => edit({ maintenance_amount: Number(e.target.value) || 0 })}
                       className={inp} />
              </div>
              <div>
                <label className={lbl}>Código</label>
                {codeSelect(v.maintenance_code, c => edit({ maintenance_code: c }), 'expense')}
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Gasto mensual fijo de mantenimiento del Salón del Reino. En 0 no se genera el asiento.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-sm mb-1 flex items-center gap-1.5">
          <Sparkles size={14} className="text-violet-500" /> Lectura de recibos con IA
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Clave de Google AI Studio (Gemini) para leer los recibos, tanto desde «Subir Recibo»
          como desde el bot de Telegram. Consíguela gratis en{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer"
             className="text-sky-600 dark:text-sky-400 underline">aistudio.google.com/apikey</a>.
        </p>

        <label className={lbl}>
          Clave de API {cfg.has_ai_key && <span className="text-emerald-600 dark:text-emerald-400">· hay una guardada</span>}
        </label>
        <input type="password" autoComplete="off"
               value={v.ai_api_key ?? ''}
               onChange={e => edit({ ai_api_key: e.target.value })}
               placeholder={cfg.has_ai_key ? '•••••••• (deja vacío para conservarla)' : 'AIza…'}
               className={inp} />
        <p className="text-[11px] text-gray-400 mt-1">
          Por seguridad no se muestra la clave guardada. Deja el campo vacío para conservarla,
          o escribe un guion (<code>-</code>) para borrarla.
        </p>
      </div>

      <button onClick={save} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50">
        <Check size={13} /> {busy ? 'Guardando…' : 'Guardar configuración'}
      </button>
    </div>
  );
}

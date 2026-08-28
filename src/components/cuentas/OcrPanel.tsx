'use client';

import React, { useState } from 'react';
import { ScanLine, Upload, Check, Trash2, AlertCircle, Sparkles } from 'lucide-react';
import { ACCOUNTS, ACCOUNT_LABELS, money, type Account, type TxType, type CtCode } from './types';

interface Candidate {
  date: string;
  description: string;
  amount: number;
  kind: TxType;
  code: string | null;
  receipt_ref: string | null;
  confidence: 'alta' | 'media' | 'baja';
  account: Account;
  chosen: boolean;
}

const CONF_STYLE: Record<string, string> = {
  alta:  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  media: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  baja:  'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
};

/**
 * Lectura de recibos con IA.
 *
 * La IA propone, la persona dispone: nada se registra sin revisión explícita.
 * Las líneas de confianza baja (cantidades manuscritas, sobre todo) se marcan
 * para que se miren dos veces.
 */
export function OcrPanel({ api, codes, onRegistered, flash, setError }: {
  api: (u: string, i?: RequestInit) => Promise<Record<string, unknown>>;
  codes: CtCode[];
  onRegistered: () => void;
  flash: (m: string) => void;
  setError: (m: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [saving, setSaving] = useState(false);

  function onFile(file: File) {
    if (file.size > 8 * 1024 * 1024) { setError('El archivo supera los 8 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => { setPreview(String(reader.result)); setFileName(file.name); setRows(null); };
    reader.onerror = () => setError('No se pudo leer el archivo');
    reader.readAsDataURL(file);
  }

  async function analyze() {
    if (!preview) return;
    setBusy(true); setNeedsKey(false); setRows(null);
    try {
      const d = await api('/api/cuentas/ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl: preview }),
      }) as { transactions: Omit<Candidate, 'account' | 'chosen'>[] };

      const cands: Candidate[] = (d.transactions || []).map(t => ({
        ...t,
        account: t.kind === 'expense' ? 'corriente' : 'caja',
        chosen: true,
      }));
      setRows(cands);
      if (cands.length === 0) flash('No se reconoció ninguna transacción en el documento');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      if (/GEMINI_API_KEY/.test(msg)) setNeedsKey(true);
      setError(msg);
    } finally { setBusy(false); }
  }

  function edit(i: number, patch: Partial<Candidate>) {
    setRows(rs => rs!.map((r, j) => j === i ? { ...r, ...patch } : r));
  }

  async function register() {
    const chosen = (rows || []).filter(r => r.chosen && r.amount > 0);
    if (!chosen.length) return;
    if (!confirm(`Se registrarán ${chosen.length} transacción(es) por ${money(chosen.reduce((s, r) => s + r.amount, 0))}.\n\n¿Continuar?`)) return;

    setSaving(true);
    try {
      for (const r of chosen) {
        await api('/api/cuentas/transactions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: r.date, type: r.kind, account: r.account, to_account: null,
            code: r.code, description: r.description, amount: r.amount,
            receipt_ref: r.receipt_ref, notes: 'Capturado con lectura de recibo (IA)',
          }),
        });
      }
      flash(`${chosen.length} transacción(es) registradas`);
      setRows(null); setPreview(null); setFileName('');
      onRegistered();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  const inp = 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs';
  const total = (rows || []).filter(r => r.chosen).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h2 className="font-semibold text-sm flex items-center gap-1.5 mb-1">
          <Sparkles size={15} className="text-violet-500" /> Subir recibo — captura automática
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Sube la foto o el PDF de un recibo. La IA extrae los datos y los propone para que los
          revises. Nada se registra hasta que lo confirmes.
        </p>

        {needsKey && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/25 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs">
            <p className="font-semibold mb-1">Falta la clave de IA en el servidor</p>
            <p>Crea una clave gratuita en <code>aistudio.google.com/apikey</code> y añádela como
            <code className="mx-1 px-1 rounded bg-amber-100 dark:bg-amber-900/50">GEMINI_API_KEY</code>
            en <code>.env.local</code> (local) o en <code>ecosystem.config.cjs</code> (VPS). Después reinicia el servidor.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-violet-400 cursor-pointer text-sm text-gray-500 dark:text-gray-400 min-h-[180px]">
            <ScanLine size={22} />
            <span className="text-center px-2">{fileName || 'Arrastra el recibo aquí o haz clic para elegirlo'}</span>
            <span className="text-[11px] text-gray-400">JPG, PNG, WEBP o PDF · hasta 8 MB</span>
            <input type="file" accept="image/*,application/pdf" className="hidden"
                   onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </label>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center bg-gray-50 dark:bg-gray-900 min-h-[180px]">
            {preview?.startsWith('data:image')
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="Recibo" className="max-h-64 object-contain" />
              : preview
                ? <p className="text-xs text-gray-500 p-4">PDF cargado: {fileName}</p>
                : <p className="text-xs text-gray-400 p-4">Vista previa del recibo</p>}
          </div>
        </div>

        <button onClick={analyze} disabled={!preview || busy}
                className="mt-3 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium disabled:opacity-40">
          <Sparkles size={14} /> {busy ? 'Leyendo el recibo…' : 'Leer con IA'}
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Transacciones propuestas</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Seleccionadas: {rows.filter(r => r.chosen).length} · {money(total)}
            </span>
          </div>

          <div className="flex items-start gap-2 p-2.5 mb-3 rounded-lg bg-sky-50 dark:bg-sky-900/25 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-300">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>Revisa cada línea antes de registrar, sobre todo las de confianza baja: la IA no
            lee bien las cantidades manuscritas.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 dark:text-gray-400">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-2 py-1.5 w-8"></th>
                  <th className="px-2 py-1.5 text-left font-normal">Fecha</th>
                  <th className="px-2 py-1.5 text-left font-normal">Descripción</th>
                  <th className="px-2 py-1.5 text-left font-normal">CT</th>
                  <th className="px-2 py-1.5 text-left font-normal">Tipo</th>
                  <th className="px-2 py-1.5 text-left font-normal">Cuenta</th>
                  <th className="px-2 py-1.5 text-right font-normal">Monto</th>
                  <th className="px-2 py-1.5 text-center font-normal">Confianza</th>
                  <th className="px-2 py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((r, i) => (
                  <tr key={i} className={r.chosen ? '' : 'opacity-40'}>
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={r.chosen}
                             onChange={e => edit(i, { chosen: e.target.checked })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="date" value={r.date} className={inp}
                             onChange={e => edit(i, { date: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={r.description} className={`${inp} w-full min-w-[180px]`}
                             onChange={e => edit(i, { description: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={r.code ?? ''} className={inp}
                              onChange={e => edit(i, { code: e.target.value || null })}>
                        <option value="">—</option>
                        {codes.map(c => <option key={c.id} value={c.code}>{c.code}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={r.kind} className={inp}
                              onChange={e => edit(i, { kind: e.target.value as TxType })}>
                        <option value="income">Entrada</option>
                        <option value="expense">Salida</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={r.account} className={inp}
                              onChange={e => edit(i, { account: e.target.value as Account })}>
                        {ACCOUNTS.map(a => <option key={a} value={a}>{ACCOUNT_LABELS[a]}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" step="0.01" min="0" value={r.amount} className={`${inp} w-24 text-right`}
                             onChange={e => edit(i, { amount: Number(e.target.value) || 0 })} />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${CONF_STYLE[r.confidence]}`}>
                        {r.confidence}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <button onClick={() => setRows(rs => rs!.filter((_, j) => j !== i))}
                              className="p-1 text-gray-400 hover:text-red-600">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={register} disabled={saving || !rows.some(r => r.chosen)}
                  className="mt-3 flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40">
            <Upload size={14} /> {saving ? 'Registrando…' : 'Registrar seleccionadas'}
          </button>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Check size={14} /> El documento se procesó pero no se reconoció ninguna transacción.
        </div>
      )}
    </div>
  );
}

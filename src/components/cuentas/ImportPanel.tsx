'use client';

import React, { useState } from 'react';
import { Upload, AlertCircle, Check, FileSpreadsheet, Download } from 'lucide-react';
import { parseCsv, autoMap, FIELD_LABELS, type Field } from '@/lib/csvImport';
import { money, monthLabel } from './types';

interface DryRun {
  willImport: number;
  issues: { line: number; message: string }[];
  newCodes: { code: string; description: string }[];
  months: string[];
  totals: { income: number; expense: number; transfer: number };
  sample: { line: number; date: string; type: string; code: string | null; description: string; amount: number }[];
}

/**
 * Importador del respaldo CSV del programa legacy.
 *
 * El CSV se analiza en el navegador para poder mostrar y corregir el mapeo de
 * columnas antes de enviar nada. La importación real siempre va precedida de
 * una pasada en seco.
 */
export function ImportPanel({ api, onImported, flash, setError }: {
  api: (u: string, i?: RequestInit) => Promise<Record<string, unknown>>;
  onImported: () => void;
  flash: (m: string) => void;
  setError: (m: string) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [data, setData] = useState<string[][] | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Field[]>([]);
  const [dry, setDry] = useState<DryRun | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result));
      if (rows.length === 0) { setError('El archivo no tiene filas legibles'); return; }
      setFileName(file.name);
      setData(rows);
      setMapping(autoMap(rows[0]));
      setDry(null);
    };
    reader.onerror = () => setError('No se pudo leer el archivo');
    reader.readAsText(file, 'utf-8');
  }

  async function runDry() {
    if (!data) return;
    setBusy(true); setDry(null);
    try {
      const d = await api('/api/cuentas/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, mapping, hasHeader, dryRun: true }),
      });
      setDry(d as unknown as DryRun);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  async function runImport() {
    if (!data || !dry) return;
    if (!confirm(
      `Se importarán ${dry.willImport} transacciones` +
      (dry.issues.length ? `, omitiendo ${dry.issues.length} con errores` : '') +
      `.\n\nMeses afectados: ${dry.months.join(', ')}\n\n¿Continuar?`
    )) return;

    setBusy(true);
    try {
      const d = await api('/api/cuentas/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, mapping, hasHeader, dryRun: false, skipInvalid: true }),
      }) as { imported: number };
      flash(`${d.imported} transacciones importadas`);
      setData(null); setDry(null); setFileName('');
      onImported();
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(false); }
  }

  const headers = data ? data[0] : [];
  const preview = data ? (hasHeader ? data.slice(1, 4) : data.slice(0, 3)) : [];
  const mappedFields = new Set<Field>(mapping.filter(m => m !== 'ignore'));
  const REQUIRED: Field[] = ['date', 'description', 'amount'];
  const missing = REQUIRED.filter(f => !mappedFields.has(f));

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="font-semibold text-sm">Importar respaldo CSV</h2>
          <a href="/api/cuentas/transactions?format=csv"
             className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shrink-0">
            <Download size={12} /> Exportar respaldo CSV
          </a>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Sube el CSV exportado del programa anterior. Se detectan las columnas automáticamente
          y puedes corregir el mapeo. Nada se guarda hasta que confirmes la verificación previa.
        </p>

        <label className="flex items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-emerald-400 cursor-pointer text-sm text-gray-500 dark:text-gray-400">
          <FileSpreadsheet size={18} />
          {fileName || 'Selecciona un archivo .csv'}
          <input type="file" accept=".csv,text/csv" className="hidden"
                 onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
      </div>

      {data && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Mapeo de columnas ({data.length} filas)</h3>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={hasHeader}
                     onChange={e => { setHasHeader(e.target.checked); setDry(null); }} />
              La primera fila son encabezados
            </label>
          </div>

          {missing.length > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/25 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs">
              <AlertCircle size={13} />
              Falta asignar: {missing.map(f => FIELD_LABELS[f]).join(', ')}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400">
                  {headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-normal align-top min-w-[130px]">
                      <span className="block truncate mb-1" title={h}>
                        {hasHeader ? h : `Columna ${i + 1}`}
                      </span>
                      <select
                        value={mapping[i] ?? 'ignore'}
                        onChange={e => {
                          const m = [...mapping]; m[i] = e.target.value as Field;
                          setMapping(m); setDry(null);
                        }}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 text-xs">
                        {(Object.keys(FIELD_LABELS) as Field[]).map(f => (
                          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                {preview.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                    {headers.map((_, j) => (
                      <td key={j} className="px-2 py-1 truncate max-w-[160px]">{r[j]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={runDry} disabled={busy || missing.length > 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-medium disabled:opacity-40">
            <Check size={13} /> {busy ? 'Verificando…' : 'Verificar sin guardar'}
          </button>
        </div>
      )}

      {dry && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
          <h3 className="font-semibold text-sm">Resultado de la verificación</h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/25">
              <p className="text-xs text-gray-500 dark:text-gray-400">Se importarán</p>
              <p className="font-bold">{dry.willImport}</p>
            </div>
            <div className={`p-2.5 rounded-lg ${dry.issues.length ? 'bg-amber-50 dark:bg-amber-900/25' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
              <p className="text-xs text-gray-500 dark:text-gray-400">Con errores</p>
              <p className="font-bold">{dry.issues.length}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Ingresos</p>
              <p className="font-bold">{money(dry.totals.income)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <p className="text-xs text-gray-500 dark:text-gray-400">Egresos</p>
              <p className="font-bold">{money(dry.totals.expense)}</p>
            </div>
          </div>

          {dry.months.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              <strong>Meses:</strong> {dry.months.map(monthLabel).join(' · ')}
            </p>
          )}

          {dry.newCodes.length > 0 && (
            <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-900/25 border border-sky-200 dark:border-sky-800 text-xs">
              <strong>Códigos nuevos que se crearán:</strong>{' '}
              {dry.newCodes.map(c => c.code).join(', ')}
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                Se conservará la descripción que traiga el CSV; puedes editarla luego en Códigos CT.
              </p>
            </div>
          )}

          {dry.issues.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-xs mb-1.5">
                <input type="checkbox" checked={skipInvalid} onChange={e => setSkipInvalid(e.target.checked)} />
                Omitir las {dry.issues.length} filas con errores e importar el resto
              </label>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {dry.issues.slice(0, 50).map(is => (
                  <p key={is.line} className="px-2.5 py-1 text-xs">
                    <span className="text-gray-400">Línea {is.line}:</span> {is.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <button onClick={runImport}
                  disabled={busy || dry.willImport === 0 || (dry.issues.length > 0 && !skipInvalid)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-40">
            <Upload size={14} /> {busy ? 'Importando…' : `Importar ${dry.willImport} transacciones`}
          </button>
        </div>
      )}
    </div>
  );
}

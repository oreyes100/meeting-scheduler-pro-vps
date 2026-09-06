'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { IconSidebar } from '@/components/IconSidebar';
import { SyncStatus } from '@/components/SyncStatus';
import { useMe } from '@/lib/useMe';
import { ExportMenu } from '@/components/ExportMenu';
import { diagnosticLogger } from '@/utils/diagnosticLogger';
import type { PrintTableOptions } from '@/lib/printReport';

interface Report {
  id?: string;
  user_id: string;
  month: string;
  participated: boolean;
  is_auxiliary_pioneer: boolean;
  hours: number | null;
  bible_studies: number | null;
  notes: string | null;
}

function firstOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return firstOfMonth(d);
}

function personName(p: any): string {
  if (!p) return '';
  return p.display_name || p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
}

function roleLabel(p: any): string {
  const parts: string[] = [];
  if (p?.is_elder) parts.push('A');
  else if (p?.is_ministerial_servant) parts.push('SM');
  if (p?.is_regular_pioneer) parts.push('PR');
  else if (p?.is_special_pioneer) parts.push('PE');
  else if (p?.is_unbaptized_publisher) parts.push('PNB');
  return parts.length ? `(${parts.join(', ')})` : '';
}

function isPioneerFlag(p: any): boolean {
  return !!(p?.is_regular_pioneer || p?.is_special_pioneer);
}

const emptyReport = (userId: string, month: string): Report => ({
  user_id: userId, month, participated: false, is_auxiliary_pioneer: false,
  hours: null, bible_studies: null, notes: null,
});

export default function GroupReportsPage() {
  const { mode } = useTheme();
  const { me } = useMe();
  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!me?.user_id) { setLoading(false); return; }
    setLoading(true);
diagnosticLogger('fetchData start', { month, userId: me?.user_id });
    try {
      const [gRes, uRes, rRes] = await Promise.all([
        fetch('/api/field-service-groups'),
        fetch('/api/users'),
        fetch(`/api/field-service-reports?month=${month}`),
      ]);
      const gData = await gRes.json();
      const uData = await uRes.json();
      const rData = await rRes.json();

      const myGroup = (gData.groups || []).find((g: any) =>
        (g.members || []).some((m: any) => m.user_id === me.user_id)
      );
      const allUsers = uData.users || [];

      if (myGroup) {
        setGroupName(myGroup.name);
        const ids = new Set((myGroup.members || []).map((m: any) => m.user_id));
        setMembers(allUsers.filter((u: any) => ids.has(u.id)));
      } else {
        setGroupName('');
        setMembers([]);
      }

      const map: Record<string, Report> = {};
      for (const r of rData.reports || []) map[r.user_id] = r;
      setReports(map);
      diagnosticLogger('fetchData success', { reportCount: Object.keys(map).length });
    } catch (err) {
      console.error('[GroupReports] fetchData failed:', err);
      diagnosticLogger('fetchData error', { error: String(err) });
    }
    setLoading(false);
  }, [me?.user_id, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveReport = async (r: Report) => {
    setSaving(r.user_id);
    setReports(prev => ({ ...prev, [r.user_id]: r }));
    diagnosticLogger('saveReport start', { report: r });
    try {
      const res = await fetch('/api/field-service-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r),
      });
      if (res.ok) {
        const j = await res.json();
        diagnosticLogger('saveReport success', { report: j.report });
        setReports(prev => ({ ...prev, [r.user_id]: j.report }));
      } else {
        const errText = await res.text();
        console.error('[GroupReports] Save report failed:', res.status, errText);
        diagnosticLogger('saveReport server error', { status: res.status, body: errText });
      }
    } catch (err) {
      console.error('[GroupReports] Save report network catch:', err);
      diagnosticLogger('saveReport network catch', { error: String(err) });
    }
    setSaving(null);
  };

  const updateField = (userId: string, patch: Partial<Report>) => {
    const current = reports[userId] || emptyReport(userId, month);
    const next = { ...current, month, ...patch };
    if ((patch.hours != null && patch.hours > 0) || (patch.bible_studies != null && patch.bible_studies > 0)) {
      next.participated = true;
    }
    saveReport(next);
  };

  const pending = useMemo(() => members.filter(p => !reports[p.id]?.participated).length, [members, reports]);

  // Datos del grupo para imprimir/exportar
  const getGroupData = (): PrintTableOptions => ({
    title: 'Informes de mi Grupo',
    congName: groupName || 'Congregación',
    subtitle: monthLabel(month),
    columns: ['Publicador', 'Categoría', 'Informó', 'Prec. aux.', 'Horas', 'Estudios', 'Notas'],
    rows: members.map(p => {
      const r = reports[p.id];
      return [
        `${personName(p)} ${roleLabel(p)}`.trim(),
        isPioneerFlag(p) ? 'Prec. regular' : r?.is_auxiliary_pioneer ? 'Prec. auxiliar' : 'Publicador',
        r?.participated ? 'Sí' : '—',
        r?.is_auxiliary_pioneer ? 'Sí' : '',
        r?.hours != null ? String(r.hours) : '',
        r?.bible_studies != null ? String(r.bible_studies) : '',
        r?.notes || '',
      ];
    }),
  });

  const isDark = mode === 'dark';
  const bgMain = isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const bgCard = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const inputCls = `border rounded px-1.5 py-0.5 text-sm w-full ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'}`;
  const thCls = `border p-2 text-xs font-bold text-left ${bgCard}`;

  return (
    <div className={`flex h-screen ${bgMain} font-sans`}>
      <IconSidebar />
      <SyncStatus />

      <div className="flex-1 flex flex-col overflow-hidden pb-[52px] md:pb-0">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white px-4 py-2 shrink-0 flex items-center justify-between">
          <h1 className="font-bold text-lg">Informes de mi Grupo{groupName ? ` — ${groupName}` : ''}</h1>
          {groupName && <ExportMenu getData={getGroupData} />}
        </div>

        <div className="flex items-center justify-center gap-4 py-3 shrink-0">
          <button onClick={() => setMonth(addMonths(month, -1))} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
            <ChevronLeft size={24} className="text-blue-600" />
          </button>
          <h2 className="text-lg font-bold text-red-600">{monthLabel(month)}</h2>
          <button onClick={() => setMonth(addMonths(month, 1))} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
            <ChevronRight size={24} className="text-blue-600" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {loading ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-8">Cargando…</p>
          ) : !groupName ? (
            <div className={`max-w-md mx-auto mt-10 p-5 rounded-xl border text-center ${bgCard}`}>
              <p className="text-sm">No perteneces a ningún grupo de predicación.</p>
              <p className="text-xs text-gray-400 mt-2">Pide a un administrador que te asigne un grupo en Publicadores.</p>
            </div>
          ) : (
            <>
              {pending > 0 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-2 font-medium">
                  {pending} publicador{pending === 1 ? '' : 'es'} sin informar este mes.
                </p>
              )}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={thCls}>Publicador</th>
                    <th className={`${thCls} text-center w-20`}>Informó</th>
                    <th className={`${thCls} text-center w-20`} title="Precursor auxiliar este mes">Prec. aux.</th>
                    <th className={`${thCls} w-24`}>Horas</th>
                    <th className={`${thCls} w-24`}>Estudios</th>
                    <th className={thCls}>Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(p => {
                    const r = reports[p.id] || emptyReport(p.id, month);
                    const showHours = isPioneerFlag(p) || r.is_auxiliary_pioneer;
                    return (
                      <tr key={p.id} className={`border-b ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-purple-50'} ${!r.participated ? (isDark ? 'bg-amber-900/10' : 'bg-amber-50/50') : ''}`}>
                        <td className="p-1.5">
                          {personName(p)} <span className="text-gray-400 text-xs">{roleLabel(p)}</span>
                          {saving === p.id && <Check size={12} className="inline ml-1 text-green-500" />}
                        </td>
                        <td className="p-1.5 text-center">
                          <input type="checkbox" checked={r.participated}
                            onChange={e => updateField(p.id, { participated: e.target.checked })} />
                        </td>
                        <td className="p-1.5 text-center">
                          {!isPioneerFlag(p) && (
                            <input type="checkbox" checked={r.is_auxiliary_pioneer}
                              onChange={e => updateField(p.id, { is_auxiliary_pioneer: e.target.checked })} />
                          )}
                        </td>
                        <td className="p-1.5">
                          {showHours && (
                            <input type="number" min={0} step={0.5} className={inputCls}
                              value={r.hours ?? ''}
                              onChange={e => updateField(p.id, { hours: e.target.value === '' ? null : parseFloat(e.target.value) })} />
                          )}
                        </td>
                        <td className="p-1.5">
                          <input type="number" min={0} className={inputCls}
                            value={r.bible_studies ?? ''}
                            onChange={e => updateField(p.id, { bible_studies: e.target.value === '' ? null : parseInt(e.target.value) })} />
                        </td>
                        <td className="p-1.5">
                          <input className={inputCls} value={r.notes ?? ''}
                            onChange={e => setReports(prev => ({ ...prev, [p.id]: { ...(prev[p.id] || emptyReport(p.id, month)), month, notes: e.target.value } }))}
                            onBlur={e => updateField(p.id, { notes: e.target.value || null })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

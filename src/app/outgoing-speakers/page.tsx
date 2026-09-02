'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Trash2, Save, X, Printer, Phone, MapPin, ChevronRight,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { IconSidebar } from '@/components/IconSidebar';
import { SyncStatus } from '@/components/SyncStatus';

const WEEK_COUNT = 52;

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(m.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fecha del domingo de la semana formateada en español. */
function fmtSunday(mondayISO: string): string {
  const d = new Date(mondayISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function buildWeeks(): string[] {
  const monday = getMonday(new Date());
  monday.setDate(monday.getDate() - 4 * 7); // 4 semanas atrás
  const weeks: string[] = [];
  for (let i = 0; i < WEEK_COUNT; i++) {
    weeks.push(fmtISO(monday));
    monday.setDate(monday.getDate() + 7);
  }
  return weeks;
}

function personName(p: any): string {
  if (!p) return '';
  return p.display_name || p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
}

type EditTalk = {
  id?: string;
  week_date: string;
  user_id: string;
  congregation_name: string;
  talk_number: string;
  talk_title: string;
  contact_info: string;
  kingdom_hall_address: string;
  notes: string;
};

const EMPTY_TALK: EditTalk = {
  week_date: '', user_id: '', congregation_name: '',
  talk_number: '', talk_title: '', contact_info: '',
  kingdom_hall_address: '', notes: '',
};

export default function OutgoingSpeakersPage() {
  const { mode } = useTheme();
  const isDark = mode === 'dark';

  const [talks, setTalks] = useState<any[]>([]);
  const [speakers, setSpeakers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTalk, setEditTalk] = useState<EditTalk | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');

  const todayMonday = fmtISO(getMonday(new Date()));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [oRes, uRes] = await Promise.all([
        fetch('/api/outgoing-talks'),
        fetch('/api/users'),
      ]);
      const oData = await oRes.json();
      const uData = await uRes.json();
      setTalks(oData.talks || []);
      const allUsers = uData.users || [];
      setSpeakers(allUsers.filter((u: any) => u.can_be_speaker));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => setEditTalk({ ...EMPTY_TALK, week_date: todayMonday });
  const openEdit = (t: any) => setEditTalk({
    id: t.id,
    week_date: t.week_date || '',
    user_id: t.user_id || '',
    congregation_name: t.congregation_name || '',
    talk_number: t.talk_number != null ? String(t.talk_number) : '',
    talk_title: t.talk_title || '',
    contact_info: t.contact_info || '',
    kingdom_hall_address: t.kingdom_hall_address || '',
    notes: t.notes || '',
  });

  const save = async () => {
    if (!editTalk) return;
    setSaving(true);
    try {
      const payload = {
        ...editTalk,
        talk_number: editTalk.talk_number ? parseInt(editTalk.talk_number) : null,
      };
      if (editTalk.id) {
        await fetch(`/api/outgoing-talks/${editTalk.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const res = await fetch('/api/outgoing-talks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Error al guardar');
      }
      await fetchData();
      setEditTalk(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar');
    }
    setSaving(false);
  };

  const deleteTalk = async (id: string) => {
    if (!confirm('¿Eliminar este registro?')) return;
    await fetch(`/api/outgoing-talks/${id}`, { method: 'DELETE' });
    setTalks(prev => prev.filter(t => t.id !== id));
    setEditTalk(null);
  };

  const printReport = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Discursantes Salientes</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
        h1{font-size:16px;color:#3730a3;border-bottom:2px solid #3730a3;padding-bottom:6px}
        p.sub{font-size:11px;color:#666;margin:2px 0 12px}
        table{width:100%;border-collapse:collapse}
        th{background:#3730a3;color:white;padding:7px 8px;text-align:left;font-size:11px}
        td{border:1px solid #ddd;padding:5px 8px;vertical-align:top;font-size:11px}
        tr:nth-child(even){background:#f5f5ff}
        @media print{body{margin:8px}}
      </style></head><body>
      <h1>Programa de Discursantes Salientes — Fin de Semana</h1>
      <p class="sub">Generado el ${new Date().toLocaleDateString('es-MX', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
      <table>
        <thead><tr>
          <th>Fin de semana</th><th>Orador</th><th>Congregación</th>
          <th>N°</th><th>Título del discurso</th><th>Contacto</th><th>Dirección del Salón</th><th>Notas</th>
        </tr></thead>
        <tbody>
          ${filteredTalks.map(t => `<tr>
            <td>${fmtSunday(t.week_date)}</td>
            <td>${personName(t.user)}</td>
            <td>${t.congregation_name || ''}</td>
            <td style="text-align:center;font-weight:bold">${t.talk_number || ''}</td>
            <td>${t.talk_title || ''}</td>
            <td>${(t.contact_info || '').replace(/\n/g, '<br>')}</td>
            <td>${(t.kingdom_hall_address || '').replace(/\n/g, '<br>')}</td>
            <td>${t.notes || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table></body></html>
    `);
    win.document.close();
    win.print();
  };

  // ── Estilos ──
  const bg = isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const bgCard = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const thCls = `border p-2 text-left text-xs font-bold sticky top-0 z-10 ${isDark ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-indigo-50 text-indigo-800 border-indigo-100'}`;
  const tdCls = `border p-2 text-xs ${isDark ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'}`;
  const trHover = isDark ? 'hover:bg-gray-700/60 cursor-pointer transition-colors' : 'hover:bg-indigo-50/60 cursor-pointer transition-colors';
  const inputCls = `w-full border rounded-lg px-3 py-1.5 text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'}`;
  const labelCls = 'block text-xs font-semibold mt-3 mb-1 text-gray-500 dark:text-gray-400 uppercase tracking-wide';
  const sectionCls = `mt-4 pt-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`;

  const filteredTalks = talks.filter(t => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      (t.congregation_name || '').toLowerCase().includes(q) ||
      personName(t.user).toLowerCase().includes(q) ||
      (t.talk_title || '').toLowerCase().includes(q)
    );
  });

  // Agrupar por semana
  const byWeek: Record<string, any[]> = {};
  for (const t of filteredTalks) {
    (byWeek[t.week_date] ||= []).push(t);
  }
  const sortedWeeks = Object.keys(byWeek).sort();

  return (
    <div className={`flex h-screen ${bg} font-sans`}>
      <IconSidebar />
      <SyncStatus />

      <div className="flex-1 flex flex-col overflow-hidden pb-[52px] md:pb-0">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-indigo-700 to-indigo-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-bold text-lg leading-tight">Discursantes Salientes</h1>
            <p className="text-indigo-200 text-xs mt-0.5">Oradores que visitan otras congregaciones los fines de semana</p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={printReport} title="Imprimir reporte"
              className="p-2 hover:bg-white/10 rounded-lg transition-colors">
              <Printer size={18} />
            </button>
            <button onClick={openNew}
              className="bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors border border-white/20">
              <Plus size={15} /> Agregar
            </button>
          </div>
        </div>

        {/* ── Search bar ── */}
        <div className={`px-4 py-2 border-b shrink-0 ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <input
            placeholder="Buscar por congregación, orador o título del discurso…"
            value={filter} onChange={e => setFilter(e.target.value)}
            className={`w-full max-w-md text-sm border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500' : 'bg-gray-50 border-gray-200 text-gray-900'}`}
          />
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Table */}
          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="text-center py-20 text-gray-400">Cargando…</div>
            ) : filteredTalks.length === 0 ? (
              <div className={`text-center py-24 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                <div className="text-6xl mb-4">🎤</div>
                <p className="text-lg font-semibold mb-1">Sin registros</p>
                <p className="text-sm">Usa el botón <strong>Agregar</strong> para registrar un discursante saliente.</p>
              </div>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={thCls}>Fin de semana</th>
                    <th className={thCls}>Orador</th>
                    <th className={thCls}>Congregación que visita</th>
                    <th className={`${thCls} w-12 text-center`}>N°</th>
                    <th className={thCls}>Título del discurso</th>
                    <th className={thCls}>Contacto</th>
                    <th className={thCls}>Dirección del Salón del Reino</th>
                    <th className={`${thCls} w-6`}></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWeeks.map(week => (
                    <React.Fragment key={week}>
                      <tr>
                        <td colSpan={8}
                          className={`px-3 py-1.5 text-[11px] font-bold tracking-wider ${isDark ? 'bg-indigo-900/30 text-indigo-300 border-indigo-800' : 'bg-indigo-50 text-indigo-700 border-indigo-100'} border-b`}>
                          📅 {fmtSunday(week).replace('domingo, ', 'Domingo ')}
                          {week === todayMonday && (
                            <span className="ml-2 text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-normal">Esta semana</span>
                          )}
                        </td>
                      </tr>
                      {byWeek[week].map(t => (
                        <tr key={t.id} className={trHover} onClick={() => openEdit(t)}>
                          <td className={tdCls}>
                            <span className="text-[11px] text-gray-500 capitalize">{fmtSunday(t.week_date)}</span>
                          </td>
                          <td className={`${tdCls} font-semibold`}>{personName(t.user) || <em className="text-gray-400 font-normal">Sin asignar</em>}</td>
                          <td className={tdCls}>{t.congregation_name || <em className="text-gray-400">—</em>}</td>
                          <td className={`${tdCls} text-center font-mono font-bold text-indigo-600 dark:text-indigo-400`}>{t.talk_number || '—'}</td>
                          <td className={tdCls}>{t.talk_title || <em className="text-gray-400">—</em>}</td>
                          <td className={tdCls}>
                            {t.contact_info
                              ? <span className="flex items-start gap-1 whitespace-pre-wrap"><Phone size={10} className="shrink-0 mt-0.5 text-indigo-400" />{t.contact_info}</span>
                              : <em className="text-gray-400">—</em>}
                          </td>
                          <td className={tdCls}>
                            {t.kingdom_hall_address
                              ? <span className="flex items-start gap-1 whitespace-pre-wrap"><MapPin size={10} className="shrink-0 mt-0.5 text-indigo-400" />{t.kingdom_hall_address}</span>
                              : <em className="text-gray-400">—</em>}
                          </td>
                          <td className={`${tdCls} text-center`}>
                            <ChevronRight size={13} className="text-gray-400 inline" />
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Side panel form ── */}
          {editTalk && (
            <div className={`w-full md:w-[340px] shrink-0 border-l overflow-y-auto ${bgCard}`}>
              {/* Header */}
              <div className={`sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div>
                  <h3 className="font-bold text-sm text-indigo-700 dark:text-indigo-300">
                    {editTalk.id ? 'Editar registro' : 'Nuevo registro'}
                  </h3>
                  <p className="text-xs text-gray-400">Discursante saliente</p>
                </div>
                <button onClick={() => setEditTalk(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={16} />
                </button>
              </div>

              <div className="p-4">
                {/* Orador y fecha */}
                <label className={labelCls}>Fin de semana (domingo)</label>
                <input type="date" className={inputCls} value={editTalk.week_date}
                  onChange={e => setEditTalk({ ...editTalk, week_date: e.target.value })} />

                <label className={labelCls}>Orador</label>
                <select className={inputCls} value={editTalk.user_id}
                  onChange={e => setEditTalk({ ...editTalk, user_id: e.target.value })}>
                  <option value="">— Seleccionar orador —</option>
                  {speakers.map(s => (
                    <option key={s.id} value={s.id}>{personName(s)}</option>
                  ))}
                </select>

                {/* Sección: Congregación */}
                <div className={sectionCls}>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    🏛️ Congregación visitada
                  </span>
                </div>

                <label className={labelCls}>Nombre de la congregación</label>
                <input className={inputCls} placeholder="Ej. Congregación Norte"
                  value={editTalk.congregation_name}
                  onChange={e => setEditTalk({ ...editTalk, congregation_name: e.target.value })} />

                <label className={labelCls}>Contacto (nombre / teléfono)</label>
                <textarea className={`${inputCls} resize-none`} rows={2}
                  placeholder={'Ej. Hno. García\n+52 664 123 4567'}
                  value={editTalk.contact_info}
                  onChange={e => setEditTalk({ ...editTalk, contact_info: e.target.value })} />

                <label className={labelCls}>Dirección del Salón del Reino</label>
                <textarea className={`${inputCls} resize-none`} rows={2}
                  placeholder="Calle, número, colonia, ciudad"
                  value={editTalk.kingdom_hall_address}
                  onChange={e => setEditTalk({ ...editTalk, kingdom_hall_address: e.target.value })} />

                {/* Sección: Discurso */}
                <div className={sectionCls}>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    📖 Discurso público
                  </span>
                </div>

                <div className="flex gap-2">
                  <div className="w-24 shrink-0">
                    <label className={labelCls}>Número</label>
                    <input type="number" min={1} max={250} className={inputCls}
                      placeholder="N°"
                      value={editTalk.talk_number}
                      onChange={e => setEditTalk({ ...editTalk, talk_number: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls}>Título del discurso</label>
                    <input className={inputCls} placeholder="Título…"
                      value={editTalk.talk_title}
                      onChange={e => setEditTalk({ ...editTalk, talk_title: e.target.value })} />
                  </div>
                </div>

                <label className={labelCls}>Notas</label>
                <textarea className={`${inputCls} resize-none`} rows={2}
                  placeholder="Observaciones adicionales…"
                  value={editTalk.notes}
                  onChange={e => setEditTalk({ ...editTalk, notes: e.target.value })} />

                {/* Botones de acción */}
                <div className="flex gap-2 mt-5">
                  <button onClick={save} disabled={saving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm">
                    <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                  {editTalk.id && (
                    <button onClick={() => deleteTalk(editTalk.id!)}
                      className="bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 text-sm py-2.5 px-3.5 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

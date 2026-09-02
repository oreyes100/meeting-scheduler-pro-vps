'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Check, X, ChevronLeft, Users, ToggleLeft, ToggleRight, Trash2, UserPlus, Copy, Eye, EyeOff, Cpu, HardDrive, RefreshCw, GitBranch } from 'lucide-react';
import { useMe } from '@/lib/useMe';
import { MODULES } from '@/lib/modules';

// ── Types ────────────────────────────────────────────────────────────────────
interface SystemStats {
  ts: number;
  mem: { totalKb: number; availableKb: number; usedPct: number };
  disk: { totalKb: number; usedKb: number; usedPct: number };
  load: number[];
  dbBytes: number;
  lastBackup: string | null;
  uptimeSec: number;
}
interface ReplicationInfo {
  localSha: string;
  remoteSha: string | null;
  inSync: boolean | null;
}

// ── ResourceMeter ─────────────────────────────────────────────────────────────
function Bar({ pct, label }: { pct: number; label: string }) {
  const color = pct >= 85 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span><span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function fmtBytes(b: number) {
  if (b === 0) return '—';
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function fmtUptime(s: number) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function ResourceMeter() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [err, setErr] = useState(false);

  const poll = useCallback(async () => {
    if (document.hidden) return;
    try {
      const r = await fetch('/api/super-admin/system');
      if (r.ok) {
        const data = await r.json();
        if (data && data.mem && data.disk && Array.isArray(data.load)) {
          setStats(data);
          setErr(false);
        } else {
          setErr(true);
        }
      } else { setErr(true); }
    } catch { setErr(true); }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 5000);
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [poll]);

  if (err || !stats || !stats.mem || !stats.disk || !Array.isArray(stats.load)) {
    return <p className="text-xs text-red-400">Error al cargar métricas del sistema.</p>;
  }

  const load1 = stats.load[0] ?? 0;
  const loadColor = load1 > 2 ? 'text-red-400' : load1 > 1 ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="space-y-3">
      <Bar pct={stats.mem.usedPct ?? 0} label="RAM" />
      <Bar pct={stats.disk.usedPct ?? 0} label="Disco /" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-2.5 rounded-lg bg-gray-800">
          <p className="text-gray-400 mb-0.5">Load avg</p>
          <p className={`font-mono font-semibold ${loadColor}`}>{load1.toFixed(2)}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-gray-800">
          <p className="text-gray-400 mb-0.5">DB</p>
          <p className="font-mono font-semibold text-gray-200">{fmtBytes(stats.dbBytes ?? 0)}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-gray-800">
          <p className="text-gray-400 mb-0.5">Uptime</p>
          <p className="font-mono font-semibold text-gray-200">{fmtUptime(stats.uptimeSec ?? 0)}</p>
        </div>
        <div className="p-2.5 rounded-lg bg-gray-800">
          <p className="text-gray-400 mb-0.5">Último backup</p>
          <p className="font-mono text-[10px] text-gray-300 truncate">{stats.lastBackup ? stats.lastBackup.split('/').pop() : '—'}</p>
        </div>
      </div>
    </div>
  );
}

// ── ReplicationBadge ──────────────────────────────────────────────────────────
function ReplicationBadge() {
  const [info, setInfo] = useState<ReplicationInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const check = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch('/api/super-admin/replication');
      if (r.ok) setInfo(await r.json());
      else setErr((await r.json()).error || 'Error');
    } catch { setErr('Sin conexión'); }
    setLoading(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button onClick={check} disabled={loading}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 disabled:opacity-50">
        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        Verificar
      </button>
      {info && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono text-gray-400">local: {info.localSha ? info.localSha.slice(0, 7) : '—'}</span>
          {info.remoteSha
            ? <span className="font-mono text-gray-400">remoto: {info.remoteSha.slice(0, 7)}</span>
            : <span className="text-gray-500">remoto: —</span>}
          {info.inSync === true && <span className="px-2 py-0.5 rounded-full bg-green-900/60 text-green-300 border border-green-700">✓ Sincronizado</span>}
          {info.inSync === false && <span className="px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700">⚠ Desactualizado</span>}
          {info.inSync === null && <span className="px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Sin acceso remoto</span>}
        </div>
      )}
      {err && <span className="text-xs text-red-400">{err}</span>}
      <button disabled title="Requiere deploy key — pendiente"
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700">
        Actualizar desde GitHub
      </button>
    </div>
  );
}

interface Congregation {
  id: string;
  name: string;
  city: string | null;
  enabled: boolean;
  enabled_modules: string[];
  user_count?: number;
  created_at: string;
}

interface ProvisionResult {
  congregation: { id: string; name: string; city: string | null };
  user: { id: string; name: string; email: string; username: string | null };
  credentials: { login_identifier: string; password: string; login_url: string };
}

const ALL_MODULE_KEYS = MODULES.filter(m => !m.superAdminOnly).map(m => m.key);

export default function SuperAdminPage() {
  const router = useRouter();
  const { me, loading } = useMe();
  const [congres, setCongres] = useState<Congregation[]>([]);
  const [fetching, setFetching] = useState(true);
  const [editing, setEditing] = useState<Congregation | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Provisioning state
  const [showProvision, setShowProvision] = useState(false);
  const [prov, setProv] = useState({ congregation_name: '', congregation_city: '', admin_first_name: '', admin_last_name: '', admin_email: '', admin_password: '', admin_username: '' });
  const [showPw, setShowPw] = useState(false);
  const [provResult, setProvResult] = useState<ProvisionResult | null>(null);
  const [provSaving, setProvSaving] = useState(false);
  const [provError, setProvError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && me && !me.is_super_admin) router.push('/');
  }, [loading, me, router]);

  const load = async () => {
    setFetching(true);
    try {
      const res = await fetch('/api/super-admin/congregations');
      const d = await res.json();
      setCongres(d.congregations || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando congregaciones');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/super-admin/congregations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing.id, name: editing.name, city: editing.city, enabled: editing.enabled, enabled_modules: editing.enabled_modules }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await load(); setEditing(null);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error guardando'); }
    setSaving(false);
  };

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/super-admin/congregations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim(), city: newCity.trim() || null, enabled_modules: ALL_MODULE_KEYS }) });
      if (!res.ok) throw new Error((await res.json()).error);
      setCreating(false); setNewName(''); setNewCity(''); await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error creando'); }
    setSaving(false);
  };

  const deleteCongre = async (id: string) => {
    if (!confirm('¿Eliminar congregación? Solo es posible si no tiene usuarios asignados.')) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/super-admin/congregations?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error eliminando'); }
    setSaving(false);
  };

  const toggleModule = (mod: string) => {
    if (!editing) return;
    const has = editing.enabled_modules.includes(mod);
    setEditing({ ...editing, enabled_modules: has ? editing.enabled_modules.filter(k => k !== mod) : [...editing.enabled_modules, mod] });
  };

  const provision = async () => {
    if (!prov.congregation_name.trim() || !prov.admin_first_name.trim() || !prov.admin_email.trim() || prov.admin_password.length < 8) return;
    setProvSaving(true); setProvError(null); setProvResult(null);
    try {
      const res = await fetch('/api/super-admin/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...prov, enabled_modules: ALL_MODULE_KEYS }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setProvResult(d);
      await load();
    } catch (e: unknown) { setProvError(e instanceof Error ? e.message : 'Error'); }
    setProvSaving(false);
  };

  const copyCredentials = () => {
    if (!provResult) return;
    const { credentials: c, congregation: cg, user: u } = provResult;
    const text = `Congregación: ${cg.name}${cg.city ? ` (${cg.city})` : ''}\nUsuario: ${u.name}\nCorreo/usuario: ${c.login_identifier}\nContraseña: ${c.password}\nURL: ${c.login_url}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || fetching) return <div className="flex items-center justify-center h-screen text-gray-400">Cargando…</div>;
  if (!me?.is_super_admin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-gray-300 p-4">
        <p className="text-lg font-semibold mb-2 text-red-400">Acceso restringido</p>
        <p className="text-sm text-gray-400 mb-4 text-center max-w-md">Esta sección requiere permisos de Super Administrador.</p>
        <button onClick={() => router.push('/')} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm">
          Volver al Inicio
        </button>
      </div>
    );
  }

  const iCls = 'flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-medium';
  const inputCls = 'w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 text-gray-100';
  const labelCls = 'block text-xs text-gray-400 mb-1 mt-2';

  return (
    <div className="h-screen overflow-y-auto bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-b from-violet-700 to-violet-600 text-white px-4 pt-8 pb-6">
        <button onClick={() => router.push('/')} className="flex items-center gap-1 text-white/70 hover:text-white mb-4 text-sm">
          <ChevronLeft size={16} /> Inicio
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-white/20"><Building2 size={24} /></div>
          <div>
            <h1 className="text-xl font-bold">Super Administrador</h1>
            <p className="text-white/75 text-sm">Gestión de congregaciones</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 pb-20 space-y-6">
        {/* ── MÉTRICAS DEL SISTEMA ── */}
        <section className="p-4 rounded-xl border border-gray-700 bg-gray-800/50">
          <h2 className="font-bold text-base flex items-center gap-2 mb-4">
            <Cpu size={16} className="text-violet-400" /> Recursos del sistema
          </h2>
          <ResourceMeter />
        </section>

        {/* ── REPLICACIÓN GITHUB ── */}
        <section className="p-4 rounded-xl border border-gray-700 bg-gray-800/50">
          <h2 className="font-bold text-base flex items-center gap-2 mb-3">
            <GitBranch size={16} className="text-violet-400" /> Replicación GitHub
            <span className="ml-1 text-xs font-normal text-gray-500">(oreyes100/micogre)</span>
          </h2>
          <ReplicationBadge />
        </section>

        {error && (
          <div className="p-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm flex items-center gap-2">
            <X size={14} /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
          </div>
        )}

        {/* ── PROVISIONAR ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base flex items-center gap-2"><UserPlus size={16} className="text-violet-400" /> Provisionar nueva congregación</h2>
            <button onClick={() => { setShowProvision(!showProvision); setProvResult(null); setProvError(null); }} className={`${iCls} ${showProvision ? 'bg-gray-700 text-gray-300' : 'bg-violet-600 hover:bg-violet-700 text-white'}`}>
              {showProvision ? <><X size={12} /> Cerrar</> : <><Plus size={12} /> Nuevo</>}
            </button>
          </div>

          {showProvision && !provResult && (
            <div className="p-4 rounded-xl border border-violet-600 bg-violet-900/10 space-y-1">
              <p className="text-xs text-violet-300 mb-2">Crea la congregación y su usuario administrador inicial en un solo paso.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                <div>
                  <label className={labelCls}>Nombre congregación *</label>
                  <input value={prov.congregation_name} onChange={e => setProv({ ...prov, congregation_name: e.target.value })} placeholder="La Estación" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Ciudad</label>
                  <input value={prov.congregation_city} onChange={e => setProv({ ...prov, congregation_city: e.target.value })} placeholder="Pátzcuaro" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Nombre administrador *</label>
                  <input value={prov.admin_first_name} onChange={e => setProv({ ...prov, admin_first_name: e.target.value })} placeholder="Jorge" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Apellido</label>
                  <input value={prov.admin_last_name} onChange={e => setProv({ ...prov, admin_last_name: e.target.value })} placeholder="Reyes" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Correo de acceso *</label>
                  <input type="email" value={prov.admin_email} onChange={e => setProv({ ...prov, admin_email: e.target.value })} placeholder="admin@correo.com" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Nombre de usuario (opcional)</label>
                  <input value={prov.admin_username} onChange={e => setProv({ ...prov, admin_username: e.target.value })} placeholder="jreyes" className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Contraseña inicial * (mín. 8 caracteres)</label>
                  <div className="relative">
                    <input type={showPw ? 'text' : 'password'} value={prov.admin_password} onChange={e => setProv({ ...prov, admin_password: e.target.value })} placeholder="••••••••" className={`${inputCls} pr-9`} />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {provError && <p className="text-red-400 text-xs mt-2">{provError}</p>}

              <div className="flex gap-2 mt-3">
                <button onClick={provision} disabled={provSaving || !prov.congregation_name.trim() || !prov.admin_first_name.trim() || !prov.admin_email.trim() || prov.admin_password.length < 8}
                  className={`${iCls} bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50`}>
                  <Check size={13} /> {provSaving ? 'Creando…' : 'Crear congregación y usuario'}
                </button>
                <button onClick={() => setShowProvision(false)} className={`${iCls} bg-gray-700 hover:bg-gray-600 text-gray-300`}>
                  <X size={13} /> Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Result card */}
          {provResult && (
            <div className="p-4 rounded-xl border border-green-600 bg-green-900/20">
              <div className="flex items-center gap-2 mb-3">
                <Check size={16} className="text-green-400" />
                <span className="font-semibold text-green-300">Congregación creada exitosamente</span>
                <button onClick={copyCredentials} className={`ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg ${copied ? 'bg-green-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
                  <Copy size={11} /> {copied ? 'Copiado' : 'Copiar credenciales'}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="p-2.5 rounded-lg bg-gray-800">
                  <p className="text-xs text-gray-400 mb-0.5">Congregación</p>
                  <p className="font-medium">{provResult.congregation.name}{provResult.congregation.city ? ` — ${provResult.congregation.city}` : ''}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-gray-800">
                  <p className="text-xs text-gray-400 mb-0.5">Administrador</p>
                  <p className="font-medium">{provResult.user.name}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-gray-800">
                  <p className="text-xs text-gray-400 mb-0.5">Usuario / correo de login</p>
                  <p className="font-mono text-sm text-violet-300">{provResult.credentials.login_identifier}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-gray-800">
                  <p className="text-xs text-gray-400 mb-0.5">Contraseña inicial</p>
                  <p className="font-mono text-sm text-yellow-300">{provResult.credentials.password}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-gray-800 sm:col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">URL de acceso</p>
                  <p className="font-mono text-xs text-sky-300">{provResult.credentials.login_url}</p>
                </div>
              </div>
              <p className="text-xs text-yellow-400 mt-3">⚠ Guarda o copia estas credenciales — la contraseña no se puede recuperar.</p>
              <button onClick={() => { setProvResult(null); setShowProvision(false); setProv({ congregation_name: '', congregation_city: '', admin_first_name: '', admin_last_name: '', admin_email: '', admin_password: '', admin_username: '' }); }}
                className={`${iCls} mt-3 bg-gray-700 hover:bg-gray-600 text-gray-300`}>
                <X size={12} /> Cerrar
              </button>
            </div>
          )}
        </section>

        {/* ── CONGREGACIONES EXISTENTES ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base flex items-center gap-2"><Building2 size={16} className="text-violet-400" /> Congregaciones ({congres.length})</h2>
            {!creating && (
              <button onClick={() => setCreating(true)} className={`${iCls} bg-gray-700 hover:bg-gray-600 text-gray-300`}>
                <Plus size={12} /> Solo crear espacio
              </button>
            )}
          </div>

          {creating && (
            <div className="mb-4 p-4 rounded-xl border border-violet-600 bg-violet-900/10">
              <h3 className="font-semibold mb-3 text-violet-300 text-sm">Nuevo espacio (sin usuario inicial)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelCls}>Nombre *</label>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="La Estación" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Ciudad</label>
                  <input value={newCity} onChange={e => setNewCity(e.target.value)} placeholder="Pátzcuaro" className={inputCls} />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={create} disabled={saving || !newName.trim()} className={`${iCls} bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50`}><Check size={13} /> Crear</button>
                <button onClick={() => { setCreating(false); setNewName(''); setNewCity(''); }} className={`${iCls} bg-gray-700 hover:bg-gray-600 text-gray-300`}><X size={13} /> Cancelar</button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {congres.map(c => (
              <div key={c.id} className={`rounded-xl border ${editing?.id === c.id ? 'border-violet-500 bg-violet-900/10' : 'border-gray-700 bg-gray-800'}`}>
                {editing?.id === c.id ? (
                  <div className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <div>
                        <label className={labelCls}>Nombre</label>
                        <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Ciudad</label>
                        <input value={editing.city || ''} onChange={e => setEditing({ ...editing, city: e.target.value })} className={inputCls} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-sm text-gray-300">Acceso habilitado</span>
                      <button onClick={() => setEditing({ ...editing, enabled: !editing.enabled })} className={editing.enabled ? 'text-green-400' : 'text-gray-600'}>
                        {editing.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                      </button>
                    </div>
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-300">Módulos habilitados</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditing({ ...editing, enabled_modules: [...ALL_MODULE_KEYS] })} className="text-xs text-violet-400 hover:text-violet-300">Todos</button>
                          <button onClick={() => setEditing({ ...editing, enabled_modules: [] })} className="text-xs text-red-400 hover:text-red-300">Ninguno</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {MODULES.filter(m => !m.superAdminOnly).map(m => {
                          const on = editing.enabled_modules.includes(m.key);
                          return (
                            <button key={m.key} onClick={() => toggleModule(m.key)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${on ? 'bg-violet-700/60 text-violet-200 border border-violet-600' : 'bg-gray-700/50 text-gray-500 border border-gray-700'}`}>
                              <m.Icon size={11} className="shrink-0" /><span className="truncate">{m.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={save} disabled={saving} className={`${iCls} bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50`}><Check size={13} /> Guardar</button>
                      <button onClick={() => setEditing(null)} className={`${iCls} bg-gray-700 hover:bg-gray-600 text-gray-300`}><X size={13} /> Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${c.enabled ? 'bg-violet-900/40 text-violet-300' : 'bg-gray-700 text-gray-500'}`}>
                      <Building2 size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{c.name}{c.city ? ` — ${c.city}` : ''}</div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span className="flex items-center gap-1"><Users size={11} /> {c.user_count ?? 0} usuarios</span>
                        <span>{c.enabled_modules.length}/{ALL_MODULE_KEYS.length} módulos</span>
                        <span className={c.enabled ? 'text-green-400' : 'text-red-400'}>{c.enabled ? 'Activa' : 'Deshabilitada'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditing({ ...c })} className="text-xs px-2.5 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300">Editar</button>
                      {(c.user_count ?? 0) === 0 && (
                        <button onClick={() => deleteCongre(c.id)} className="text-xs p-1.5 rounded-lg bg-gray-700 hover:bg-red-900/60 text-gray-400 hover:text-red-400">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {congres.length === 0 && !fetching && <p className="text-center text-gray-500 py-8">No hay congregaciones.</p>}
          </div>
        </section>

      </div>
    </div>
  );
}

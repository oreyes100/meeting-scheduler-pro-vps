'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Profile } from '@/types';
import { Plus, Minus, FileText, Printer } from 'lucide-react';
import { useT } from '@/lib/i18n';


interface DashboardProps {
  meeting: any | null;
  publishers: Profile[];
  onAutoAssign: () => void;
  onClearAssignments: () => void;
  onRebuildParts: () => void;
  autoAssigning: boolean;
  loading: boolean;
  error: string | null;
  successMsg: string | null;
  midweekMeetingDay?: string | null;
  auxiliaryRooms?: number;
  onPrint?: () => void;
  onSaved?: (data: any) => void;
  onDirtyChange?: (dirty: boolean) => void;
  registerFlush?: (fn: () => void) => void;
}

export function MeetingDashboard({
  meeting,
  publishers,
  onAutoAssign,
  onClearAssignments,
  onRebuildParts,
  onPrint,
  autoAssigning,
  midweekMeetingDay,
  auxiliaryRooms = 0,
  onSaved,
  onDirtyChange,
  registerFlush,
}: DashboardProps) {
  const [formData, setFormData] = useState<any>(null);
  const [assignHistory, setAssignHistory] = useState<Record<string, Record<string, { date: string; title: string }>>>({});
  const { t, locale } = useT();
  const dirtyRef = useRef<any>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    fetch('/api/assignment-history')
      .then(r => r.json())
      .then(j => setAssignHistory(j.history || {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (meeting) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(JSON.parse(JSON.stringify(meeting)));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(null);
    }
  }, [meeting]);

  const saveMeetingData = useCallback(async (dataToSave: any) => {
    if (!dataToSave || !dataToSave.id) return;
    try {
      const res = await fetch(`/api/meetings/${dataToSave.id}/save`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave),
        keepalive: true,
      });
      if (res.ok) {
        pendingRef.current = false;
        onDirtyChange?.(false);
        onSaved?.(dataToSave);
      } else {
        console.error('Save failed', res.status);
        onDirtyChange?.(true);
      }
    } catch (err) {
      console.error('Save error', err);
      onDirtyChange?.(true);
    }
  }, [onDirtyChange, onSaved]);

  useEffect(() => {
    if (!formData || !meeting) return;
    if (JSON.stringify(formData) === JSON.stringify(meeting)) return;
    const handler = setTimeout(() => { saveMeetingData(formData); }, 1000);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [formData, meeting, saveMeetingData]);

  // Flush pending save when switching weeks or unmounting
  const meetingId = meeting?.id ?? null;
  useEffect(() => {
    return () => {
      if (pendingRef.current && dirtyRef.current) {
        fetch(`/api/meetings/${dirtyRef.current.id}/save`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dirtyRef.current),
          keepalive: true,
        }).then(res => { if (res.ok) pendingRef.current = false; }).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Register flush function for parent (SyncStatus button)
  useEffect(() => {
    registerFlush?.(() => {
      if (dirtyRef.current) saveMeetingData(dirtyRef.current);
    });
  }, [registerFlush, saveMeetingData]);

  const handleMeetingChange = (field: string, value: any) => {
    setFormData((prev: any) => {
      const next = { ...prev, [field]: value };
      if (field === 'chairman_id') {
        next.opening_prayer_id = value;
      }
      dirtyRef.current = next;
      pendingRef.current = true;
      return next;
    });
    onDirtyChange?.(true);
  };

  const handlePartChange = (partId: string, field: string, value: any) => {
    setFormData((prev: any) => {
      const next = {
        ...prev,
        parts: prev.parts.map((p: any) => p.id === partId ? { ...p, [field]: value } : p),
      };
      dirtyRef.current = next;
      pendingRef.current = true;
      return next;
    });
    onDirtyChange?.(true);
  };

  // Always call hooks first; only render JSX conditionally below
  const allParts = React.useMemo(() => {
    if (!formData?.parts) return [];
    return [...formData.parts].sort((a: any, b: any) => (a.part_number || 0) - (b.part_number || 0));
  }, [formData]);

  if (!formData) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-300">{t('meeting.selectMeeting')}</div>;
  }

  const DAY_MAP: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };

  const getMeetingDayLabel = (dateString: string) => {
    if (!dateString) return '';
    const monday = new Date(dateString.slice(0, 10) + 'T00:00:00');
    const dayName = (midweekMeetingDay || 'wednesday').toLowerCase();
    const targetDow = DAY_MAP[dayName] ?? 3;
    const offset = targetDow === 0 ? 6 : targetDow - 1;
    const meetingDate = new Date(monday);
    meetingDate.setDate(meetingDate.getDate() + offset);
    const loc = locale === 'es' ? 'es-ES' : 'en-US';
    const formatted = meetingDate.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  const treasuresTalk = allParts.find((p: any) => p.part_type === 'treasures_talk');
  const spiritualGems = allParts.find((p: any) => p.part_type === 'spiritual_gems');
  const bibleReading = allParts.find((p: any) => p.part_type === 'bible_reading');
  const studentParts = allParts.filter((p: any) => p.part_type === 'student_part');
  const livingParts = allParts.filter((p: any) => p.part_type === 'living_part');

  // Build labels that use {n} = part_number
  const num = (n: number) => String(n);
  const treasuresLabel = treasuresTalk ? t('meeting.treasuresTalk', { n: num(treasuresTalk.part_number) }) : '';
  const gemsLabel = spiritualGems ? t('meeting.spiritualGems', { n: num(spiritualGems.part_number) }) : '';
  const bibleReadingLabel = bibleReading ? t('meeting.bibleReading', { n: num(bibleReading.part_number) }) : '';
  const cbsLabel = t('meeting.cbsLabel');

  const fmtLastAssign = (userId: string, roleKey: string): string => {
    const h = assignHistory[userId]?.[roleKey];
    if (!h) return '';
    const d = new Date(h.date + 'T00:00:00');
    const dateStr = d.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', { day: 'numeric', month: 'short' });
    const title = h.title ? ` — ${h.title.slice(0, 30)}` : '';
    return ` (${dateStr}${title})`;
  };

  const optionsFor = (canField: string | null, roleKey: string, extraFilter?: (p: any) => boolean) => {
    let list: any[] = publishers;
    if (canField) list = list.filter((p: any) => p[canField]);
    if (extraFilter) list = list.filter(extraFilter);
    return list.map((p: any) => (
      <option key={p.id} value={p.id}>{p.first_name} {p.last_name}{fmtLastAssign(p.id, roleKey)}</option>
    ));
  };

  const bibleReadingOptions = () => {
    const eligible = publishers.filter((p: any) => p.can_do_bible_reading && p.gender !== 'female');
    const grayed = publishers.filter((p: any) => p.gender === 'female');
    return [
      ...eligible.map((p: any) => (
        <option key={p.id} value={p.id}>{p.first_name} {p.last_name}{fmtLastAssign(p.id, 'bible_reading')}</option>
      )),
      ...grayed.map((p: any) => (
        <option key={`g-${p.id}`} value={p.id} disabled style={{ color: '#9ca3af' }}>
          {p.first_name} {p.last_name}
        </option>
      )),
    ];
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 text-[13px] font-sans">
      {/* Top Title Bar - Gradient Blue */}
      <div className="bg-gradient-to-r from-[#4BA3E3] to-[#31708f] text-white px-3 py-1 flex justify-between items-center shrink-0 border-b border-[#2a6480]">
        <div className="flex items-center gap-2">
           <span className="font-bold text-base tracking-wide">{t('meeting.title')}</span>
        </div>
        <div className="flex items-center gap-4">
           <span className="text-sm">{t('meeting.congregation').split(' ')[0]} <span className="bg-white dark:bg-gray-800/20 px-1 rounded-full text-xs">{t('meeting.congregation').split(' ')[1] || ''}</span></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* Date and Songs Header */}
        <div className="flex justify-between items-center mb-2 px-2 border-b border-gray-200 dark:border-gray-700 pb-1 relative">
           <div className="w-1/3 flex gap-2">
             <button onClick={onAutoAssign} className="bg-blue-100 dark:bg-blue-900/40 border border-blue-400 dark:border-blue-600 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-800/50 shadow-sm">{t('meeting.autoAssign')}</button>
             <button onClick={onClearAssignments} className="bg-gray-100 dark:bg-gray-700 border border-gray-400 dark:border-gray-600 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded text-xs hover:bg-gray-200 dark:hover:bg-gray-600 shadow-sm">{t('meeting.clear')}</button>
             <button onClick={onRebuildParts} title={t('meeting.rebuildFromJW')} className="bg-amber-100 dark:bg-amber-900/40 border border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded text-xs hover:bg-amber-200 dark:hover:bg-amber-800/50 shadow-sm">{t('meeting.rebuildFromJW')}</button>
             {onPrint && <button onClick={onPrint} title="Imprimir" className="bg-teal-100 dark:bg-teal-900/40 border border-teal-400 dark:border-teal-600 text-teal-800 dark:text-teal-200 px-2 py-0.5 rounded text-xs hover:bg-teal-200 dark:hover:bg-teal-800/50 shadow-sm flex items-center gap-1"><Printer size={12} /> Imprimir</button>}
             {autoAssigning && <span className="text-blue-600 font-bold ml-2">...</span>}
             <select className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs rounded px-1 py-0.5 ml-2" value={formData.assembly_type || ''} onChange={e => handleMeetingChange('assembly_type', e.target.value || null)}>
               <option value="">Normal</option>
               <option value="regional">Asamblea Regional</option>
               <option value="circuit">Asamblea de Circuito</option>
             </select>
           </div>
           <h2 className="w-1/3 text-center text-lg font-bold text-[#d93025]">{getMeetingDayLabel(formData.date)}</h2>
           <div className="w-1/3 flex items-center justify-end gap-1">
              <span className="text-gray-700 dark:text-gray-300 font-medium mr-1 text-xs">{t('meeting.songs')}</span>
              <input type="number" className="w-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5 text-center text-xs h-6" value={formData.song_opening || ''} onChange={e => handleMeetingChange('song_opening', parseInt(e.target.value))} />
              <input type="number" className="w-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5 text-center text-xs h-6" value={formData.song_middle || ''} onChange={e => handleMeetingChange('song_middle', parseInt(e.target.value))} />
              <input type="number" className="w-12 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5 text-center text-xs h-6" value={formData.song_closing || ''} onChange={e => handleMeetingChange('song_closing', parseInt(e.target.value))} />
           </div>
        </div>

        {formData.assembly_type ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-center">
              <div className="text-4xl mb-3">🏛️</div>
              <h3 className="text-xl font-bold text-gray-700 dark:text-gray-200">
                {formData.assembly_type === 'regional' ? 'Asamblea Regional' : 'Asamblea de Circuito'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm">No hay reunión entre semana esta semana</p>
            </div>
          </div>
        ) : (<>

        {/* Treasures from God's Word */}
        <div className="mb-2">
           <div className="bg-gradient-to-r from-[#6e6e6e] to-[#8c8c8c] text-white font-bold px-2 py-1 flex items-center gap-2 mb-1">
             <span className="text-sm">{t('meeting.treasuresFromGodsWord')}</span>
           </div>
           <div className="px-1 flex flex-col gap-1.5">
             <div className="flex items-center">
                <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2">{t('meeting.chairman')}</label>
                <select className="w-[180px] border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={formData.chairman_id || ''} onChange={e => handleMeetingChange('chairman_id', e.target.value)}>
                  <option value=""></option>
                  {optionsFor('can_be_chairman', 'chairman')}
                </select>
                <FileText size={14} className="text-[#3b82f6] ml-1" />
                <div className="flex-1"></div>
                <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2">{t('meeting.openingPrayer')}</label>
                <select className="w-[180px] border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={formData.opening_prayer_id || ''} onChange={e => handleMeetingChange('opening_prayer_id', e.target.value)}>
                  <option value=""></option>
                  {optionsFor('can_do_prayers', 'opening_prayer')}
                </select>
             </div>

              <div className="flex items-center">
                <div className="w-[120px]"></div>
                <div className="w-[180px]"></div>
                <div className="flex-1"></div>
                <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2">{t('meeting.closingPrayer')}</label>
                <select className="w-[180px] border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={formData.closing_prayer_id || ''} onChange={e => handleMeetingChange('closing_prayer_id', e.target.value)}>
                  <option value=""></option>
                  {optionsFor('can_do_prayers', 'closing_prayer')}
                </select>
              </div>

              <div className="flex items-center">
                <div className="w-[120px]"></div>
                <div className="w-[180px]"></div>
                <div className="flex-1"></div>
                <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2">Limpieza</label>
                <select className="w-[180px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-0.5 h-6 text-xs" value={formData.cleaning_group || ''} onChange={e => handleMeetingChange('cleaning_group', e.target.value)}>
                  <option value=""></option>
                  <option value="1">Grupo 1</option>
                  <option value="2">Grupo 2</option>
                  <option value="3">Grupo 3</option>
                  <option value="4">Grupo 4</option>
                </select>
              </div>

             {treasuresTalk && (
               <div className="flex items-center gap-1 py-0.5">
                 <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2 text-xs shrink-0">{treasuresLabel}</label>
                 <select className="w-[160px] shrink-0 border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={treasuresTalk.assigned_user_id || ''} onChange={e => handlePartChange(treasuresTalk.id, 'assigned_user_id', e.target.value)}>
                     <option value=""></option>
                     {optionsFor('can_be_speaker', 'treasures_talk')}
                 </select>
                 <input type="text" title={treasuresTalk.title || ''} className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 p-0.5 h-6 ml-1 text-xs bg-white dark:bg-gray-700 dark:text-gray-200" value={treasuresTalk.title || ''} onChange={e => handlePartChange(treasuresTalk.id, 'title', e.target.value)} />
                 <input type="number" className="w-10 shrink-0 border border-gray-300 dark:border-gray-600 p-0.5 h-6 text-center text-xs ml-1" value={treasuresTalk.duration_minutes || ''} onChange={e => handlePartChange(treasuresTalk.id, 'duration_minutes', parseInt(e.target.value))} />
                 <span className="text-gray-600 dark:text-gray-300 text-xs ml-0.5 shrink-0">{t('meeting.min')}</span>
                 <label className="w-[120px] shrink-0 text-gray-700 dark:text-gray-300 text-right pr-2 text-xs ml-2">{gemsLabel}</label>
                 <select className="w-[160px] shrink-0 border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={spiritualGems?.assigned_user_id || ''} onChange={e => spiritualGems && handlePartChange(spiritualGems.id, 'assigned_user_id', e.target.value)}>
                     <option value=""></option>
                     {optionsFor('can_do_gems', 'spiritual_gems')}
                 </select>
                 <FileText size={14} className="text-[#3b82f6] ml-1 shrink-0" />
                 <input type="number" className="w-10 shrink-0 border border-gray-300 dark:border-gray-600 p-0.5 h-6 text-center text-xs ml-1" value={spiritualGems?.duration_minutes || ''} onChange={e => spiritualGems && handlePartChange(spiritualGems.id, 'duration_minutes', parseInt(e.target.value))} />
                 <span className="text-gray-600 dark:text-gray-300 text-xs ml-0.5 shrink-0">{t('meeting.min')}</span>
               </div>
             )}

             {bibleReading && (
               <div className="mt-1 border border-[#64a5d8]">
                 <div className="flex border-b border-[#64a5d8] bg-white dark:bg-gray-800 h-7">
                   <button className="px-4 text-[#005c9e] border-b-[3px] border-[#3eb5f1] font-bold text-xs flex-1 max-w-[100px]">{t('meeting.main')}</button>
                   {auxiliaryRooms >= 1 && <button className="px-4 text-white bg-gradient-to-b from-[#40b1e9] to-[#2591ca] text-xs font-semibold flex-1 max-w-[100px]">{t('meeting.aux1')}</button>}
                   <div className="flex-1 border-b-[3px] border-[#3eb5f1]"></div>
                   <div className="flex items-center pr-1 border-b-[3px] border-[#3eb5f1]">
                     <span className="text-[11px] text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-300 mr-1">{t('meeting.usualNumber')}</span>
                     <button className="bg-gradient-to-b from-[#4fb8ef] to-[#2697ce] text-white border border-[#1b73a2] rounded-sm mr-1 shadow-sm"><Plus size={14}/></button>
                     <button className="bg-gradient-to-b from-[#e3f4fc] to-[#aee1f8] text-[#1b73a2] border border-[#7fcceb] rounded-sm shadow-sm"><Minus size={14}/></button>
                   </div>
                 </div>
                 <div className="p-1.5 flex items-center bg-white dark:bg-gray-800 h-9">
                    <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2 text-xs font-semibold">{bibleReadingLabel}</label>
                    <select className="w-[180px] border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={bibleReading.assigned_user_id || bibleReading.student_id || ''} onChange={e => handlePartChange(bibleReading.id, 'assigned_user_id', e.target.value)}>
                       <option value=""></option>
                       {bibleReadingOptions()}
                    </select>
                    <input type="text" className="w-[300px] border border-gray-300 dark:border-gray-600 p-0.5 h-6 ml-2 text-xs" value={bibleReading.title || ''} onChange={e => handlePartChange(bibleReading.id, 'title', e.target.value)} />
                    <FileText size={14} className="text-[#3b82f6] ml-1" />
                 </div>
               </div>
             )}
           </div>
        </div>

        {/* Apply Yourself to the Field Ministry */}
        <div className="mb-2">
           <div className="bg-gradient-to-r from-[#bc8f27] to-[#d6af53] text-white font-bold px-2 py-1 flex items-center gap-2 mb-1">
             <span className="text-sm">{t('meeting.applyYourself')}</span>
           </div>
            <div className="px-1 flex flex-col gap-1.5">
              {studentParts.map((part: any) => {
                // Detect "¿Qué diría?" parts — treated as discourse, Elders/MS only, no assistant
                const normalizedTitle = (part.title || '').toLowerCase()
                  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const isQueDiria = normalizedTitle.includes('que diria') || normalizedTitle.includes('que dira');

                const isTalk = part.student_part_type === 'talk' || isQueDiria;
                const showAssistant = !isTalk;
                // For "¿Qué diría?": only Elders/MS (can_be_speaker or can_be_chairman), male only
                const maleOnly = isTalk;
                const studentRoleKey = isQueDiria ? 'living_part' : `student_${part.student_part_type || 'starting_conversation'}`;
                const assigneeFilter = isQueDiria
                  ? (p: any) => p.gender === 'male' && (p.can_be_chairman || p.can_be_speaker)
                  : (maleOnly ? (p: any) => p.gender === 'male' : undefined);

                return (
                <div key={part.id} className="flex items-center gap-1 py-0.5">
                  <label className="w-[24px] shrink-0 text-gray-700 dark:text-gray-300 text-right pr-1 text-xs font-semibold">{part.part_number}.</label>
                  {isQueDiria ? (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700">
                      Discurso
                    </span>
                  ) : (
                    <select className="w-[150px] shrink-0 border border-gray-300 dark:border-gray-600 p-0.5 h-6 text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" value={part.student_part_type || ''} onChange={e => {
                      handlePartChange(part.id, 'student_part_type', e.target.value);
                      if (e.target.value === 'talk') handlePartChange(part.id, 'assistant_user_id', null);
                    }}>
                      <option value="starting_conversation">{t('meeting.startingConversation')}</option>
                      <option value="following_up">{t('meeting.followingUp')}</option>
                      <option value="making_disciples">{t('meeting.makingDisciples')}</option>
                      <option value="explaining_beliefs">{t('meeting.explainingBeliefs')}</option>
                      <option value="talk">{t('meeting.talk')}</option>
                    </select>
                  )}
                  <select
                    className="w-[150px] shrink-0 border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200"
                    value={part.assigned_user_id || ''}
                    onChange={e => handlePartChange(part.id, 'assigned_user_id', e.target.value)}
                  >
                    <option value=""></option>
                    {isQueDiria
                      ? optionsFor(null, studentRoleKey, assigneeFilter)
                      : optionsFor('can_do_student_parts', studentRoleKey, maleOnly ? (p: any) => p.gender === 'male' : undefined)
                    }
                  </select>
                  <input
                    type="text"
                    title={part.title || ''}
                    className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 p-0.5 h-6 ml-1 text-xs bg-white dark:bg-gray-700 dark:text-gray-200"
                    value={part.title || ''}
                    onChange={e => handlePartChange(part.id, 'title', e.target.value)}
                  />
                  <FileText size={14} className="text-[#3b82f6] ml-1 shrink-0" />
                  <input type="number" className="w-10 shrink-0 border border-gray-300 dark:border-gray-600 p-0.5 h-6 text-center text-xs ml-1" value={part.duration_minutes || ''} onChange={e => handlePartChange(part.id, 'duration_minutes', parseInt(e.target.value))} />
                  <span className="text-gray-600 dark:text-gray-300 text-xs ml-0.5 shrink-0">{t('meeting.min')}</span>

                  {showAssistant ? (
                    <>
                      <label className="text-gray-700 dark:text-gray-300 text-right pr-1 text-xs ml-1 shrink-0">{t('meeting.assistant')}</label>
                      <select className="w-[150px] shrink-0 border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={part.assistant_user_id || ''} onChange={e => handlePartChange(part.id, 'assistant_user_id', e.target.value || null)}>
                        <option value="">— sin ayudante —</option>
                        {optionsFor('can_be_assistant', 'assistant')}
                      </select>
                    </>
                  ) : (
                    <div className="w-[150px] shrink-0" />
                  )}
                </div>
                );
              })}
           </div>
        </div>

        {/* Living as Christians */}
        <div className="mb-2">
           <div className="bg-gradient-to-r from-[#942735] to-[#b34856] text-white font-bold px-2 py-1 flex items-center gap-2 mb-1">
             <span className="text-sm">{t('meeting.livingAsChristians')}</span>
           </div>
           <div className="px-1 flex flex-col gap-1.5">
              {livingParts.map((part: any, index: number) => {
                // Alternating bg colors for living parts based on screenshot (blue then yellow then yellow)
                const isBlue = index === 0;
                const inputBg = isBlue ? "bg-[#b4d5eb] dark:bg-[#1e3a4a] dark:text-gray-200" : "bg-[#fdfad4] dark:bg-[#3a3a1a] dark:text-gray-200";
                const titleBg = "bg-white dark:bg-gray-800";

                return (
                  <div key={part.id} className="flex items-center">
                    <label className="w-[120px] text-gray-700 dark:text-gray-300 pr-2 text-xs">{t('meeting.living', { n: part.part_number })}</label>
                    <select className={`w-[180px] border border-gray-300 dark:border-gray-600 ${inputBg} p-0.5 h-6 text-xs`} value={part.assigned_user_id || part.student_id || ''} onChange={e => handlePartChange(part.id, 'assigned_user_id', e.target.value)}>
                         <option value=""></option>
                         {optionsFor('can_be_speaker', 'living_part')}
                    </select>
                    <input type="text" className={`w-[360px] border border-gray-300 dark:border-gray-600 p-0.5 h-6 ml-2 text-xs ${titleBg}`} value={part.title || ''} onChange={e => handlePartChange(part.id, 'title', e.target.value)} />
                    <FileText size={14} className="text-[#3b82f6] ml-1" />
                    <input type="number" className="w-10 border border-gray-300 dark:border-gray-600 p-0.5 h-6 text-center text-xs ml-1" value={part.duration_minutes || ''} onChange={e => handlePartChange(part.id, 'duration_minutes', parseInt(e.target.value))} />
                    <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-300 text-xs ml-1">{t('meeting.min')}</span>

                    <div className="flex-1"></div>
                   </div>
                 );
               })}
            </div>
         </div>

         {/* Congregation Bible Study — always-visible Conductor + Reader rows */}
         <div className="mb-2">
            <div className="bg-gradient-to-r from-[#942735] to-[#b34856] text-white font-bold px-2 py-1 flex items-center gap-2 mb-1">
              <span className="text-sm">{t('meeting.cbsLabel')}</span>
            </div>
            <div className="px-1 flex flex-col gap-1.5">
              <div className="flex items-center">
                <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2 text-xs">{t('meeting.cbsConductor')}</label>
                <select className="w-[180px] border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={formData.cbs_conductor_id || ''} onChange={e => handleMeetingChange('cbs_conductor_id', e.target.value)}>
                  <option value=""></option>
                  {optionsFor('can_be_cbs_conductor', 'cbs_conductor')}
                </select>
                <FileText size={14} className="text-[#3b82f6] ml-1" />
                <span className="w-10 text-center text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-300 text-xs ml-1">30</span>
                <span className="text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400 dark:text-gray-300 text-xs ml-1">{t('meeting.min')}</span>
              </div>
              <div className="flex items-center">
                <label className="w-[120px] text-gray-700 dark:text-gray-300 text-right pr-2 text-xs">{t('meeting.cbsReader')}</label>
                <select className="w-[180px] border border-gray-300 dark:border-gray-600 bg-[#b4d5eb] dark:bg-[#1e3a4a] p-0.5 h-6 text-xs dark:text-gray-200" value={formData.cbs_reader_id || ''} onChange={e => handleMeetingChange('cbs_reader_id', e.target.value)}>
                  <option value=""></option>
                  {optionsFor('can_be_cbs_reader', 'cbs_reader')}
                </select>
                <div className="w-[66px]"></div>
              </div>
            </div>
         </div>

        </>)}
      </div>
    </div>
  );
}

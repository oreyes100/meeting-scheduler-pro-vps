'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  bible_reading: 'Lectura de la Biblia',
  treasures_talk: 'Discurso de Tesoros',
  spiritual_gems: 'Joyas Espirituales',
  living_part: 'Nuestra Vida Cristiana',
  student_starting_conversation: 'Empiece una Conversación',
  student_following_up: 'Haga Revisitas',
  student_making_disciples: 'Haga Discípulos',
  student_explaining_beliefs: 'Explique las Creencias',
  student_talk: 'Discurso de Estudiante',
  assistant: 'Ayudante',
  chairman: 'Presidente',
  opening_prayer: 'Oración Inicial',
  closing_prayer: 'Oración Final',
  cbs_conductor: 'Director del Estudio',
  cbs_reader: 'Lector del Estudio',
};

const POPUP_KEY = 'assignments_popup_shown';
const UPCOMING_DAYS = 14;

function formatDate(iso: string): string {
  // Las reuniones se guardan con fecha de lunes; mostrar el miércoles (lunes+2).
  const base = new Date(iso + 'T00:00:00Z');
  const isMonday = base.getUTCDay() === 1;
  const d = isMonday ? new Date(base.getTime() + 2 * 86400000) : base;
  return d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface Assignment {
  date: string;
  role: string;
  title: string | null;
}

interface Props {
  /** Called after user is confirmed authenticated (useMe resolved) */
  ready: boolean;
}

export function UpcomingAssignmentsModal({ ready }: Props) {
  const [open, setOpen] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!ready) return;
    // Only show once per browser session
    if (sessionStorage.getItem(POPUP_KEY) === 'true') return;

    fetch('/api/my-assignments')
      .then(r => r.json())
      .then(d => {
        const all: Assignment[] = d.assignments || [];
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() + UPCOMING_DAYS);
        const upcoming = all.filter(a => new Date(a.date + 'T00:00:00') <= cutoff);
        if (upcoming.length > 0) {
          setAssignments(upcoming);
          setOpen(true);
        }
      })
      .catch(() => {});
  }, [ready]);

  const close = () => {
    sessionStorage.setItem(POPUP_KEY, 'true');
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-sky-500 to-sky-600 text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Próximas Asignaciones</h2>
            <p className="text-sky-100 text-sm">En los próximos {UPCOMING_DAYS} días</p>
          </div>
          <button onClick={close} className="p-1.5 rounded-full hover:bg-sky-400/40 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {assignments.map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 dark:text-gray-100 text-sm">
                  {ROLE_LABELS[a.role] ?? a.role}
                </div>
                {a.title && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{a.title}</div>
                )}
              </div>
              <span className="shrink-0 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/40 px-2 py-0.5 rounded-full capitalize">
                {formatDate(a.date)}
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={close}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

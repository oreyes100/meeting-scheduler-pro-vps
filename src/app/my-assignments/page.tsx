'use client';

import React, { useEffect, useState } from 'react';
import { IconSidebar } from '@/components/IconSidebar';
import { useMe } from '@/lib/useMe';

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

function formatDate(iso: string): string {
  // Las reuniones se guardan con fecha de lunes; la reunión entre semana es el miércoles (lunes+2).
  const base = new Date(iso + 'T00:00:00Z');
  const isMonday = base.getUTCDay() === 1;
  const d = isMonday ? new Date(base.getTime() + 2 * 86400000) : base;
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function MyAssignmentsPage() {
  const { me, loading: meLoading } = useMe();
  const [assignments, setAssignments] = useState<{ date: string; role: string; title: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (meLoading) return;
    fetch('/api/my-assignments')
      .then(r => r.json())
      .then(d => setAssignments(d.assignments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [meLoading]);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <div className="shrink-0">
        <IconSidebar />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-1">Mis Asignaciones</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {me?.name ? `Hola, ${me.name}.` : ''} Tus asignaciones futuras en Vida y Ministerio.
        </p>

        {loading ? (
          <p className="text-gray-400">Cargando…</p>
        ) : assignments.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-lg">No tienes asignaciones futuras.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {assignments.map((a, i) => {
              const days = daysUntil(a.date);
              const urgent = days <= 7;
              const soon = days <= 14 && days > 7;
              return (
                <div
                  key={i}
                  className={`rounded-lg border p-4 shadow-sm bg-white dark:bg-gray-800 ${
                    urgent
                      ? 'border-red-300 dark:border-red-700'
                      : soon
                      ? 'border-amber-300 dark:border-amber-700'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-gray-800 dark:text-gray-100">
                        {ROLE_LABELS[a.role] ?? a.role}
                      </div>
                      {a.title && (
                        <div className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{a.title}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1 capitalize">{formatDate(a.date)}</div>
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
                        urgent
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : soon
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                      }`}
                    >
                      {days === 0 ? 'Hoy' : days === 1 ? 'Mañana' : `En ${days} días`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

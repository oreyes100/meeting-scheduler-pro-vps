// Fuente única de verdad: qué tablas de Supabase pertenecen a cada "sección"
// que el usuario puede elegir respaldar/restaurar por separado.
export const BACKUP_SECTIONS: Record<string, { label: string; tables: string[] }> = {
  congregation: { label: 'Congregación', tables: ['congregations', 'congregation_settings'] },
  persons: { label: 'Publicadores', tables: ['users'] },
  meetings: { label: 'Reuniones entre semana', tables: ['meetings', 'meeting_parts', 'part_history'] },
  weekend: { label: 'Reuniones fin de semana', tables: ['weekend_meetings'] },
  territories: { label: 'Territorios', tables: ['territories', 'territory_assignments'] },
  field_service: { label: 'Servicio del Campo', tables: ['field_service_groups', 'field_service_group_members', 'field_service_meetings', 'field_service_reports'] },
  public_talks: { label: 'Discursos Públicos', tables: ['public_speakers', 'public_talk_outlines', 'public_talk_history', 'outgoing_talks'] },
  public_witnessing: { label: 'Predicación Pública', tables: ['pw_locations', 'pw_shifts', 'pw_assignments'] },
  tasks: { label: 'Tareas y Mantenimiento', tables: ['congregation_tasks', 'maintenance_tasks', 'cleaning_assignments'] },
  events: { label: 'Eventos y Memorial', tables: ['congregation_events', 'memorial_roles'] },
  co_visits: { label: 'Visitas del Superintendente de Circuito', tables: ['circuit_overseer_visits'] },
  attendance: { label: 'Asistencia a las reuniones', tables: ['meeting_attendance'] },
  responsibilities: { label: 'Responsabilidades en la Congregación', tables: ['congregation_roles'] },
  cuentas: { label: 'Cuentas v2 (Contabilidad)', tables: ['cuentas_codes', 'cuentas_transactions', 'cuentas_saldo_inicial', 'cuentas_config'] },
  messaging: { label: 'Mensajería y Telegram', tables: ['messaging_settings', 'messages'] },
};

export const ALL_TABLES: string[] = Object.values(BACKUP_SECTIONS).flatMap(s => s.tables);

// Columna que identifica de forma única una fila en cada tabla (default 'id')
export const PRIMARY_KEY: Record<string, string> = {
  congregation_roles: 'role_key',
};

export function primaryKeyOf(table: string): string {
  return PRIMARY_KEY[table] || 'id';
}

export function tablesForSections(sections: string[] | null): string[] {
  if (!sections || sections.length === 0) return ALL_TABLES;
  const set = new Set<string>();
  for (const key of sections) {
    const section = BACKUP_SECTIONS[key];
    if (section) for (const t of section.tables) set.add(t);
  }
  return [...set];
}

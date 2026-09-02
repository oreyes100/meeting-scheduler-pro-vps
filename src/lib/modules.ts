import {
  Home, Users, Calendar, BookOpen, Mic, MapPin, Briefcase, Eye,
  ClipboardList, Sparkles, Wrench, GlassWater, Wine, CalendarDays,
  FileText, CalendarCheck, ShieldCheck, UsersRound, ClipboardCheck, UserCog, Archive, Banknote, Building2, BookMarked, MessageCircle, Bot, type LucideIcon,
} from 'lucide-react';

export interface AppModule {
  key: string;
  path: string;
  title: string;
  description: string;
  Icon: LucideIcon;
  /** visible para rol publisher por defecto */
  publisherDefault?: boolean;
  /** solo admin de la congregación */
  adminOnly?: boolean;
  /** solo super-admin global */
  superAdminOnly?: boolean;
}

export const MODULES: AppModule[] = [
  { key: 'congregation', path: '/congregation', title: 'Congregación', description: 'Información y configuración de la congregación', Icon: Home },
  { key: 'persons', path: '/persons', title: 'Publicadores', description: 'Publicadores y contactos de emergencia', Icon: Users },
  { key: 'meetings', path: '/meetings', title: 'Vida y Ministerio', description: 'Programa de la reunión de entre semana', Icon: Calendar },
  { key: 'weekend', path: '/weekend', title: 'Fin de Semana', description: 'Reunión pública y Estudio de La Atalaya', Icon: BookOpen },
  { key: 'public-talks', path: '/public-talks', title: 'Discursos Públicos', description: 'Discursos locales y salientes', Icon: Mic },
  { key: 'outgoing-speakers', path: '/outgoing-speakers', title: 'Discursantes Salientes', description: 'Programa de oradores que visitan otras congregaciones', Icon: CalendarDays },
  { key: 'territories', path: '/territories', title: 'Territorios', description: 'Gestión de territorios en mapa', Icon: MapPin },
  { key: 'field-service', path: '/field-service', title: 'Servicio del Campo', description: 'Reuniones de predicación y grupos', Icon: Briefcase },
  { key: 'field-service-reports', path: '/field-service-reports', title: 'Informes de Predicación', description: 'Registro S-1 e informes mensuales', Icon: FileText },
  { key: 'public-witnessing', path: '/public-witnessing', title: 'Predicación Pública', description: 'Carritos: ubicaciones y turnos', Icon: Eye },
  { key: 'attendance', path: '/attendance', title: 'Asistencia a las reuniones', description: 'Conteo semanal entre semana / fin de semana', Icon: ClipboardCheck },
  { key: 'responsibilities', path: '/responsibilities', title: 'Responsabilidades en la Congregación', description: 'Coordinador, Secretario, Superintendente de servicio y roles de reunión', Icon: UserCog },
  { key: 'tasks', path: '/tasks', title: 'Tareas', description: 'Acomodadores, seguridad, audio/vídeo…', Icon: ClipboardList },
  { key: 'cleaning', path: '/cleaning', title: 'Limpieza', description: 'Limpieza del Salón del Reino y jardín', Icon: Sparkles },
  { key: 'maintenance', path: '/maintenance', title: 'Mantenimiento', description: 'Tareas de mantenimiento LDC', Icon: Wrench },
  { key: 'co-visit', path: '/co-visit', title: 'Visita del SC', description: 'Programa de la visita del superintendente', Icon: GlassWater },
  { key: 'memorial', path: '/memorial', title: 'Conmemoración', description: 'Asignaciones de la Conmemoración', Icon: Wine },
  { key: 'events', path: '/events', title: 'Eventos', description: 'Asambleas y eventos de la congregación', Icon: CalendarDays },
  { key: 'my-assignments', path: '/my-assignments', title: 'Mis Asignaciones', description: 'Tus asignaciones futuras en Vida y Ministerio', Icon: BookMarked, publisherDefault: true },
  { key: 'my-report', path: '/my-report', title: 'Mi Informe', description: 'Sube tu informe de predicación', Icon: CalendarCheck, publisherDefault: true },
  { key: 'group-reports', path: '/group-reports', title: 'Informes de mi Grupo', description: 'Captura los informes pendientes de tu grupo de predicación', Icon: UsersRound },
  { key: 'messaging', path: '/messaging', title: 'Mensajería y WhatsApp', description: 'Avisos de territorios por plataforma y WhatsApp', Icon: MessageCircle, adminOnly: true },
  { key: 'telegram', path: '/telegram', title: 'Sincronización Telegram', description: 'Publica avisos de territorios en un grupo o canal de Telegram', Icon: Bot, adminOnly: true },
  { key: 'permissions', path: '/permissions', title: 'Privilegios', description: 'Control de acceso por usuario', Icon: ShieldCheck, adminOnly: true },
  { key: 'backup', path: '/backup', title: 'Respaldar y Restaurar', description: 'Exportar/importar la base de datos — puede borrar datos existentes', Icon: Archive, adminOnly: true },
  { key: 'cuentas', path: '/cuentas', title: 'Cuentas', description: 'Contabilidad de la congregación (S-26, S-30)', Icon: Banknote },
  { key: 'super-admin', path: '/super-admin', title: 'Super Administrador', description: 'Gestionar congregaciones y módulos habilitados', Icon: Building2, superAdminOnly: true },
];

export function moduleByPath(pathname: string | null): AppModule | undefined {
  if (!pathname) return undefined;
  return MODULES.find(m => pathname === m.path || pathname.startsWith(m.path + '/'));
}

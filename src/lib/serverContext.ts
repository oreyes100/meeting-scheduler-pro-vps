import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from './auth';
import { getDb } from './sqlite';

export interface SessionContext {
  userId: string | null;
  congreId: string | null;
  isSuperAdmin: boolean;
  email: string | null;
}

export async function getSessionContext(): Promise<SessionContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return { userId: null, congreId: null, isSuperAdmin: false, email: null };

  const session = await verifySession(token);
  if (!session) return { userId: null, congreId: null, isSuperAdmin: false, email: null };

  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT id, auth_email, congregation_id, is_super_admin
      FROM users WHERE id = ? LIMIT 1
    `).get(session.userId) as { id: string; auth_email: string | null; congregation_id: string | null; is_super_admin: number } | undefined;

    if (!row) return { userId: null, congreId: null, isSuperAdmin: false, email: null };

    const email = row.auth_email?.toLowerCase() ?? null;
    const envAdmins = (process.env.SUPER_ADMIN_EMAILS || 'oreyes100@gmail.com')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isSuperAdmin = (email ? envAdmins.includes(email) : false) || !!row.is_super_admin;

    return {
      userId: row.id,
      congreId: row.congregation_id ?? null,
      isSuperAdmin,
      email,
    };
  } catch {
    return { userId: null, congreId: null, isSuperAdmin: false, email: null };
  }
}

/** Standard 401 response — use after getSessionContext() when userId is null */
export function unauthenticated() {
  return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
}

/**
 * Returns true if the authenticated user can access the Cuentas module.
 * Rules: isSuperAdmin OR app_role in (admin, elder) OR permissions includes 'cuentas'.
 */
export function canAccessCuentas(ctx: SessionContext): boolean {
  if (!ctx.userId || !ctx.congreId) return false;
  if (ctx.isSuperAdmin) return true;
  try {
    const db = getDb();
    const row = db.prepare(
      `SELECT app_role, permissions FROM users WHERE id = ? LIMIT 1`
    ).get(ctx.userId) as { app_role: string; permissions: string | null } | undefined;
    if (!row) return false;
    if (row.app_role === 'admin' || row.app_role === 'elder') return true;
    const perms: string[] = JSON.parse(row.permissions || '[]');
    return perms.includes('cuentas');
  } catch {
    return false;
  }
}

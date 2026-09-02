import { NextResponse } from 'next/server';
import { sb } from '@/lib/crud';
import { getDb } from '@/lib/sqlite';
import { getSessionContext, unauthenticated } from '@/lib/serverContext';

export async function GET() {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();
    const db = getDb();
    let sql = `SELECT t.*, u.id as user_id_ref, u.first_name, u.last_name, u.name as user_name
               FROM outgoing_talks t
               LEFT JOIN users u ON u.id = t.user_id`;
    const params: unknown[] = [];
    if (ctx.congreId) { sql += ' WHERE t.congregation_id = ?'; params.push(ctx.congreId); }
    sql += ' ORDER BY t.week_date ASC';
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    const talks = rows.map(r => {
      const { user_id_ref, first_name, last_name, user_name, ...rest } = r;
      return { ...rest, user: user_id_ref ? { id: user_id_ref, first_name, last_name, name: user_name } : null };
    });
    return NextResponse.json({ talks });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();
    const supabase = sb();
    const body = await request.json();
    const id = crypto.randomUUID();
    const { error } = await supabase
      .from('outgoing_talks')
      .insert({
        id,
        week_date: body.week_date,
        user_id: body.user_id,
        congregation_name: body.congregation_name,
        talk_number: body.talk_number || null,
        talk_title: body.talk_title || null,
        contact_info: body.contact_info || null,
        kingdom_hall_address: body.kingdom_hall_address || null,
        notes: body.notes || null,
        congregation_id: ctx.congreId ?? null,
      });
    if (error) throw error;
    const db = getDb();
    const row = db.prepare(`SELECT t.*, u.id as user_id_ref, u.first_name, u.last_name, u.name as user_name FROM outgoing_talks t LEFT JOIN users u ON u.id = t.user_id WHERE t.id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error('Insert failed');
    const { user_id_ref, first_name, last_name, user_name, ...rest } = row;
    return NextResponse.json({ talk: { ...rest, user: user_id_ref ? { id: user_id_ref, first_name, last_name, name: user_name } : null } });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 });
  }
}

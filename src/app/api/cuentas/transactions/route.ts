import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/sqlite';
import { toCsv } from '@/lib/csv';
import { ACCOUNTS, TYPES, type Account, type TxType } from '@/lib/cuentas';
import { requireCuentas, badRequest, serverError } from '../_guard';

interface Body {
  id?: string;
  date?: string;
  type?: string;
  account?: string;
  to_account?: string | null;
  code?: string | null;
  description?: string;
  amount?: number | string;
  receipt_ref?: string | null;
  notes?: string | null;
}

/** Valida y normaliza el cuerpo. Devuelve el error como string si no procede. */
function parse(body: Body): { error: string } | {
  date: string; type: TxType; account: Account; to_account: Account | null;
  code: string | null; description: string; amount: number;
  receipt_ref: string | null; notes: string | null;
} {
  const { date, type, account, to_account, code, description, amount } = body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Fecha inválida (YYYY-MM-DD)' };
  if (!type || !(TYPES as readonly string[]).includes(type)) return { error: 'Tipo inválido' };
  if (!account || !(ACCOUNTS as readonly string[]).includes(account)) return { error: 'Cuenta inválida' };
  if (!description || !String(description).trim()) return { error: 'La descripción es obligatoria' };

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return { error: 'El monto debe ser mayor a 0' };

  let to: Account | null = null;
  if (type === 'transfer') {
    if (!to_account || !(ACCOUNTS as readonly string[]).includes(to_account)) {
      return { error: 'La transferencia requiere cuenta destino' };
    }
    if (to_account === account) return { error: 'La cuenta destino debe ser distinta del origen' };
    to = to_account as Account;
  }

  return {
    date,
    type: type as TxType,
    account: account as Account,
    to_account: to,
    code: code ? String(code).trim().toUpperCase() : null,
    description: String(description).trim(),
    amount: Math.round(amt * 100) / 100,
    receipt_ref: body.receipt_ref ? String(body.receipt_ref).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
  };
}

export async function GET(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');   // YYYY-MM
    const account = searchParams.get('account');
    const type = searchParams.get('type');
    const code = searchParams.get('code');
    const fmt = searchParams.get('format');

    const where: string[] = ['congregation_id = ?'];
    const params: unknown[] = [g.congreId];

    if (month) { where.push(`substr(date,1,7) = ?`); params.push(month); }
    if (account && (ACCOUNTS as readonly string[]).includes(account)) {
      // Una transferencia pertenece a ambas cuentas implicadas.
      where.push(`(account = ? OR to_account = ?)`); params.push(account, account);
    }
    if (type && (TYPES as readonly string[]).includes(type)) { where.push(`type = ?`); params.push(type); }
    if (code) { where.push(`code = ?`); params.push(code.toUpperCase()); }

    const rows = getDb().prepare(`
      SELECT id, date, type, account, to_account, code, description, amount, receipt_ref, notes, created_at
      FROM cuentas_transactions
      WHERE ${where.join(' AND ')}
      ORDER BY date ASC, created_at ASC
      LIMIT ${fmt === 'csv' ? 200000 : 2000}
    `).all(...params);

    if (fmt === 'csv') {
      const stamp = new Date().toISOString().slice(0, 10);
      const csv = toCsv(rows as unknown as Record<string, unknown>[]);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="cuentas-transacciones-${stamp}.csv"`,
        },
      });
    }

    return NextResponse.json({ transactions: rows });
  } catch (e) { return serverError(e); }
}

export async function POST(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const parsed = parse(await request.json());
    if ('error' in parsed) return badRequest(parsed.error);

    const id = randomUUID();
    getDb().prepare(`
      INSERT INTO cuentas_transactions
        (id, date, type, account, to_account, code, description, amount,
         receipt_ref, notes, created_by, congregation_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, parsed.date, parsed.type, parsed.account, parsed.to_account, parsed.code,
      parsed.description, parsed.amount, parsed.receipt_ref, parsed.notes,
      g.userId, g.congreId,
    );

    const row = getDb().prepare(`SELECT * FROM cuentas_transactions WHERE id = ?`).get(id);
    return NextResponse.json({ transaction: row });
  } catch (e) { return serverError(e); }
}

export async function PUT(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const body: Body = await request.json();
    if (!body.id) return badRequest('id requerido');

    const parsed = parse(body);
    if ('error' in parsed) return badRequest(parsed.error);

    const result = getDb().prepare(`
      UPDATE cuentas_transactions SET
        date = ?, type = ?, account = ?, to_account = ?, code = ?,
        description = ?, amount = ?, receipt_ref = ?, notes = ?,
        updated_at = datetime('now')
      WHERE id = ? AND congregation_id = ?
    `).run(
      parsed.date, parsed.type, parsed.account, parsed.to_account, parsed.code,
      parsed.description, parsed.amount, parsed.receipt_ref, parsed.notes,
      body.id, g.congreId,
    );

    if (result.changes === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    const row = getDb().prepare(`SELECT * FROM cuentas_transactions WHERE id = ?`).get(body.id);
    return NextResponse.json({ transaction: row });
  } catch (e) { return serverError(e); }
}

export async function DELETE(request: Request) {
  const g = await requireCuentas();
  if (!g.ok) return g.res;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return badRequest('id requerido');

    const result = getDb().prepare(
      `DELETE FROM cuentas_transactions WHERE id = ? AND congregation_id = ?`
    ).run(id, g.congreId);

    if (result.changes === 0) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) { return serverError(e); }
}

import { NextResponse } from 'next/server';
import { sb } from '@/lib/crud';
import { getSessionContext, unauthenticated } from '@/lib/serverContext';

export async function GET(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();

    const { searchParams } = new URL(request.url);
    const targetCongreId = searchParams.get('congregation_id') || ctx.congreId;

    let query = sb()
      .from('users')
      .select('*')
      .order('name', { ascending: true });

    if (targetCongreId) {
      query = query.eq('congregation_id', targetCongreId);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    return NextResponse.json({ users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch users';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();
    const body = await request.json();

    if (ctx.congreId && !ctx.isSuperAdmin) {
      body.congregation_id = ctx.congreId;
    }

    const { data: user, error } = await sb()
      .from('users')
      .insert([body])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

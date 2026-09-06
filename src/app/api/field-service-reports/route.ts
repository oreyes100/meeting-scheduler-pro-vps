import { NextResponse } from 'next/server';
import { sb } from '@/lib/crud';
import { getSessionContext, unauthenticated } from '@/lib/serverContext';
import { diagnosticLogger } from '@/utils/diagnosticLogger';


export async function GET(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();
    const supabase = sb();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const userId = searchParams.get('user_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    diagnosticLogger('GET /api/field-service-reports', { month, userId, from, to });

    let query = supabase.from('field_service_reports').select('*').order('month', { ascending: true });
    if (ctx.congreId && !ctx.isSuperAdmin) {
      query = query.or(`congregation_id.eq.${ctx.congreId},congregation_id.is.null`);
    }
    if (month) query = query.eq('month', month);
    if (userId) query = query.eq('user_id', userId);
    if (from) query = query.gte('month', from);
    if (to) query = query.lte('month', to);

    const { data, error } = await query;
    if (error) throw error;
    const reports = (data || []).map((r: any) => ({
      ...r,
      participated: Boolean(r.participated),
      is_auxiliary_pioneer: Boolean(r.is_auxiliary_pioneer),
    }));
    return NextResponse.json({ reports });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch field service reports';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();
    const supabase = sb();
    const body = await request.json();
    diagnosticLogger('POST /api/field-service-reports', { body });

    if (!body.user_id || !body.month) return NextResponse.json({ error: 'user_id and month are required' }, { status: 400 });

    const congreId = ctx.congreId ?? null;

    const { data, error } = await supabase
      .from('field_service_reports')
      .upsert({
        user_id: body.user_id,
        month: body.month,
        participated: body.participated ?? false,
        is_auxiliary_pioneer: body.is_auxiliary_pioneer ?? false,
        hours: body.hours ?? null,
        bible_studies: body.bible_studies ?? null,
        notes: body.notes ?? null,
        updated_at: new Date().toISOString(),
        congregation_id: congreId,
      }, { onConflict: 'user_id,month' })
      .select().single();

    if (error) throw error;
    const report = data ? {
      ...data,
      participated: Boolean(data.participated),
      is_auxiliary_pioneer: Boolean(data.is_auxiliary_pioneer),
    } : null;
    return NextResponse.json({ report });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save report';
    console.error('POST /api/field-service-reports error:', error);
    diagnosticLogger('POST /api/field-service-reports error', { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

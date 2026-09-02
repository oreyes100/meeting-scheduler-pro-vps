import { NextRequest, NextResponse } from 'next/server';
import { sb } from '@/lib/crud';
import { getSessionContext, unauthenticated } from '@/lib/serverContext';
import { runAutoAssignment } from '@/services/auto-assign-service.js';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();
    const { id: meetingId } = await params;

    if (!meetingId) {
      return NextResponse.json(
        { error: 'Meeting ID is required' },
        { status: 400 }
      );
    }

    if (ctx.congreId && !ctx.isSuperAdmin) {
      const { data: meeting } = await sb()
        .from('meetings')
        .select('id')
        .eq('id', meetingId)
        .eq('congregation_id', ctx.congreId)
        .maybeSingle();
      if (!meeting) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    console.log(`🤖 Triggering auto-assignment for meeting: ${meetingId}`);
    const result = await runAutoAssignment(meetingId, sb());

    return NextResponse.json({
      success: true,
      message: 'Auto-assignment completed successfully',
      ...result
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('❌ Error during auto-assignment API route:', error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

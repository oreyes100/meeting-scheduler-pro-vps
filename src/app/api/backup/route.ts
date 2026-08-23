import { NextResponse } from 'next/server';
import { sb } from '@/lib/crud';
import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import { tablesForSections } from '@/lib/backupSections';
import { toCsv } from '@/lib/csv';
import { getSessionContext, unauthenticated } from '@/lib/serverContext';

const TABLES_WITH_CONGREGATION_ID = new Set([
  'meetings', 'weekend_meetings', 'field_service_groups', 'field_service_meetings',
  'field_service_reports', 'territories', 'public_speakers', 'outgoing_talks',
  'pw_locations', 'congregation_tasks', 'cleaning_assignments', 'maintenance_tasks',
  'circuit_overseer_visits', 'memorial_roles', 'congregation_events', 'congregation_roles',
  'meeting_attendance', 'users',
]);

async function fetchAllRows(table: string, congregationId?: string | null) {
  let query = sb().from(table).select('*');
  if (congregationId && TABLES_WITH_CONGREGATION_ID.has(table)) {
    query = query.eq('congregation_id', congregationId);
  }
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

export async function GET(request: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx.userId) return unauthenticated();
    const congreId = ctx.congreId && !ctx.isSuperAdmin ? ctx.congreId : null;

    const { searchParams } = new URL(request.url);
    const sectionsParam = searchParams.get('sections');
    const format = searchParams.get('format') === 'csv' ? 'csv' : 'json';
    const sections = sectionsParam ? sectionsParam.split(',').filter(Boolean) : null;
    const tables = tablesForSections(sections);
    const stamp = new Date().toISOString().slice(0, 10);
    // Nombre del archivo incluye la seccion cuando se exporta una sola
    const tag = sections && sections.length === 1 ? `-${sections[0]}` : '';

    const dump: Record<string, unknown[]> = {};
    for (const table of tables) dump[table] = await fetchAllRows(table, congreId);

    if (format === 'json') {
      return new NextResponse(JSON.stringify(dump, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="respaldo${tag}-${stamp}.json"`,
        },
      });
    }

    if (tables.length === 1) {
      const csv = toCsv(dump[tables[0]] as Record<string, unknown>[]);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${tables[0]}-${stamp}.csv"`,
        },
      });
    }

    const archive = new ZipArchive({ zlib: { level: 9 } });
    const passthrough = new PassThrough();
    archive.pipe(passthrough);
    for (const table of tables) {
      archive.append(toCsv(dump[table] as Record<string, unknown>[]), { name: `${table}.csv` });
    }
    archive.finalize();

    const chunks: Buffer[] = [];
    for await (const chunk of passthrough) chunks.push(chunk as Buffer);
    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="respaldo${tag}-${stamp}.zip"`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Backup failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * SQLite query builder that mimics the subset of supabase-js used in this project.
 * Returns { data, error } with the same shape supabase-js returns.
 * Replaces: sb() from crud.ts
 */
import { randomUUID } from 'crypto';
import { getDb } from './sqlite';

/**
 * Every table in schema.sql declares `id text PRIMARY KEY`, which in SQLite is
 * NOT auto-generated and — unlike INTEGER PRIMARY KEY — still accepts NULL.
 * A route that inserts without an id therefore silently produces NULL-id rows
 * that collide with each other on lookup. Generate one whenever it is missing.
 */
const _hasIdCache = new Map<string, boolean>();
function tableHasId(table: string): boolean {
  const cached = _hasIdCache.get(table);
  if (cached !== undefined) return cached;
  let has = false;
  try {
    const cols = getDb().prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
    has = cols.some(c => c.name === 'id');
  } catch { /* unknown table — leave the row untouched */ }
  _hasIdCache.set(table, has);
  return has;
}

function withId(table: string, row: Record<string, unknown>): Record<string, unknown> {
  if (row.id !== undefined && row.id !== null && row.id !== '') return row;
  if (!tableHasId(table)) return row;   // e.g. congregation_roles (composite PK)
  return { ...row, id: randomUUID() };
}

// Columns that contain JSON (stored as text in SQLite, auto-parsed on read)
const JSON_COLUMNS: Record<string, string[]> = {
  users: ['permissions'],
  public_speakers: ['outline_numbers'],
  territories: ['coordinates'],
  congregation_tasks: ['assignments'],
  cleaning_assignments: ['assignments'],
  maintenance_tasks: ['assigned_to'],
  circuit_overseer_visits: ['co_companions', 'wife_companions', 'activities'],
  memorial_roles: ['assigned_to'],
  congregations: ['enabled_modules'],
  field_service_reports: [],
};

function parseRow(table: string, row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null;
  const cols = JSON_COLUMNS[table] ?? [];
  const out: Record<string, unknown> = { ...row };
  for (const col of cols) {
    if (typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col] as string); } catch { /* keep raw */ }
    }
  }
  // boolean coercion: SQLite stores 0/1
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'number' && (v === 0 || v === 1)) {
      // leave numeric — callers handle truthy checks; explicit bool cast only for
      // known bool columns would require a large map. Callers already use !! or Boolean().
    }
  }
  return out;
}

function serializeValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v) || (v !== null && typeof v === 'object')) return JSON.stringify(v);
  return v;
}

function serializeRow(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = serializeValue(v);
  return out;
}

type Filter = { col: string; op: string; val: unknown };

interface QueryState {
  table: string;
  cols: string;
  filters: Filter[];
  orderCol: string | null;
  orderAsc: boolean;
  limitN: number | null;
  verb: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  upsertConflict: string | string[] | null;
  returnSingle: boolean;
  returnMaybe: boolean;
  doSelect: boolean; // whether .select() was chained after insert/update
}

class QueryBuilder {
  private s: QueryState;

  constructor(table: string) {
    this.s = {
      table,
      cols: '*',
      filters: [],
      orderCol: null,
      orderAsc: true,
      limitN: null,
      verb: 'select',
      data: null,
      upsertConflict: null,
      returnSingle: false,
      returnMaybe: false,
      doSelect: false,
    };
  }

  select(cols = '*') { this.s.cols = cols; this.s.verb = 'select'; return this; }
  insert(rows: Record<string, unknown> | Record<string, unknown>[]) { this.s.verb = 'insert'; this.s.data = rows; return this; }
  update(patch: Record<string, unknown>) { this.s.verb = 'update'; this.s.data = patch; return this; }
  upsert(rows: Record<string, unknown> | Record<string, unknown>[], opts?: { onConflict?: string | string[] }) {
    this.s.verb = 'upsert'; this.s.data = rows;
    this.s.upsertConflict = opts?.onConflict ?? null;
    return this;
  }
  delete() { this.s.verb = 'delete'; return this; }

  eq(col: string, val: unknown) { this.s.filters.push({ col, op: '=', val }); return this; }
  neq(col: string, val: unknown) { this.s.filters.push({ col, op: '!=', val }); return this; }
  in(col: string, vals: unknown[]) { this.s.filters.push({ col, op: 'IN', val: vals }); return this; }
  gte(col: string, val: unknown) { this.s.filters.push({ col, op: '>=', val }); return this; }
  lte(col: string, val: unknown) { this.s.filters.push({ col, op: '<=', val }); return this; }
  ilike(col: string, val: unknown) { this.s.filters.push({ col, op: 'LIKE', val: String(val).replace(/%/g, '%') }); return this; }
  not(col: string, op: string, val: unknown) {
    if (op === 'is') this.s.filters.push({ col, op: 'IS NOT', val });
    else this.s.filters.push({ col, op: `NOT ${op.toUpperCase()}`, val });
    return this;
  }
  is(col: string, val: unknown) { this.s.filters.push({ col, op: 'IS', val }); return this; }

  or(dsl: string) {
    // parse "col.op.val,col2.op.val2" mini-DSL
    const parts = dsl.split(',').map(p => p.trim());
    const clauses: string[] = [];
    const params: unknown[] = [];
    for (const part of parts) {
      const dot1 = part.indexOf('.');
      if (dot1 < 0) continue;
      const col = part.slice(0, dot1);
      const rest = part.slice(dot1 + 1);
      const dot2 = rest.indexOf('.');
      if (dot2 < 0) continue;
      const op = rest.slice(0, dot2);
      const val = rest.slice(dot2 + 1);
      if (op === 'eq') { clauses.push(`"${col}" = ?`); params.push(val); }
      else if (op === 'neq') { clauses.push(`"${col}" != ?`); params.push(val); }
      else if (op === 'is') { clauses.push(val === 'null' ? `"${col}" IS NULL` : `"${col}" IS ?`); if (val !== 'null') params.push(val); }
    }
    if (clauses.length) this.s.filters.push({ col: `(${clauses.join(' OR ')})`, op: 'RAW', val: params });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.s.orderCol = col;
    this.s.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) { this.s.limitN = n; return this; }
  single() { this.s.returnSingle = true; this.s.limitN = 1; return this.exec() as Promise<{ data: Record<string, unknown> | null; error: { code: string; message: string } | null }>; }
  maybeSingle() { this.s.returnMaybe = true; this.s.limitN = 1; return this.exec(); }

  // chainable .select() after insert/update/upsert → return inserted/updated rows
  selectAfter(cols = '*') { this.s.doSelect = true; this.s.cols = cols; return this; }

  // Intercept .select() calls that come AFTER insert/update/delete
  // supabase-js pattern: sb().from('t').insert(row).select().single()
  // We need to detect this. Override select when verb is not 'select'.
  private _buildWhere(): { sql: string; params: unknown[] } {
    const params: unknown[] = [];
    const parts: string[] = [];
    for (const f of this.s.filters) {
      if (f.op === 'RAW') {
        parts.push(f.col);
        params.push(...(f.val as unknown[]));
      } else if (f.op === 'IN') {
        const arr = f.val as unknown[];
        if (!arr.length) { parts.push('0=1'); continue; }
        parts.push(`"${f.col}" IN (${arr.map(() => '?').join(',')})`);
        params.push(...arr);
      } else if (f.op === 'IS' || f.op === 'IS NOT') {
        parts.push(`"${f.col}" ${f.op} ${f.val === null || f.val === 'null' ? 'NULL' : '?'}`);
        if (f.val !== null && f.val !== 'null') params.push(f.val);
      } else {
        parts.push(`"${f.col}" ${f.op} ?`);
        params.push(serializeValue(f.val));
      }
    }
    return { sql: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async exec(): Promise<{ data: any; error: any }> {
    try {
      const db = getDb();
      const { table, verb } = this.s;
      const { sql: where, params } = this._buildWhere();

      if (verb === 'select') {
        let sql = `SELECT ${this.s.cols === '*' ? '*' : this.s.cols} FROM "${table}"${where}`;
        if (this.s.orderCol) sql += ` ORDER BY "${this.s.orderCol}" ${this.s.orderAsc ? 'ASC' : 'DESC'}`;
        if (this.s.limitN !== null) sql += ` LIMIT ${this.s.limitN}`;
        const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
        const parsed = rows.map(r => parseRow(table, r) as Record<string, unknown>);
        if (this.s.returnSingle) {
          if (!parsed.length) return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
          return { data: parsed[0], error: null };
        }
        if (this.s.returnMaybe) {
          return { data: parsed[0] ?? null, error: null };
        }
        return { data: parsed, error: null };
      }

      if (verb === 'insert') {
        const rows = (Array.isArray(this.s.data) ? this.s.data : [this.s.data!])
          .map(r => withId(table, r as Record<string, unknown>));
        const inserted: Record<string, unknown>[] = [];
        for (const row of rows) {
          const ser = serializeRow(row as Record<string, unknown>);
          const cols = Object.keys(ser);
          let sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
          if (this.s.doSelect || this.s.returnSingle || this.s.returnMaybe) {
            sql += ` RETURNING *`;
            const r = db.prepare(sql).get(...(cols.map(c => ser[c]))) as Record<string, unknown> | undefined;
            if (r) inserted.push(parseRow(table, r) as Record<string, unknown>);
          } else {
            db.prepare(sql).run(...(cols.map(c => ser[c])));
          }
        }
        if (this.s.returnSingle) {
          if (!inserted.length) return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
          return { data: inserted[0], error: null };
        }
        if (this.s.returnMaybe) return { data: inserted[0] ?? null, error: null };
        if (this.s.doSelect) return { data: inserted, error: null };
        return { data: null, error: null };
      }

      if (verb === 'update') {
        const patch = serializeRow(this.s.data as Record<string, unknown>);
        const cols = Object.keys(patch);
        if (!cols.length) return { data: null, error: null };
        let sql = `UPDATE "${table}" SET ${cols.map(c => `"${c}" = ?`).join(',')}${where}`;
        if (this.s.doSelect || this.s.returnSingle || this.s.returnMaybe) {
          sql += ` RETURNING *`;
          const rows = db.prepare(sql).all(...cols.map(c => patch[c]), ...params) as Record<string, unknown>[];
          const parsed = rows.map(r => parseRow(table, r) as Record<string, unknown>);
          if (this.s.returnSingle) {
            if (!parsed.length) return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
            return { data: parsed[0], error: null };
          }
          if (this.s.returnMaybe) return { data: parsed[0] ?? null, error: null };
          return { data: parsed, error: null };
        }
        db.prepare(sql).run(...cols.map(c => patch[c]), ...params);
        return { data: null, error: null };
      }

      if (verb === 'upsert') {
        const rows = (Array.isArray(this.s.data) ? this.s.data : [this.s.data!])
          .map(r => withId(table, r as Record<string, unknown>));
        const upserted: Record<string, unknown>[] = [];
        const rawConflict = Array.isArray(this.s.upsertConflict)
          ? this.s.upsertConflict.join(',')
          : (this.s.upsertConflict ?? 'id');
        const conflictCols = rawConflict
          .split(',')
          .map(c => c.trim().replace(/^["'`]|["'`]$/g, ''))
          .filter(Boolean);
        const conflictSet = new Set([...conflictCols, 'id', 'created_at']);
        const conflictClause = conflictCols.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const ser = serializeRow(row as Record<string, unknown>);
          const cols = Object.keys(ser);
          const updateCols = cols.filter(c => !conflictSet.has(c));
          let sql = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
          if (updateCols.length) {
            sql += ` ON CONFLICT(${conflictClause}) DO UPDATE SET ${updateCols.map(c => `"${c}" = excluded."${c}"`).join(',')}`;
          } else {
            sql += ` ON CONFLICT(${conflictClause}) DO NOTHING`;
          }

          if (this.s.doSelect || this.s.returnSingle || this.s.returnMaybe) {
            sql += ` RETURNING *`;
            const r = db.prepare(sql).get(...cols.map(c => ser[c])) as Record<string, unknown> | undefined;
            if (r) upserted.push(parseRow(table, r) as Record<string, unknown>);
          } else {
            db.prepare(sql).run(...cols.map(c => ser[c]));
          }
        }
        if (this.s.returnSingle) {
          if (!upserted.length) return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
          return { data: upserted[0], error: null };
        }
        if (this.s.returnMaybe) return { data: upserted[0] ?? null, error: null };
        if (this.s.doSelect) return { data: upserted, error: null };
        return { data: null, error: null };
      }

      if (verb === 'delete') {
        const sql = `DELETE FROM "${table}"${where}`;
        db.prepare(sql).run(...params);
        return { data: null, error: null };
      }

      return { data: null, error: { code: 'UNKNOWN_VERB', message: 'Unknown verb' } };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { data: null, error: { code: 'DB_ERROR', message: msg } };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<T>(resolve: (v: { data: any; error: any }) => T, reject?: (e: unknown) => T) {
    return this.exec().then(resolve, reject);
  }
}

// Intercept .select() chained after insert/update/delete verbs
const _origSelect = QueryBuilder.prototype.select;
QueryBuilder.prototype.select = function(cols = '*') {
  if (this['s'].verb !== 'select') {
    this['s'].doSelect = true;
    this['s'].cols = cols;
    return this;
  }
  return _origSelect.call(this, cols);
};

export function dbClient() {
  return {
    from(table: string) { return new QueryBuilder(table); },
  };
}

/**
 * Control de FK para operaciones masivas (restore de respaldos).
 *
 * El restore inserta tablas en bloques y el orden padre→hijo no siempre es
 * posible (p. ej. dumps que no incluyen `congregations` pero sí `users`).
 * Desactivar FK durante toda la operación evita fallos intermedios que dejan
 * la base destruida a medias; `foreignKeyCheck()` reporta al final cualquier
 * inconsistencia real que haya quedado.
 */
export function setForeignKeys(on: boolean): void {
  getDb().pragma(`foreign_keys = ${on ? 'ON' : 'OFF'}`);
}

/** Filas que violan FK con las FK activadas ([] = consistente). */
export function foreignKeyCheck(): { table: string; rowid: number; parent: string; fkid: number }[] {
  try {
    return getDb().prepare('PRAGMA foreign_key_check').all() as
      { table: string; rowid: number; parent: string; fkid: number }[];
  } catch { return []; }
}

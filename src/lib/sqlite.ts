import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'msp.db');
const SCHEMA_PATH = path.join(process.cwd(), 'src', 'lib', 'schema.sql');

let _db: Database.Database | null = null;

/** ¿Existe la tabla? */
function hasTable(db: Database.Database, name: string): boolean {
  return !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`
  ).get(name);
}

/** Columnas de una tabla. Vacío si no existe. */
function columnsOf(db: Database.Database, table: string): string[] {
  try {
    return (db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map(c => c.name);
  } catch { return []; }
}

/**
 * Divide un script SQL en sentencias respetando cadenas y bloques
 * CREATE TRIGGER ... BEGIN ... END; (donde el `;` interno no termina nada).
 */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];

    if (quote) {
      buf += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; buf += c; continue; }

    // Comentario de línea
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      buf += '\n';
      continue;
    }

    if (c === ';') {
      // Dentro de un CREATE TRIGGER, el `;` solo cierra tras el END.
      const isTrigger = /create\s+trigger/i.test(buf);
      if (isTrigger && !/\bend\b\s*$/i.test(buf.trim())) { buf += c; continue; }
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * Aplica el schema tolerando fallos de sentencias sueltas.
 *
 * `exec()` aborta el script completo en el primer error, y el schema es
 * idempotente pero no está ordenado por dependencias: un índice que referencia
 * una columna aún inexistente impedía crear todas las tablas posteriores. Se
 * intenta primero la vía rápida; si falla, se reejecuta sentencia a sentencia
 * para que un fallo aislado no deje media base sin crear.
 */
function execSchema(db: Database.Database, schema: string) {
  try {
    db.exec(schema);
    return;
  } catch {
    // Continúa abajo, sentencia por sentencia.
  }

  const failures: string[] = [];
  for (const stmt of splitStatements(schema)) {
    try { db.exec(stmt); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // «ya existe» es esperado en un schema idempotente.
      if (/already exists|duplicate column/i.test(msg)) continue;
      failures.push(`${msg} — ${stmt.slice(0, 90).replace(/\s+/g, ' ')}…`);
    }
  }

  if (failures.length) {
    console.error(
      `[sqlite] ${failures.length} sentencia(s) del schema fallaron:\n  ` +
      failures.join('\n  ')
    );
  }
}

/**
 * Migra las tablas de Cuentas de la forma inicial a la definitiva.
 *
 * La primera versión usaba etiquetas en español (`entrada`/`recibido`) y las
 * columnas `destination_account` / `ct_code`. La definitiva replica los enums
 * del programa legacy (`income`/`caja`, `to_account`, `code`) para poder
 * reimportar sus respaldos sin traducir. Se migran los datos, no se descartan.
 */
function migrateCuentasLegacy(db: Database.Database) {
  const TYPE: Record<string, string> = { entrada: 'income', salida: 'expense', transferencia: 'transfer' };
  const ACCT: Record<string, string> = { recibido: 'caja', principal: 'corriente', secundaria: 'sucursal' };

  // ── cuentas_transactions: forma vieja → definitiva ──
  const txCols = columnsOf(db, 'cuentas_transactions');
  if (txCols.length && txCols.includes('destination_account') && !txCols.includes('to_account')) {
    const rows = db.prepare(`SELECT * FROM cuentas_transactions`).all() as Record<string, unknown>[];

    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE cuentas_transactions_new (
          id              text PRIMARY KEY,
          date            text NOT NULL,
          type            text NOT NULL CHECK (type IN ('income','expense','transfer')),
          account         text NOT NULL CHECK (account IN ('caja','corriente','sucursal')),
          to_account      text CHECK (to_account IN ('caja','corriente','sucursal')),
          code            text,
          description     text NOT NULL,
          amount          real NOT NULL CHECK (amount > 0),
          receipt_ref     text,
          notes           text,
          created_by      text REFERENCES users(id) ON DELETE SET NULL,
          created_at      text DEFAULT (datetime('now')),
          updated_at      text DEFAULT (datetime('now')),
          congregation_id text REFERENCES congregations(id)
        )`);

      const ins = db.prepare(`
        INSERT INTO cuentas_transactions_new
          (id, date, type, account, to_account, code, description, amount,
           receipt_ref, notes, created_by, created_at, updated_at, congregation_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

      for (const r of rows) {
        const type = TYPE[String(r.type)] ?? String(r.type);
        const account = ACCT[String(r.account)] ?? String(r.account);
        const dest = r.destination_account ? (ACCT[String(r.destination_account)] ?? String(r.destination_account)) : null;
        ins.run(
          r.id, r.date, type, account, dest, r.ct_code ?? null,
          r.description, r.amount, r.receipt_ref ?? null, r.notes ?? null,
          r.created_by ?? null, r.created_at ?? null, r.updated_at ?? null,
          r.congregation_id ?? null,
        );
      }

      db.exec(`DROP TABLE cuentas_transactions`);
      db.exec(`ALTER TABLE cuentas_transactions_new RENAME TO cuentas_transactions`);
      db.exec('COMMIT');
      console.error(`[sqlite] cuentas_transactions migrada (${rows.length} fila(s))`);
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // ── cuentas_ct_codes → cuentas_codes ──
  if (hasTable(db, 'cuentas_ct_codes')) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cuentas_codes (
          id              text PRIMARY KEY,
          code            text NOT NULL,
          description     text NOT NULL,
          kind            text NOT NULL DEFAULT 'income'
                          CHECK (kind IN ('income','expense','transfer')),
          sort_order      integer DEFAULT 0,
          congregation_id text REFERENCES congregations(id),
          UNIQUE(code, congregation_id)
        )`);

      const old = db.prepare(`SELECT * FROM cuentas_ct_codes`).all() as Record<string, unknown>[];
      const ins = db.prepare(`
        INSERT OR IGNORE INTO cuentas_codes (id, code, description, kind, sort_order, congregation_id)
        VALUES (?,?,?,?,?,?)`);

      for (const r of old) {
        ins.run(
          r.id, r.code, r.description,
          TYPE[String(r.default_type)] ?? 'income',
          r.sort_order ?? 0, r.congregation_id ?? null,
        );
      }

      db.exec(`DROP TABLE cuentas_ct_codes`);
      console.error(`[sqlite] cuentas_ct_codes migrada a cuentas_codes (${old.length} fila(s))`);
    } catch (e) {
      console.error('[sqlite] no se pudo migrar cuentas_ct_codes:', e instanceof Error ? e.message : e);
    }
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('cache_size = -8000');  // 8 MB page cache
  _db.pragma('synchronous = NORMAL'); // safe with WAL

  // Las tablas de Cuentas cambiaron de forma después de un despliegue previo.
  // Debe correr ANTES del schema: si no, el índice sobre la columna nueva
  // `code` falla contra la tabla vieja y aborta el resto del script.
  migrateCuentasLegacy(_db);

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  execSchema(_db, schema);

  // Runtime migrations for columns added after initial schema deployment
  const runMigrations = [
    `ALTER TABLE public_talk_outlines ADD COLUMN theme text`,
    // Territory extras
    `ALTER TABLE territories ADD COLUMN pairs_count integer`,
    `ALTER TABLE territories ADD COLUMN completion_hours real`,
    `ALTER TABLE territories ADD COLUMN completion_houses integer`,
    `ALTER TABLE territories ADD COLUMN last_notified_at text`,
    `ALTER TABLE territories ADD COLUMN last_weekly_at text`,
    `ALTER TABLE territory_assignments ADD COLUMN pairs_count integer`,
    `ALTER TABLE territory_assignments ADD COLUMN completion_hours real`,
    `ALTER TABLE territory_assignments ADD COLUMN completion_houses integer`,
    // Congregation settings multi-tenant isolation
    `ALTER TABLE congregation_settings ADD COLUMN owning_congregation_id text`,
    // Telegram sync columns
    `ALTER TABLE messaging_settings ADD COLUMN telegram_enabled integer NOT NULL DEFAULT 0`,
    `ALTER TABLE messaging_settings ADD COLUMN telegram_bot_token text`,
    `ALTER TABLE messaging_settings ADD COLUMN telegram_chat_id text`,
    `ALTER TABLE messaging_settings ADD COLUMN telegram_notify_on_assign integer NOT NULL DEFAULT 1`,
    `ALTER TABLE messaging_settings ADD COLUMN telegram_notify_overdue integer NOT NULL DEFAULT 1`,
    `ALTER TABLE messaging_settings ADD COLUMN telegram_notify_weekly_status integer NOT NULL DEFAULT 1`,
    `ALTER TABLE messaging_settings ADD COLUMN telegram_weekly_dow integer NOT NULL DEFAULT 1`,
    // Parámetros del cierre de mes de Cuentas (añadidos tras el despliegue inicial)
    `ALTER TABLE cuentas_config ADD COLUMN remit_code text NOT NULL DEFAULT 'SOM'`,
    `ALTER TABLE cuentas_config ADD COLUMN res_pub_code text NOT NULL DEFAULT 'RM'`,
    `ALTER TABLE cuentas_config ADD COLUMN res_pub_amount real NOT NULL DEFAULT 0`,
    `ALTER TABLE cuentas_config ADD COLUMN res_pct_code text NOT NULL DEFAULT 'RM'`,
    `ALTER TABLE cuentas_config ADD COLUMN res_pct_percent real NOT NULL DEFAULT 10`,
    `ALTER TABLE cuentas_config ADD COLUMN res_pct_source text NOT NULL DEFAULT 'C'`,
    // Clave de IA por congregación para la lectura de recibos (agente Telegram).
    // Tiene prioridad sobre GEMINI_API_KEY global del servidor.
    `ALTER TABLE cuentas_config ADD COLUMN ai_api_key text`,
  ];
  for (const sql of runMigrations) {
    try { _db.exec(sql); } catch { /* column already exists */ }
  }

  // `weekend_meetings` shipped with a global `UNIQUE(date)`, which made the date
  // space shared across congregations: the second congregation to claim a week
  // collided with the first and could never create it. SQLite cannot drop a
  // constraint, so the table is rebuilt. Guarded on the constraint text so this
  // runs exactly once, and column names are listed explicitly — `SELECT *` would
  // break as soon as a later migration adds a column.
  try {
    const row = _db.prepare(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='weekend_meetings'`
    ).get() as { sql: string } | undefined;

    if (row && !row.sql.includes('UNIQUE(date, congregation_id)')) {
      const COLS = [
        'id', 'date', 'speaker_type', 'local_speaker_id', 'visiting_speaker_id',
        'other_speaker_name', 'outline_id', 'special_talk_title', 'song',
        'speaker_confirmed', 'notes', 'chairman_id', 'wt_conductor_id',
        'wt_reader_id', 'hospitality_person_id', 'hospitality_text',
        'created_at', 'updated_at', 'cleaning_group', 'congregation_id',
      ];
      const present = new Set(
        (_db.prepare(`PRAGMA table_info(weekend_meetings)`).all() as { name: string }[]).map(c => c.name)
      );
      const carried = COLS.filter(c => present.has(c));

      _db.pragma('foreign_keys = OFF');
      _db.exec('BEGIN');
      try {
        _db.exec(`
          CREATE TABLE weekend_meetings_new (
            id                   text PRIMARY KEY,
            date                 text NOT NULL,
            speaker_type         text DEFAULT 'local',
            local_speaker_id     text REFERENCES users(id) ON DELETE SET NULL,
            visiting_speaker_id  text REFERENCES public_speakers(id) ON DELETE SET NULL,
            other_speaker_name   text,
            outline_id           text REFERENCES public_talk_outlines(id) ON DELETE SET NULL,
            special_talk_title   text,
            song                 integer,
            speaker_confirmed    integer DEFAULT 0,
            notes                text,
            chairman_id          text REFERENCES users(id) ON DELETE SET NULL,
            wt_conductor_id      text REFERENCES users(id) ON DELETE SET NULL,
            wt_reader_id         text REFERENCES users(id) ON DELETE SET NULL,
            hospitality_person_id text REFERENCES users(id) ON DELETE SET NULL,
            hospitality_text     text,
            created_at           text DEFAULT (datetime('now')),
            updated_at           text DEFAULT (datetime('now')),
            cleaning_group       text,
            congregation_id      text REFERENCES congregations(id),
            UNIQUE(date, congregation_id)
          )`);
        const list = carried.join(', ');
        _db.exec(`INSERT INTO weekend_meetings_new (${list}) SELECT ${list} FROM weekend_meetings`);
        _db.exec(`DROP TABLE weekend_meetings`);
        _db.exec(`ALTER TABLE weekend_meetings_new RENAME TO weekend_meetings`);
        _db.exec(`CREATE INDEX IF NOT EXISTS idx_weekend_congre ON weekend_meetings(congregation_id)`);
        _db.exec('COMMIT');
      } catch (e) {
        _db.exec('ROLLBACK');
        throw e;
      } finally {
        _db.pragma('foreign_keys = ON');
      }
    }
  } catch { /* best effort — never block startup */ }

  // Repair rows written before db.ts generated ids. `id text PRIMARY KEY` is not
  // auto-populated by SQLite and (outside STRICT tables) still accepts NULL, so
  // any route that inserted without an id produced colliding NULL-id rows.
  try {
    const tables = _db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    ).all() as { name: string }[];
    for (const { name } of tables) {
      const cols = _db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[];
      if (!cols.some(c => c.name === 'id')) continue;
      const orphans = _db.prepare(`SELECT rowid FROM "${name}" WHERE id IS NULL OR id = ''`).all() as { rowid: number }[];
      for (const { rowid } of orphans) {
        _db.prepare(`UPDATE "${name}" SET id = ? WHERE rowid = ?`).run(randomUUID(), rowid);
      }
    }
  } catch { /* best effort — never block startup */ }

  return _db;
}

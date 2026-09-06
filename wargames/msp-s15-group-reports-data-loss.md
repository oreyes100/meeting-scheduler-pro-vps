# War-game: Group Reports Data Loss Investigation & Resolution
> Target: https://micongre.duckdns.org/group-reports
> Root Cause: SQLite identifier quoting in composite `ON CONFLICT` clause in `QueryBuilder.upsert` + disconnected `SyncStatus` + silent error handling.

## 1. Mission Objective
Ensure that data entered into the group reports interface (`/group-reports`) is persistently saved to the local SQLite database (`data/msp.db`) on the VPS, that errors are never silenced, that `SyncStatus` accurately reflects pending and failed saves, and that `upsert` queries across the application with composite keys work flawlessly.

---

## 2. Root Cause Analysis (War-Room Recon)

### Defect 1: Broken SQLite `ON CONFLICT` Query Generation (`src/lib/db.ts`)
- In `src/lib/db.ts`, `QueryBuilder.upsert` received `onConflict: 'user_id,month'`.
- The code generated:
  ```sql
  ON CONFLICT("${conflict}")
  ```
  which resolved to:
  ```sql
  ON CONFLICT("user_id,month")
  ```
- **The Failure:** In SQLite, `"user_id,month"` in double quotes is parsed as a **single column identifier** named `user_id,month`. SQLite fails immediately with:
  `SqliteError: no such column: "user_id,month"`
- This caused `exec()` in `db.ts` to return `{ data: null, error: { code: 'DB_ERROR', ... } }`, causing `POST /api/field-service-reports` to fail with HTTP 500.
- The same defect broke every other composite upsert in the system:
  - `cleaning-assignments` (`week_date,congregation_id`)
  - `congregation-tasks` (`week_date,congregation_id`)
  - `attendance` (`meeting_date,meeting_type,congregation_id`)

### Defect 2: Primary Key Churn and Missing Row Lookup
- When updating an existing row without an `id` in the payload, `withId()` generated a new random UUID.
- Because `updateCols` didn't exclude `id`, SQLite either threw a constraint violation or `db.prepare("SELECT * FROM table WHERE id = ?").get(row.id)` returned `undefined` because the row retained its original `id`.
- As a consequence, `select().single()` returned `PGRST116: No rows found`.

### Defect 3: Disconnected `SyncStatus` & Optimistic UI Masking Failure
- `SyncStatus` was placed on `/group-reports` as `<SyncStatus />` without any props.
- `SyncStatus` defaulted to querying `/api/health`. Because `/api/health` returned 200, the sync dot stayed **green** ("Sincronizado"), misleading the user into thinking their report had been saved.
- `fetchData()` and `saveReport()` in `group-reports/page.tsx` contained empty `catch { /* ignore */ }` blocks, discarding server 500 errors and leaving only optimistic local state that vanished upon page refresh.

---

## 3. The 5 Reproduction Scenarios & Mitigations

1. **Fallo de red / Servidor 500 durante envío:**
   - *Previous:* Silenced in catch; UI stayed changed until page reload; user lost data.
   - *Fixed:* `saveError` state added, red notification banner displayed with "Reintentar" action, `SyncStatus` reflects unsaved changes.
2. **Envíos concurrentes / Doble clic:**
   - *Fixed:* `setSaving(r.user_id)` tracks pending requests; SQLite WAL mode with `busy_timeout = 5000` and `RETURNING *` executes atomic upserts.
3. **Inserción parcial (sin id existente o claves compuestas):**
   - *Fixed:* `QueryBuilder.upsert` parses composite conflict columns (`user_id`, `month`), excludes `id` and `created_at` from `DO UPDATE SET`, and uses native SQLite `RETURNING *` to return the complete row.
4. **Filtro de congregación (Multi-tenant):**
   - *Fixed:* Tolerates `congregation_id IS NULL` for legacy reports so existing data is never hidden or orphaned.
5. **App móvil / offline:**
   - *Fixed:* `SyncStatus` properly binds to `pending={!!saving || !!saveError}`.

---

## 4. Verification Checklist

- [x] Tested `INSERT ... ON CONFLICT("user_id", "month") DO UPDATE SET ... RETURNING *` in SQLite. Verified that existing `id` is retained, fields update correctly, and the full row is returned.
- [x] Verified composite key parsing for single string (`user_id,month`), spaced string (`user_id, month`), and array (`['user_id', 'month']`).
- [x] Fixed `src/lib/db.ts` with `RETURNING *` support on `insert`, `update`, and `upsert`.
- [x] Normalized booleans (`participated`, `is_auxiliary_pioneer`) in `field-service-reports` API.
- [x] Connected `SyncStatus` in `/group-reports` with `pending={!!saving || !!saveError}` and added visible error alert.
- [x] Ran `npm run build` cleanly (Turbopack + TypeScript checks passed).

-- SQLite schema for meeting-scheduler-pro VPS variant
-- Translated from 24 Postgres migrations.
-- Rules: uuid→text, jsonb→text(JSON), timestamptz→text(ISO-8601),
--        date→text(YYYY-MM-DD), time→text, bool→integer(0/1),
--        arrays→text(JSON), gen_random_uuid()→app-generated,
--        auth.users FK removed (users is now root of auth).
-- Bootstrap: idempotent (CREATE TABLE IF NOT EXISTS throughout).

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ─── 1. CONGREGATIONS (root, no deps) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS congregations (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  city           text,
  enabled        integer NOT NULL DEFAULT 1,
  enabled_modules text,  -- JSON array of module keys
  boundary       text,   -- JSON polygon [{lat,lng},...] for territory-madre (Move 7)
  created_at     text DEFAULT (datetime('now'))
);

-- ─── 2. PUBLIC TALK OUTLINES (no deps) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_talk_outlines (
  id         text PRIMARY KEY,
  number     integer NOT NULL,
  title      text NOT NULL,
  theme      text,
  created_at text DEFAULT (datetime('now')),
  updated_at text DEFAULT (datetime('now')),
  UNIQUE(number)
);

-- ─── 3. USERS (→ congregations) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                         text PRIMARY KEY,
  name                       text NOT NULL,
  email                      text NOT NULL,
  available_start            text,
  available_end              text,
  first_name                 text,
  middle_name                text,
  last_name                  text,
  suffix                     text,
  phone1                     text,
  phone2                     text,
  address                    text,
  lat_lng                    text,
  email1                     text,
  email2                     text,
  gender                     text DEFAULT 'male' CHECK (gender IN ('male','female')),
  date_of_birth              text,
  family_id                  text,
  is_family_head             integer DEFAULT 0,
  notes                      text,
  is_active                  integer DEFAULT 1,
  is_publisher               integer DEFAULT 1,
  is_unbaptized_publisher    integer DEFAULT 0,
  is_elder                   integer DEFAULT 0,
  is_ministerial_servant     integer DEFAULT 0,
  is_regular_pioneer         integer DEFAULT 0,
  is_auxiliary_pioneer       integer DEFAULT 0,
  is_special_pioneer         integer DEFAULT 0,
  auxiliary_pioneer_this_month integer DEFAULT 0,
  is_elderly                 integer DEFAULT 0,
  is_infirm                  integer DEFAULT 0,
  is_child                   integer DEFAULT 0,
  is_deaf                    integer DEFAULT 0,
  is_blind                   integer DEFAULT 0,
  is_anointed                integer DEFAULT 0,
  has_kh_key                 integer DEFAULT 0,
  is_ldc_volunteer           integer DEFAULT 0,
  reports_directly_to_branch integer DEFAULT 0,
  custom_information         integer DEFAULT 0,
  custom_spiritual_1         integer DEFAULT 0,
  custom_spiritual_2         integer DEFAULT 0,
  custom_spiritual_3         integer DEFAULT 0,
  custom_spiritual_4         integer DEFAULT 0,
  custom_spiritual_5         integer DEFAULT 0,
  custom_spiritual_6         integer DEFAULT 0,
  disable_app_access         integer DEFAULT 0,
  status                     text DEFAULT 'active' CHECK (status IN ('active','moved','removed')),
  moved_date                 text,
  moved_to_congregation      text,
  display_name               text,
  can_be_chairman            integer DEFAULT 0,
  can_be_speaker             integer DEFAULT 0,
  can_do_gems                integer DEFAULT 0,
  can_do_bible_reading       integer DEFAULT 0,
  can_do_student_parts       integer DEFAULT 0,
  can_be_assistant           integer DEFAULT 0,
  can_do_prayers             integer DEFAULT 0,
  can_be_cbs_conductor       integer DEFAULT 0,
  can_be_cbs_reader          integer DEFAULT 0,
  can_give_public_talk       integer DEFAULT 0,
  speaker_local              integer DEFAULT 1,
  speaker_visiting           integer DEFAULT 0,
  app_role                   text DEFAULT 'publisher',
  permissions                text DEFAULT '[]',  -- JSON array of module keys
  auth_email                 text,
  username                   text,
  congregation_id            text REFERENCES congregations(id),
  is_super_admin             integer NOT NULL DEFAULT 0,
  password_hash              text,               -- bcrypt hash (replaces GoTrue)
  UNIQUE(email),
  UNIQUE(username)
);

CREATE INDEX IF NOT EXISTS idx_users_last_name   ON users(lower(last_name));
CREATE INDEX IF NOT EXISTS idx_users_first_name  ON users(lower(first_name));
CREATE INDEX IF NOT EXISTS idx_users_status      ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_gender      ON users(gender);
CREATE INDEX IF NOT EXISTS idx_users_is_active   ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_auth_email  ON users(auth_email);

-- ─── 4. PUBLIC SPEAKERS (→ congregations) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public_speakers (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  congregation    text NOT NULL,
  city            text,
  phone           text,
  email           text,
  outline_numbers text DEFAULT '[]',  -- JSON int array
  notes           text,
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);

-- ─── 5. MEETINGS (→ users, congregations) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id                 text PRIMARY KEY,
  title              text NOT NULL,
  date               text,
  duration_minutes   integer,
  created_by         text REFERENCES users(id),
  chairman_id        text REFERENCES users(id),
  opening_prayer_id  text REFERENCES users(id),
  closing_prayer_id  text REFERENCES users(id),
  cbs_conductor_id   text REFERENCES users(id),
  cbs_reader_id      text REFERENCES users(id),
  song_opening       integer,
  song_middle        integer,
  song_closing       integer,
  is_published       integer DEFAULT 0,
  cleaning_group     text,
  assembly_type      text,
  congregation_id    text REFERENCES congregations(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS meetings_date_congre_key ON meetings(date, congregation_id);

-- ─── 6. MEETING PARTS (→ meetings, users) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_parts (
  id                 text PRIMARY KEY,
  meeting_id         text REFERENCES meetings(id),
  role               text NOT NULL,
  assigned_user_id   text REFERENCES users(id),
  class_type         text DEFAULT 'main' CHECK (class_type IN ('main','aux_1','aux_2')),
  part_number        integer,
  part_type          text DEFAULT 'student_part',
  title              text,
  duration_minutes   integer DEFAULT 5,
  assistant_user_id  text REFERENCES users(id) ON DELETE SET NULL,
  study_point        text,
  student_part_type  text,
  location           text,
  details            text,
  requires_assistant integer DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_meeting_parts_meeting_id ON meeting_parts(meeting_id);

-- ─── 7. PART HISTORY (→ meeting_parts, meetings, users) ──────────────────────
CREATE TABLE IF NOT EXISTS part_history (
  id              text PRIMARY KEY,
  meeting_part_id text REFERENCES meeting_parts(id) ON DELETE CASCADE,
  meeting_id      text REFERENCES meetings(id) ON DELETE CASCADE,
  user_id         text REFERENCES users(id),
  assigned_at     text DEFAULT (datetime('now')),
  role            text NOT NULL,
  class_type      text,
  part_type       text,
  assigned_date   text
);

CREATE INDEX IF NOT EXISTS idx_part_history_user_parttype_date ON part_history(user_id, part_type, assigned_date);
CREATE INDEX IF NOT EXISTS idx_part_history_assigned_at        ON part_history(assigned_at);
CREATE INDEX IF NOT EXISTS idx_part_history_meeting_part       ON part_history(meeting_part_id);

-- ─── 8. PART SNAPSHOTS (→ meetings) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS part_snapshots (
  id            text PRIMARY KEY,
  meeting_id    text REFERENCES meetings(id) ON DELETE CASCADE,
  snapshot_data text NOT NULL,  -- JSON
  created_at    text DEFAULT (datetime('now')),
  restored      integer DEFAULT 0,
  restored_at   text
);

CREATE INDEX IF NOT EXISTS idx_part_snapshots_meeting ON part_snapshots(meeting_id);
CREATE INDEX IF NOT EXISTS idx_part_snapshots_created ON part_snapshots(created_at);

-- ─── 9. WEEKEND MEETINGS (→ users, public_speakers, public_talk_outlines, congregations) ─
CREATE TABLE IF NOT EXISTS weekend_meetings (
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
);

-- ─── 10. PUBLIC TALK HISTORY (→ public_talk_outlines) ────────────────────────
CREATE TABLE IF NOT EXISTS public_talk_history (
  id           text PRIMARY KEY,
  outline_id   text NOT NULL REFERENCES public_talk_outlines(id) ON DELETE CASCADE,
  date         text NOT NULL,
  speaker_name text,
  created_at   text DEFAULT (datetime('now'))
);

-- ─── 11. CONGREGATION SETTINGS (standalone) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS congregation_settings (
  id                     text PRIMARY KEY,
  name                   text,
  number                 text,
  congregation_id        text,  -- legacy text field, not FK
  language               text DEFAULT 'es',
  time_zone              text,
  weekend_meeting_day    text DEFAULT 'sunday',
  weekend_meeting_time   text DEFAULT '10:00',
  midweek_meeting_day    text DEFAULT 'wednesday',
  midweek_meeting_time   text DEFAULT '19:30',
  zoom_meeting_id        text,
  zoom_password          text,
  zoom_link              text,
  dial_in_number         text,
  kingdom_hall_address   text,
  circuit                text,
  co_name                text,
  co_contact_details     text,
  created_at             text DEFAULT (datetime('now')),
  updated_at             text DEFAULT (datetime('now')),
  auxiliary_rooms        integer DEFAULT 0,
  field_service_group_count integer DEFAULT 4
);

-- ─── 12. TERRITORIES (→ users, congregations) ────────────────────────────────
CREATE TABLE IF NOT EXISTS territories (
  id            text PRIMARY KEY,
  number        integer,
  name          text NOT NULL,
  color         text NOT NULL DEFAULT '#3d7d8e',
  coordinates   text NOT NULL DEFAULT '[]',  -- JSON [{lat,lng},...]
  group_name    text,
  assigned_to   text REFERENCES users(id) ON DELETE SET NULL,
  visit_start   text,
  visit_end     text,
  note          text,
  status        text NOT NULL DEFAULT 'available',
  created_at    text DEFAULT (datetime('now')),
  last_modified text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);

CREATE INDEX IF NOT EXISTS territories_status_idx   ON territories(status);
CREATE INDEX IF NOT EXISTS territories_assigned_idx ON territories(assigned_to);

CREATE TRIGGER IF NOT EXISTS territories_touch AFTER UPDATE ON territories
BEGIN
  UPDATE territories SET last_modified = datetime('now') WHERE id = NEW.id;
END;

-- ─── 13. FIELD SERVICE GROUPS (→ congregations) ──────────────────────────────
CREATE TABLE IF NOT EXISTS field_service_groups (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  meeting_day      text,
  meeting_time     text,
  meeting_location text,
  sort_order       integer DEFAULT 0,
  created_at       text DEFAULT (datetime('now')),
  updated_at       text DEFAULT (datetime('now')),
  congregation_id  text REFERENCES congregations(id)
);

-- ─── 14. FIELD SERVICE GROUP MEMBERS (→ groups, users) ───────────────────────
CREATE TABLE IF NOT EXISTS field_service_group_members (
  id         text PRIMARY KEY,
  group_id   text REFERENCES field_service_groups(id) ON DELETE CASCADE,
  user_id    text REFERENCES users(id) ON DELETE CASCADE,
  role       text DEFAULT 'member',
  sort_order integer DEFAULT 0,
  UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fsgm_group ON field_service_group_members(group_id);

-- ─── 15. FIELD SERVICE MEETINGS (→ users, groups, congregations) ──────────────
CREATE TABLE IF NOT EXISTS field_service_meetings (
  id            text PRIMARY KEY,
  week_date     text NOT NULL,
  day_of_week   text NOT NULL,
  time_period   text DEFAULT 'am',
  meeting_time  text,
  location      text,
  conductor_id  text REFERENCES users(id),
  zoom_host_id  text REFERENCES users(id),
  territory     text,
  notes         text,
  group_id      text REFERENCES field_service_groups(id),
  cart_count    integer DEFAULT 0,
  created_at    text DEFAULT (datetime('now')),
  updated_at    text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);

CREATE INDEX IF NOT EXISTS idx_fsm_week ON field_service_meetings(week_date);

-- ─── 16. PW LOCATIONS (→ congregations) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pw_locations (
  id              text PRIMARY KEY,
  cart_number     integer NOT NULL,
  name            text NOT NULL,
  address         text,
  map_link        text,
  notes           text,
  sort_order      integer DEFAULT 0,
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);

-- ─── 17. PW SHIFTS (→ pw_locations) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pw_shifts (
  id              text PRIMARY KEY,
  location_id     text REFERENCES pw_locations(id) ON DELETE CASCADE,
  day_of_week     text NOT NULL,
  start_time      text NOT NULL,
  end_time        text NOT NULL,
  persons_needed  integer DEFAULT 2,
  sort_order      integer DEFAULT 0
);

-- ─── 18. PW ASSIGNMENTS (→ pw_shifts, users) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pw_assignments (
  id         text PRIMARY KEY,
  shift_id   text REFERENCES pw_shifts(id) ON DELETE CASCADE,
  week_date  text NOT NULL,
  user_id    text REFERENCES users(id) ON DELETE CASCADE,
  created_at text DEFAULT (datetime('now')),
  UNIQUE(shift_id, week_date, user_id)
);

-- ─── 19. OUTGOING TALKS (→ users, congregations) ─────────────────────────────
CREATE TABLE IF NOT EXISTS outgoing_talks (
  id                     text PRIMARY KEY,
  week_date              text NOT NULL,
  user_id                text REFERENCES users(id) ON DELETE CASCADE,
  congregation_name      text,
  talk_number            integer,
  talk_title             text,
  contact_info           text,
  kingdom_hall_address   text,
  notes                  text,
  created_at             text DEFAULT (datetime('now')),
  congregation_id        text REFERENCES congregations(id)
);

-- ─── 20. CONGREGATION TASKS (→ congregations) ────────────────────────────────
CREATE TABLE IF NOT EXISTS congregation_tasks (
  id              text PRIMARY KEY,
  week_date       text NOT NULL,
  assignments     text DEFAULT '{}',  -- JSON
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id),
  UNIQUE(week_date, congregation_id)
);

-- ─── 21. CLEANING ASSIGNMENTS (→ congregations) ──────────────────────────────
CREATE TABLE IF NOT EXISTS cleaning_assignments (
  id              text PRIMARY KEY,
  week_date       text NOT NULL,
  assignments     text DEFAULT '{}',  -- JSON
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id),
  UNIQUE(week_date, congregation_id)
);

-- ─── 22. MAINTENANCE TASKS (→ congregations) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id              text PRIMARY KEY,
  title           text NOT NULL,
  category        text,
  link            text,
  description     text,
  done            integer DEFAULT 0,
  assigned_to     text DEFAULT '[]',  -- JSON
  sort_order      integer DEFAULT 0,
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);

-- ─── 23. CIRCUIT OVERSEER VISITS (→ users, congregations) ────────────────────
CREATE TABLE IF NOT EXISTS circuit_overseer_visits (
  id              text PRIMARY KEY,
  week_date       text NOT NULL,
  host_id         text REFERENCES users(id),
  co_companions   text DEFAULT '[]',   -- JSON
  wife_companions text DEFAULT '[]',   -- JSON
  activities      text DEFAULT '[]',   -- JSON
  notes           text,
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);

-- ─── 24. MEMORIAL ROLES (→ congregations) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS memorial_roles (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  positions       integer DEFAULT 1,
  assigned_to     text DEFAULT '[]',  -- JSON
  sort_order      integer DEFAULT 0,
  congregation_id text REFERENCES congregations(id)
);

-- ─── 25. CONGREGATION EVENTS (→ congregations) ───────────────────────────────
CREATE TABLE IF NOT EXISTS congregation_events (
  id               text PRIMARY KEY,
  type             text,
  name             text,
  description      text,
  link             text,
  start_date       text,
  end_date         text,
  single_day       integer DEFAULT 0,
  show_start_time  integer DEFAULT 0,
  show_end_time    integer DEFAULT 0,
  group_name       text,
  created_at       text DEFAULT (datetime('now')),
  congregation_id  text REFERENCES congregations(id)
);

-- ─── 26. CONGREGATION ROLES (→ users, congregations) ────────────────────────
CREATE TABLE IF NOT EXISTS congregation_roles (
  role_key        text,
  label           text NOT NULL,
  person_id       text REFERENCES users(id) ON DELETE SET NULL,
  assistant_1_id  text REFERENCES users(id) ON DELETE SET NULL,
  assistant_2_id  text REFERENCES users(id) ON DELETE SET NULL,
  custom_label    text,
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id),
  PRIMARY KEY (role_key, congregation_id)
);

-- ─── 27. FIELD SERVICE REPORTS (→ users, congregations) ─────────────────────
CREATE TABLE IF NOT EXISTS field_service_reports (
  id                  text PRIMARY KEY,
  user_id             text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month               text NOT NULL,  -- YYYY-MM-01
  participated        integer DEFAULT 0,
  is_auxiliary_pioneer integer DEFAULT 0,
  hours               real,
  bible_studies       integer,
  notes               text,
  created_at          text DEFAULT (datetime('now')),
  updated_at          text DEFAULT (datetime('now')),
  congregation_id     text REFERENCES congregations(id),
  UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_fsr_month ON field_service_reports(month);
CREATE INDEX IF NOT EXISTS idx_fsr_user  ON field_service_reports(user_id);

-- ─── congregation_id indexes (performance) ───────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_congre          ON users(congregation_id);
CREATE INDEX IF NOT EXISTS idx_meetings_congre       ON meetings(congregation_id);
CREATE INDEX IF NOT EXISTS idx_weekend_congre        ON weekend_meetings(congregation_id);
CREATE INDEX IF NOT EXISTS idx_territories_congre    ON territories(congregation_id);
CREATE INDEX IF NOT EXISTS idx_fsr_congre            ON field_service_reports(congregation_id);
CREATE INDEX IF NOT EXISTS idx_attendance_congre     ON meeting_attendance(congregation_id);
CREATE INDEX IF NOT EXISTS idx_pspeakers_congre      ON public_speakers(congregation_id);
CREATE INDEX IF NOT EXISTS idx_outgoing_congre       ON outgoing_talks(congregation_id);
CREATE INDEX IF NOT EXISTS idx_tasks_congre          ON congregation_tasks(congregation_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_congre    ON maintenance_tasks(congregation_id);
CREATE INDEX IF NOT EXISTS idx_events_congre         ON congregation_events(congregation_id);

-- ─── 28. MEETING ATTENDANCE (→ congregations) ───────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_attendance (
  id              text PRIMARY KEY,
  meeting_date    text NOT NULL,
  meeting_type    text NOT NULL CHECK (meeting_type IN ('midweek','weekend')),
  in_person       integer,
  online          integer,
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id),
  UNIQUE(meeting_date, meeting_type, congregation_id)
);

-- ─── 29. TERRITORY ASSIGNMENTS (history for S-13 report) ────────────────────
CREATE TABLE IF NOT EXISTS territory_assignments (
  id             text PRIMARY KEY,
  territory_id   text NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  assigned_name  text NOT NULL,
  assigned_date  text,
  completed_date text,
  created_at     text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);
CREATE INDEX IF NOT EXISTS idx_ta_territory ON territory_assignments(territory_id);
CREATE INDEX IF NOT EXISTS idx_ta_congre    ON territory_assignments(congregation_id);

-- ─── 30. TERRITORY EXTRAS (pairs, completion stats) ─────────────────────────
-- Columns are also added at runtime in sqlite.ts for existing databases.

-- ─── 31. WHATSAPP / MESSAGING CONFIG (per congregation) ─────────────────────
CREATE TABLE IF NOT EXISTS messaging_settings (
  congregation_id  text PRIMARY KEY REFERENCES congregations(id),
  whatsapp_enabled integer NOT NULL DEFAULT 0,
  provider         text NOT NULL DEFAULT 'cloud',   -- 'cloud' = WhatsApp Cloud API
  phone_number_id  text,
  access_token     text,
  sender_label     text,
  notify_on_assign     integer NOT NULL DEFAULT 1,
  notify_overdue       integer NOT NULL DEFAULT 1,
  overdue_days         integer NOT NULL DEFAULT 7,
  notify_weekly_status integer NOT NULL DEFAULT 1,
  weekly_status_dow    integer NOT NULL DEFAULT 1,  -- 0=Sun … 6=Sat
  template_assign  text,
  template_overdue text,
  template_weekly  text,
  updated_at       text DEFAULT (datetime('now'))
);

-- ─── 32. OUTBOUND MESSAGES (platform inbox + whatsapp delivery log) ─────────
CREATE TABLE IF NOT EXISTS messages (
  id              text PRIMARY KEY,
  user_id         text REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL,            -- territory_assigned | territory_overdue | territory_weekly
  title           text NOT NULL,
  body            text NOT NULL,
  image_data      text,                     -- data: URI snapshot of the territory
  territory_id    text REFERENCES territories(id) ON DELETE CASCADE,
  read_at         text,
  whatsapp_status text,                     -- sent | failed | skipped | disabled
  whatsapp_error  text,
  dedupe_key      text,
  created_at      text DEFAULT (datetime('now')),
  congregation_id text REFERENCES congregations(id)
);
CREATE INDEX IF NOT EXISTS idx_msg_user   ON messages(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_msg_congre ON messages(congregation_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_dedupe ON messages(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ─── 33. CUENTAS — CÓDIGOS CT (→ congregaciones) ─────────────────────────────
-- Enums replicados del programa legacy (cuentas-congregacion): no renombrar.
--   kind/type : income | expense | transfer
--   account   : caja (Recibido/Donaciones) | corriente (Cuenta Principal/Caja de
--               dinero) | sucursal (Cuenta Secundaria)
CREATE TABLE IF NOT EXISTS cuentas_codes (
  id              text PRIMARY KEY,
  code            text NOT NULL,
  description     text NOT NULL,
  kind            text NOT NULL DEFAULT 'income'
                  CHECK (kind IN ('income','expense','transfer')),
  sort_order      integer DEFAULT 0,
  congregation_id text REFERENCES congregations(id),
  UNIQUE(code, congregation_id)
);

CREATE INDEX IF NOT EXISTS idx_cuentas_codes_congre ON cuentas_codes(congregation_id);

-- ─── 34. CUENTAS — TRANSACCIONES S-26 (→ congregaciones) ─────────────────────
-- Una fila 'transfer' resta en `account` y suma en `to_account`: su efecto neto
-- sobre el total general es 0, por eso no mueve la columna Saldo del S-26.
CREATE TABLE IF NOT EXISTS cuentas_transactions (
  id              text PRIMARY KEY,
  date            text NOT NULL,               -- YYYY-MM-DD
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
);

CREATE INDEX IF NOT EXISTS idx_cuentas_tx_date   ON cuentas_transactions(congregation_id, date);
CREATE INDEX IF NOT EXISTS idx_cuentas_tx_code   ON cuentas_transactions(congregation_id, code);

-- ─── 35. CUENTAS — SALDO INICIAL POR MES (→ congregaciones) ───────────────────
-- Si existe fila para un ym se usa como (a) del S-30; si no, se arrastra el
-- cierre del mes anterior.
CREATE TABLE IF NOT EXISTS cuentas_saldo_inicial (
  congregation_id text NOT NULL REFERENCES congregations(id),
  ym              text NOT NULL,               -- YYYY-MM
  caja            real NOT NULL DEFAULT 0,
  corriente       real NOT NULL DEFAULT 0,
  sucursal        real NOT NULL DEFAULT 0,
  updated_at      text DEFAULT (datetime('now')),
  PRIMARY KEY (congregation_id, ym)
);

-- ─── 36. CUENTAS — ENCABEZADO DEL FORMULARIO (→ congregaciones) ───────────────
-- MSP ya tiene name/city en `congregations`; el S-26/S-30 pide además el estado.
-- Incluye los parámetros del cierre de mes. Los códigos son configurables
-- porque cada congregación conserva los suyos; las descripciones pueden variar
-- pero el código es lo que gobierna el desglose de los reportes.
CREATE TABLE IF NOT EXISTS cuentas_config (
  congregation_id  text PRIMARY KEY REFERENCES congregations(id),
  label            text,
  city             text,
  state            text,
  -- Cierre de mes
  remit_code       text    NOT NULL DEFAULT 'SOM',  -- remesa de obra mundial
  res_pub_code     text    NOT NULL DEFAULT 'RM',   -- resolución por publicador
  res_pub_amount   real    NOT NULL DEFAULT 0,      -- monto por publicador
  res_pct_code     text    NOT NULL DEFAULT 'RM',   -- resolución porcentual
  res_pct_percent  real    NOT NULL DEFAULT 10,     -- % sobre donaciones código C
  res_pct_source   text    NOT NULL DEFAULT 'C',    -- código base del porcentaje
  updated_at       text DEFAULT (datetime('now'))
);

-- ─── 37. CUENTAS — RECIBOS POR TELEGRAM (propuestas del agente) ──────────────
-- El agente propone asientos leídos con IA; SOLO la aprobación humana
-- (callback ✅) escribe en cuentas_transactions. UNIQUE(chat_id, message_id)
-- hace idempotente el webhook: si Telegram reintenta la entrega, el update ya
-- conocido se ignora en vez de duplicar la propuesta.
CREATE TABLE IF NOT EXISTS cuentas_telegram_pending (
  id              text PRIMARY KEY,
  chat_id         text NOT NULL,
  message_id      text NOT NULL,
  congregation_id text REFERENCES congregations(id),
  file_type       text,                -- photo | document
  mime_type       text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','error')),
  proposal        text,                -- JSON: { items[], confidence, model }
  error_message   text,
  resolved_at     text,
  created_at      text DEFAULT (datetime('now')),
  updated_at      text DEFAULT (datetime('now')),
  UNIQUE(chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_ctp_congre ON cuentas_telegram_pending(congregation_id, status);

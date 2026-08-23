/**
 * Agente de recibos por Telegram para Cuentas. SOLO SERVIDOR.
 *
 * Flujo: foto/PDF al grupo → webhook → descarga del archivo → lectura con IA
 * (Gemini) → propuesta con botones ✅ Registrar / ❌ Descartar → solo la
 * aprobación humana escribe en `cuentas_transactions`.
 *
 * INVARIANTE: el agente NUNCA asienta por su cuenta. Todo queda en
 * `cuentas_telegram_pending` (pending/approved/rejected/error) con auditoría.
 *
 * El webhook es idempotente: UNIQUE(chat_id, message_id) hace que los reenvíos
 * de Telegram (timeout del webhook) no dupliquen propuestas.
 */
import { randomUUID } from 'crypto';
import { getDb } from './sqlite';
import {
  ACCOUNTS, TYPES, round2,
  type Account, type TxType,
} from './cuentas';

/* ── Tipos mínimos de la API de Telegram ────────────────────────────────────── */

interface TgFile { file_id: string; file_path?: string }
interface TgPhotoSize { file_id: string; width: number; height: number }
interface TgDocument { file_id: string; mime_type?: string; file_name?: string }
interface TgMessage {
  message_id: number;
  chat: { id: number };
  photo?: TgPhotoSize[];
  document?: TgDocument;
}
interface TgCallbackQuery {
  id: string;
  data?: string;
  message?: TgMessage;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

interface ProposalItem {
  date: string;
  type: TxType;
  account: Account;
  to_account: Account | null;
  code: string | null;
  description: string;
  amount: number;
}

interface Proposal {
  items: ProposalItem[];
  confidence: 'high' | 'low';
  model: string;
}

const ACCOUNT_LABELS_ES: Record<Account, string> = {
  caja: 'Caja (Recibido)',
  corriente: 'Cuenta Principal',
  sucursal: 'Cuenta Secundaria',
};
const TYPE_LABELS_ES: Record<TxType, string> = {
  income: 'Entrada',
  expense: 'Salida',
  transfer: 'Transferencia',
};

/* ── Chat ↔ congregación (messaging_settings) ───────────────────────────────── */

interface ChatSettingsRow {
  congregation_id: string | null;
  telegram_bot_token: string | null;
}

function congregationForChat(chatId: string): ChatSettingsRow | undefined {
  return getDb().prepare(`
    SELECT congregation_id, telegram_bot_token
    FROM messaging_settings
    WHERE telegram_chat_id = ? AND telegram_enabled = 1
  `).get(chatId) as ChatSettingsRow | undefined;
}

/* ── Configuración de IA (por congregación > global) ────────────────────────── */

function aiKeyFor(congreId: string | null): string | null {
  if (congreId) {
    const row = getDb().prepare(
      `SELECT ai_api_key FROM cuentas_config WHERE congregation_id = ?`
    ).get(congreId) as { ai_api_key: string | null } | undefined;
    if (row?.ai_api_key) return row.ai_api_key;
  }
  return process.env.GEMINI_API_KEY || null;
}

function aiModel(): string {
  return process.env.GEMINI_MODEL || 'gemini-flash-latest';
}

/* ── Llamadas a la API de Telegram ──────────────────────────────────────────── */

async function tgCall(botToken: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  } catch (e) {
    return { ok: false, description: e instanceof Error ? e.message : 'Error de red' };
  }
}

type InlineKeyboard = { inline_keyboard: { text: string; callback_data: string }[][] };

/* ── Lectura de recibos con Gemini ──────────────────────────────────────────── */

function catalogFor(congreId: string): string {
  const rows = getDb().prepare(
    `SELECT code, description, kind FROM cuentas_codes WHERE congregation_id = ? ORDER BY code`
  ).all(congreId) as { code: string; description: string; kind: string }[];
  if (!rows.length) return '(sin catálogo configurado: deja code en null)';
  return rows.map(r => `${r.code} — ${r.description} [${r.kind}]`).join('\n');
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

/** Normaliza montos tipo "1,234.56", "$1234,56", "1 234,50". */
function parseAmount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return round2(v);
  if (typeof v !== 'string') return null;
  let s = v.replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function normDate(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayIso();
}

function normCode(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return s || null;
}

/**
 * Normaliza las partidas crudas de la IA. Una transferencia sin destino válido
 * distinto del origen se degrada a salida simple (el humano aprueba al final).
 */
function normalizeItems(raw: unknown): ProposalItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ProposalItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const amount = parseAmount(r.amount);
    const description = typeof r.description === 'string' ? r.description.trim() : '';
    if (!amount || !description) continue;

    const date = normDate(r.date);
    const code = normCode(r.code);
    const account = ((ACCOUNTS as readonly string[]).includes(String(r.account))
      ? String(r.account) : 'caja') as Account;

    if (String(r.type) === 'transfer') {
      const destOk = (ACCOUNTS as readonly string[]).includes(String(r.to_account))
        && String(r.to_account) !== String(r.account);
      if (destOk) {
        items.push({
          date, type: 'transfer', account,
          to_account: String(r.to_account) as Account,
          code, description, amount,
        });
        continue;
      }
    }

    items.push({
      date,
      type: (TYPES as readonly string[]).includes(String(r.type)) && String(r.type) !== 'transfer'
        ? String(r.type) as TxType : 'expense',
      account, to_account: null, code, description, amount,
    });
  }
  return items;
}

/** El código propuesto solo se acepta si existe en el catálogo de la congregación. */
function resolveCodes(congreId: string, items: ProposalItem[]): ProposalItem[] {
  const known = new Set(
    (getDb().prepare(`SELECT code FROM cuentas_codes WHERE congregation_id = ?`)
      .all(congreId) as { code: string }[]).map(r => r.code.toUpperCase()),
  );
  return items.map(it => ({
    ...it,
    code: it.code && known.has(it.code) ? it.code : null,
  }));
}

export async function ocrReceipt(
  apiKey: string, model: string, congreId: string,
  base64: string, mimeType: string,
): Promise<{ ok: true; proposal: Omit<Proposal, 'model'> } | { ok: false; error: string }> {
  const prompt = `
Eres un lector de recibos contables para la contabilidad de una congregación.
Analiza la imagen/PDF adjunto y extrae las transacciones visibles.

Catálogo de códigos CT de esta congregación (usa el código EXACTO si el recibo
lo menciona; si no se ve claro, usa null):
${catalogFor(congreId)}

Cuentas válidas: caja (Recibido/Donaciones), corriente (Cuenta Principal),
sucursal (Cuenta Secundaria). Tipos válidos: income, expense, transfer.
Para transfer incluye to_account distinto del origen.

Responde SOLO con JSON (sin explicaciones), esta forma exacta:
{"items":[{"date":"YYYY-MM-DD","type":"expense","account":"caja","to_account":null,"code":null,"description":"texto corto","amount":123.45}],"confidence":"high"}

Reglas:
- confidence="low" si el monto está manuscrito, borroso o dudoso.
- Si hay varios conceptos en un mismo recibo, devuelve un item por concepto.
- Monto como número positivo. Fecha del recibo; si no se ve, usa hoy.`.trim();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0 },
        }),
      },
    );

    const json = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };

    if (!res.ok || json.error) {
      return { ok: false, error: json.error?.message ?? `IA HTTP ${res.status}` };
    }
    const text = json.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    const parsed = extractJson(text);
    if (!parsed) return { ok: false, error: 'La IA no devolvió JSON legible' };

    const items = resolveCodes(congreId, normalizeItems(parsed.items));
    if (!items.length) return { ok: false, error: 'No pude leer montos legibles en el recibo' };

    return { ok: true, proposal: { items, confidence: parsed.confidence === 'low' ? 'low' : 'high' } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error llamando a la IA' };
  }
}

/* ── Descarga del archivo desde Telegram ────────────────────────────────────── */

async function downloadFile(botToken: string, fileId: string): Promise<{ base64: string; mime: string } | { error: string }> {
  const meta = await tgCall(botToken, 'getFile', { file_id: fileId });
  const filePath = (meta.result as TgFile | undefined)?.file_path;
  if (!meta.ok || !filePath) return { error: meta.description ?? 'getFile falló' };

  try {
    const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!res.ok) return { error: `descarga HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 19_000_000) return { error: 'El archivo excede el tamaño procesable (~19 MB)' };
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    const mime = ext === 'pdf' ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';
    return { base64: buf.toString('base64'), mime };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Error de descarga' };
  }
}

/* ── Texto de la propuesta ─────────────────────────────────────────────────── */

function money(n: number): string {
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function itemLine(it: ProposalItem): string {
  const code = it.code ? ` · código ${it.code}` : ' · sin código';
  const dest = it.to_account ? ` → ${ACCOUNT_LABELS_ES[it.to_account]}` : '';
  return `• ${TYPE_LABELS_ES[it.type]} — ${ACCOUNT_LABELS_ES[it.account]}${dest}${code}\n  ${it.description}: <b>$${money(it.amount)}</b> (${it.date})`;
}

function proposalText(p: Proposal): string {
  const warn = p.confidence === 'low'
    ? '\n⚠️ <i>Confianza baja: revisa el importe antes de aprobar.</i>\n' : '\n';
  const total = round2(p.items.reduce((s, i) => s + i.amount, 0));
  return [
    '<b>Recibo detectado</b>',
    warn,
    ...p.items.map(itemLine),
    '',
    `<b>Total: $${money(total)}</b>`,
    '<i>✅ Registrar asienta estas transacciones · ❌ Descartar no hace nada.</i>',
  ].join('\n');
}

function keyboard(pendingId: string): InlineKeyboard {
  return { inline_keyboard: [[
    { text: '✅ Registrar', callback_data: `ctg:${pendingId}:approve` },
    { text: '❌ Descartar', callback_data: `ctg:${pendingId}:reject` },
  ]]};
}

/* ── Persistencia de propuestas ────────────────────────────────────────────── */

function savePending(row: {
  chat_id: string; message_id: string; congregation_id: string | null;
  file_type: string; mime_type: string;
}): string | null {
  const id = randomUUID();
  try {
    getDb().prepare(`
      INSERT INTO cuentas_telegram_pending
        (id, chat_id, message_id, congregation_id, file_type, mime_type, status)
      VALUES (?,?,?,?,?,?, 'pending')
    `).run(id, row.chat_id, row.message_id, row.congregation_id, row.file_type, row.mime_type);
    return id;
  } catch {
    return null; // UNIQUE(chat_id, message_id): reintento de Telegram → ignorar
  }
}

function saveProposal(id: string, proposal: Proposal): void {
  getDb().prepare(`
    UPDATE cuentas_telegram_pending SET proposal = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(proposal), id);
}

function markStatus(
  id: string,
  status: 'approved' | 'rejected' | 'error',
  opts?: { proposal?: Proposal; error?: string },
): void {
  getDb().prepare(`
    UPDATE cuentas_telegram_pending SET
      status = ?,
      proposal = COALESCE(?, proposal),
      error_message = ?,
      resolved_at = CASE WHEN ? IN ('approved','rejected') THEN datetime('now') ELSE resolved_at END,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    status,
    opts?.proposal ? JSON.stringify(opts.proposal) : null,
    opts?.error ?? null,
    status,
    id,
  );
}

/* ── Handler: mensajes con archivo ─────────────────────────────────────────── */

async function handleMessage(msg: TgMessage): Promise<void> {
  const chatId = String(msg.chat.id);

  // Foto: Telegram manda varias resoluciones; la última es la más grande.
  const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : msg.document?.file_id;
  if (!fileId) return; // mensaje de texto u otro tipo: ignorar

  const settings = congregationForChat(chatId);
  const botToken = settings?.telegram_bot_token ?? null;
  if (!settings || !botToken) return; // chat no vinculado: ignorar en silencio

  const pendingId = savePending({
    chat_id: chatId, message_id: String(msg.message_id),
    congregation_id: settings.congregation_id,
    file_type: msg.photo?.length ? 'photo' : 'document',
    mime_type: msg.document?.mime_type ?? 'image/jpeg',
  });
  if (!pendingId) return; // duplicado ya procesado/en proceso

  const fail = async (userMsg: string, log?: string) => {
    if (log) console.error(`[telegram-agente] ${log}`);
    markStatus(pendingId, 'error', { error: log ?? userMsg });
    await tgCall(botToken, 'sendMessage', {
      chat_id: chatId, text: `⚠️ ${userMsg}`,
      reply_to_message_id: msg.message_id,
    });
  };

  if (msg.document?.mime_type && !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(msg.document.mime_type)) {
    await fail('Solo proceso imágenes (JPG/PNG/WebP) o PDF.', `mime no soportado: ${msg.document.mime_type}`);
    return;
  }

  const apiKey = aiKeyFor(settings.congregation_id);
  if (!apiKey) {
    await fail('Falta la clave de IA para leer recibos. Configúrala en Cuentas → Configuración (o GEMINI_API_KEY en el servidor).', 'sin ai_api_key ni GEMINI_API_KEY');
    return;
  }

  const dl = await downloadFile(botToken, fileId);
  if ('error' in dl) { await fail('No pude descargar el archivo de Telegram.', dl.error); return; }

  const model = aiModel();
  const ocr = await ocrReceipt(apiKey, model, settings.congregation_id ?? '', dl.base64, dl.mime);
  if (!ocr.ok) { await fail('No pude leer el recibo.', ocr.error); return; }

  const proposal: Proposal = { ...ocr.proposal, model };
  saveProposal(pendingId, proposal);

  await tgCall(botToken, 'sendMessage', {
    chat_id: chatId,
    text: proposalText(proposal),
    parse_mode: 'HTML',
    reply_to_message_id: msg.message_id,
    reply_markup: keyboard(pendingId),
  });
}

/* ── Handler: aprobación/descarte ──────────────────────────────────────────── */

async function handleCallback(cq: TgCallbackQuery): Promise<void> {
  const [, pendingId, actionRaw] = (cq.data ?? '').split(':');
  const action = actionRaw === 'approve' ? 'approve' : actionRaw === 'reject' ? 'reject' : null;
  const chat = cq.message?.chat;
  if (!pendingId || !action || !chat) return;

  const chatId = String(chat.id);
  const settings = congregationForChat(chatId);
  const botToken = settings?.telegram_bot_token ?? null;

  // Seguridad: la propuesta debe pertenecer al chat vinculado que la resuelve.
  // Sin token no hay respuesta posible (answerCallbackQuery requiere token).
  if (!settings || !botToken) return;

  const answer = (text: string) =>
    tgCall(botToken, 'answerCallbackQuery', { callback_query_id: cq.id, text });

  const db = getDb();
  const pending = db.prepare(
    `SELECT id, chat_id, congregation_id, status, proposal FROM cuentas_telegram_pending WHERE id = ?`
  ).get(pendingId) as {
    id: string; chat_id: string; congregation_id: string | null;
    status: string; proposal: string | null;
  } | undefined;

  if (!pending || pending.chat_id !== chatId) { await answer('Propuesta desconocida'); return; }
  if (pending.status !== 'pending') { await answer('Esta propuesta ya fue resuelta'); return; }

  if (action === 'reject') {
    markStatus(pendingId, 'rejected');
    await tgCall(botToken, 'editMessageText', {
      chat_id: chatId, message_id: cq.message!.message_id,
      text: '❌ Recibo descartado — nada fue registrado.',
    });
    await answer('Descartado');
    return;
  }

  // Aprobar: asentar todas las partidas propuestas.
  let proposal: Proposal | null = null;
  try { proposal = pending.proposal ? JSON.parse(pending.proposal) as Proposal : null; } catch { proposal = null; }
  if (!proposal?.items?.length) {
    markStatus(pendingId, 'error', { error: 'aprobado sin propuesta almacenada' });
    await answer('Propuesta vacía');
    return;
  }

  const receiptRef = `TG-${pending.id.slice(0, 8)}`;
  const insert = db.prepare(`
    INSERT INTO cuentas_transactions
      (id, date, type, account, to_account, code, description, amount, receipt_ref, notes, congregation_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `);
  db.transaction(() => {
    for (const it of proposal.items) {
      insert.run(
        randomUUID(), it.date, it.type, it.account, it.to_account, it.code,
        it.description, it.amount, receiptRef,
        'Registrado vía Telegram (agente de recibos)',
        pending.congregation_id,
      );
    }
  })();

  markStatus(pendingId, 'approved', { proposal });
  const total = round2(proposal.items.reduce((s, i) => s + i.amount, 0));
  await tgCall(botToken, 'editMessageText', {
    chat_id: chatId, message_id: cq.message!.message_id,
    text: `✅ Registrado en Cuentas: ${proposal.items.length} transacción(es), total <b>$${money(total)}</b>.`,
    parse_mode: 'HTML',
  });
  await answer(`Registrado ✓ $${money(total)}`);
}

/* ── Entrada principal ──────────────────────────────────────────────────────── */

export async function handleTelegramUpdate(update: TgUpdate): Promise<void> {
  if (update.callback_query) { await handleCallback(update.callback_query); return; }
  if (update.message) { await handleMessage(update.message); return; }
}

/* ── Diagnóstico (GET del webhook) ─────────────────────────────────────────── */

export function diagnostics() {
  const chats = (getDb().prepare(`
    SELECT congregation_id, telegram_enabled, telegram_bot_token, telegram_chat_id
    FROM messaging_settings WHERE telegram_chat_id IS NOT NULL
  `).all() as {
    congregation_id: string | null; telegram_enabled: number;
    telegram_bot_token: string | null; telegram_chat_id: string | null;
  }[]).map(r => ({
    congregation_id: r.congregation_id,
    enabled: r.telegram_enabled === 1,
    has_token: Boolean(r.telegram_bot_token),
    chat_id: r.telegram_chat_id,
    has_ai_key: Boolean(aiKeyFor(r.congregation_id)),
  }));

  return {
    webhook_secret_configured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    gemini_global_key: Boolean(process.env.GEMINI_API_KEY),
    model: aiModel(),
    linked_chats: chats,
  };
}

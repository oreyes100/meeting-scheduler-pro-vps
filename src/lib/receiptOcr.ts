/**
 * Motor de lectura de recibos con IA (Google Gemini). SOLO SERVIDOR.
 *
 * Compartido por la interfaz web (`/api/cuentas/ocr`) y por el agente de
 * Telegram (`/api/cuentas/telegram`): una sola implementación evita que
 * ambos caminos interpreten los recibos de forma distinta.
 *
 * La clave vive en la configuración de la congregación o en GEMINI_API_KEY,
 * nunca en el repositorio.
 */

// Se usa el alias `-latest` a propósito: los modelos con número de versión
// dejan de ofrecerse a cuentas nuevas con el tiempo y devuelven 404
// («no longer available to new users»), que fue lo que ocurrió con
// gemini-2.5-flash. El alias sigue apuntando al modelo vigente.
//
// Los picos de demanda de Google devuelven 503 UNAVAILABLE (transitorio).
// En vez de fallarle al usuario, se reintenta con backoff y se recorre una
// cadena de modelos de respaldo hasta que uno responda. GEMINI_MODEL fija el
// preferido; para ver cuáles admite la clave: GET /api/cuentas/ocr?models=1
const DEFAULT_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
];
const MODELS = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL, ...DEFAULT_MODELS.filter(m => m !== process.env.GEMINI_MODEL)]
  : DEFAULT_MODELS;

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

/** Reintentos por modelo ante errores transitorios de Google. */
const ATTEMPTS_PER_MODEL = 2;
/** Estados que vale la pena reintentar/cambiar de modelo. */
const TRANSIENT = new Set([429, 500, 502, 503]);
/** Espera entre reintentos: 800 ms, 1.6 s, 3.2 s… con ligero jitter. */
const backoffMs = (attempt: number) => 800 * 2 ** attempt + Math.floor(Math.random() * 250);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Límite de tamaño del archivo original. */
export const MAX_BYTES = 8 * 1024 * 1024;

export interface CodeRow { code: string; description: string; kind: string }

export interface ReceiptTx {
  date: string;
  description: string;
  amount: number;
  kind: 'income' | 'expense';
  code: string | null;
  receipt_ref: string | null;
  confidence: 'alta' | 'media' | 'baja';
}

function buildPrompt(codes: CodeRow[]) {
  const catalog = codes.map(c => `${c.code} (${c.kind}): ${c.description}`).join('\n');
  return `Eres el auxiliar del siervo de cuentas de una congregación de los Testigos de Jehová.
Analiza el recibo o comprobante de la imagen y extrae las transacciones que contiene.

Catálogo de códigos de transacción disponibles:
${catalog}

Devuelve ÚNICAMENTE un objeto JSON válido, sin texto alrededor y sin bloques de código, con esta forma:
{"transactions":[{"date":"YYYY-MM-DD","description":"texto breve","amount":123.45,"kind":"income"|"expense","code":"CÓDIGO o null","receipt_ref":"folio o null","confidence":"alta"|"media"|"baja"}]}

Reglas:
- "amount" siempre positivo, en números, sin símbolo de moneda ni separadores de miles.
- "date" en formato YYYY-MM-DD. Si el recibo no la trae, usa null.
- "kind" es "expense" para facturas, tickets y comprobantes de pago; "income" para donativos recibidos.
- "code" debe salir del catálogo de arriba; si ninguno encaja con claridad, usa null.
- "confidence" es "baja" si la cantidad está manuscrita o borrosa, "alta" si está impresa y es nítida.
- Si el documento contiene varias partidas, devuelve una entrada por cada una.
- Si no reconoces ninguna transacción, devuelve {"transactions":[]}.`;
}

function parseTransactions(text: string, codes: CodeRow[]): ReceiptTx[] | null {
  let parsed: { transactions?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, '').trim());
  } catch {
    return null; // JSON ilegible → fallo del modelo; reintentar
  }

  const known = new Set(codes.map(c => c.code));
  return (parsed.transactions ?? [])
    .map(t => {
      const code = t.code ? String(t.code).toUpperCase() : null;
      const conf = String(t.confidence);
      return {
        date: typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date)
          ? t.date : new Date().toISOString().slice(0, 10),
        description: String(t.description ?? '').slice(0, 200) || 'Sin descripción',
        amount: Number(t.amount) > 0 ? Math.round(Number(t.amount) * 100) / 100 : 0,
        kind: t.kind === 'income' ? 'income' as const : 'expense' as const,
        code: code && known.has(code) ? code : null,
        receipt_ref: t.receipt_ref ? String(t.receipt_ref).slice(0, 60) : null,
        confidence: (['alta', 'media', 'baja'].includes(conf) ? conf : 'media') as ReceiptTx['confidence'],
      };
    })
    .filter(t => t.amount > 0);
}

export type GeminiResult = {
  ok: true; text: string; model: string;
} | {
  ok: false; error: string;
}

/**
 * Llamada generateContent resiliente: reintentos con backoff ante picos de
 * demanda (429/500/502/503) y recorrido de la cadena de modelos hasta que uno
 * responda. `preferredModel` (opcional) se prueba primero. Compartida por la
 * lectura de recibos web y el agente de Telegram para que ambos degraden igual.
 */
export async function geminiGenerate(
  apiKey: string, bodyObj: Record<string, unknown>, preferredModel?: string,
): Promise<GeminiResult> {
  const chain = preferredModel
    ? [preferredModel, ...MODELS.filter(m => m !== preferredModel)]
    : MODELS;
  const notes: string[] = [];

  for (const model of chain) {
    for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt++) {
      if (attempt > 0) await sleep(backoffMs(attempt - 1));

      let res: Response;
      try {
        res = await fetch(ENDPOINT(model, apiKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyObj),
          signal: AbortSignal.timeout(90_000),
        });
      } catch {
        notes.push(`${model}: red/timeout`);
        continue; // mismo modelo de nuevo; luego la cadena
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        if (text.trim()) return { ok: true, text, model };
        notes.push(`${model}: respuesta vacía`);
        continue;
      }

      const detail = await res.text().catch(() => '');

      // Problemas de clave/permiso: cambiar de modelo no ayuda; abortar claro.
      if (res.status === 400 && /API key not valid/i.test(detail)) {
        return { ok: false, error: 'La clave de API no es válida. Revísala en Configuración → Lectura de recibos.' };
      }
      if (res.status === 403) {
        return { ok: false, error: 'La clave no tiene permiso para usar la API de Gemini. Habilítala en el proyecto de Google.' };
      }

      if (res.status === 404) {
        // El modelo no existe para esta clave: pasar al siguiente sin reintentar.
        notes.push(`${model}: no disponible (404)`);
        break;
      }

      if (TRANSIENT.has(res.status)) {
        notes.push(`${model}: ${res.status}`);
        continue; // reintento y luego siguiente modelo
      }

      return { ok: false, error: `La lectura con IA falló (${res.status}). ${detail.slice(0, 300)}` };
    }
  }

  return {
    ok: false,
    error:
      'La lectura con IA no estuvo disponible en este momento (alta demanda de Google). ' +
      `Modelos intentados: ${notes.join(', ') || chain.join(', ')}. Vuelve a intentarlo en unos segundos.`,
  };
}

/** Lee un recibo y devuelve transacciones propuestas. Nunca escribe en la base. */
export async function runReceiptOcr(
  dataUrl: string, codes: CodeRow[], apiKey?: string | null,
): Promise<{ transactions: ReceiptTx[]; model: string } | { error: string }> {
  // La clave puede venir de la configuración de la congregación (editable desde
  // la interfaz) o del entorno. Se prefiere la de la congregación para que cada
  // una pueda usar su propia cuota sin tocar el servidor.
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    return { error: 'Falta la clave de IA. Añádela en Cuentas → Configuración → Lectura de recibos.' };
  }

  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { error: 'Formato de imagen no reconocido' };

  const [, mimeType, b64] = m;
  if (!/^(image\/(png|jpe?g|webp|heic)|application\/pdf)$/.test(mimeType)) {
    return { error: `Tipo no admitido: ${mimeType}` };
  }
  if (Buffer.byteLength(b64, 'base64') > MAX_BYTES) return { error: 'El archivo supera los 8 MB' };

  const out = await geminiGenerate(key, {
    contents: [{ parts: [
      { text: buildPrompt(codes) },
      { inline_data: { mime_type: mimeType, data: b64 } },
    ] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  });
  if (!out.ok) return { error: out.error };

  const transactions = parseTransactions(out.text, codes);
  if (!transactions) return { error: 'La IA no devolvió un JSON legible.' };
  return { transactions, model: out.model };
}

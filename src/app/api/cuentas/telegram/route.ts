import { NextResponse } from 'next/server';
import { diagnostics, handleTelegramUpdate, type TgUpdate } from '@/lib/cuentasTelegram';

/**
 * Webhook del agente de recibos por Telegram.
 *
 * GET  — diagnóstico (sin secretos): estado de la configuración.
 * POST — updates de Telegram. Autenticación por cabecera secreta que BotFather
 *        envía en cada llamada (`secret_token` del setWebhook):
 *          · 501 si el servidor no tiene TELEGRAM_WEBHOOK_SECRET configurado.
 *          · 401 si la cabecera no coincide.
 *
 * Siempre responde 200 tras autenticar: un error de procesamiento se registra
 * en `cuentas_telegram_pending` y se avisa al chat; devolver 4xx/5xx solo
 * provocaría reintentos infinitos de Telegram (los reintentos ya son inocuos:
 * UNIQUE(chat_id, message_id) hace idempotente el handler).
 */
export async function GET() {
  return NextResponse.json(diagnostics());
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'TELEGRAM_WEBHOOK_SECRET no configurado en el servidor' },
      { status: 501 },
    );
  }

  const received = request.headers.get('x-telegram-bot-api-secret-token');
  if (received !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const update = await request.json() as TgUpdate;
    await handleTelegramUpdate(update);
  } catch (e) {
    // Nunca propagar: Telegram reinterpretaría el 500 como fallo de entrega.
    console.error('[telegram-webhook] update fallido:', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}

# Contexto Activo — meeting-scheduler-pro-vps v1.0.0 / Sesión 6

## Estado del Proyecto
- **Versión**: 1.0.0 · Rama `vps-selfhosted` @ `395f5c5` (pushed a origin)
- **Deploy lab**: `vps-demo-n2` (192.168.1.250) — `/opt/msp`, PM2 `meeting-scheduler-pro` puerto **3010**, expuesto vía pfSense forward + ufw → `http://congregaciontj.duckdns.org:3010`
- **Deploy lab**: `vps-demo-n2` (192.168.1.250) — `/opt/msp`, PM2 `meeting-scheduler-pro` puerto **3010**, expuesto vía pfSense forward + ufw → `https://micongre.duckdns.org`
- **⚠️ Producción NO es este repo**: corre en VM 211 micongre (192.168.6.136) desde `oreyes100/meeting-scheduler-pro` @ vps-selfhosted. Ver KB: `congregaciontj/PROCEDIMIENTO_CONEXION_VPS_Y_PRODUCCION.md`

## Última Sesión (2026-08-23, sesión 6)
### Completado
- Agente de recibos Telegram implementado y pushado (`49722a5`): webhook `/api/cuentas/telegram` (auth header secreto, 501/401/siempre-200), OCR Gemini con catálogo CT, tabla `cuentas_telegram_pending` idempotente, botones ✅/❌, `ai_api_key` por congregación
- Merge `main`→`vps-selfhosted` resuelto (`territories/page.tsx`, commit `61ef8c7`)
- Despliegue en vps-demo-n2: deploy key SSH nueva (`msp_deploy_ed25519`, GitHub id 161079389), clone+build EXIT=0, PM2 online :3010
- Auto-deploy: cron `*/15 * * * * /opt/deploy_update.sh` (pull+build+reload, log `~/deploy_update.log`) — verificado corriendo solo
- Exposición: pfSense NAT+pass rule (backup `/root/config.xml.bak-msp-202608231632`) + `ufw allow 3010/tcp`
- **URL pública lab**: vhost nginx en vps-panel (.34) + certbot → **`https://micongre.duckdns.org`** (redirect 301, renovación automática). Producción congregaciontj intacta

### Pendiente
- Sin commits locales pendientes

## Bugs Conocidos
1. Puerto 3000 del lab = `~/mis-finanzas/server` (NO tocar). MSP usa 3010.
2. Disco lab al 83% (3.3G libres) — builds grandes pueden sufrir; cachés ya limpiadas

## Próximos Pasos — Prioridad
1. 🟡 Probar agente Telegram end-to-end en producción cloud (setup script: `scripts/setup-telegram-agent.sh`)
2. 🟢 Opcional lab: TLS para :3010; env vars AUTH_SECRET para login real

---
*Actualizado: 2026-08-23*

## Sesión sincronización (2026-08-23 noche)
- Commit **`fe03076`**: port desde producción (meeting-scheduler-pro) de export CSV transacciones + sección Cuentas en backup + filenames por sección; MÁS fixes propios del lab: restore atómico con FK off + orden canónico + stubs congregations, helpers setForeignKeys/foreignKeyCheck en db.ts, label sección "Cuentas v2 (Contabilidad)"
- Verificado en lab: build EXIT=0, PM2 reload, CSV export 80 filas (incluye recibos aprobados vía Telegram), ZIP multisección OK, login/super-admin 200
- `.250` realineado a origin/vps-selfhosted (reset --hard, tree limpio salvo nohup.out)

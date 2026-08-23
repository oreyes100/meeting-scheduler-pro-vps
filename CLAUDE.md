# CLAUDE.md — meeting-scheduler-pro-vps

## Rol del Agente
Asistente de desarrollo para agenda de meetings Next.js + Supabase.

## Stack Técnico
- Next.js 14 (App Router), Supabase PostgreSQL, Tailwind CSS, shadcn/ui
- Model: ollama/qwen3.6-35b-uncensored (localhost:11434)
- Deploy: VPS con deploy-vps.sh

## Formato de Output
- Respuestas concisas. Sin intro genérica.
- Código: siempre con path del archivo. Sin comentarios obvios.
- Sin summary al final.

## Restricciones Permanentes
- No commitear sin confirmación explícita
- No crear archivos *.md no pedidos
- Usar /boot al iniciar sesión, /close al cerrar
- Plan First cuando >3 archivos o ambigüedad

## Contexto del Proyecto
API de gestión de meetings con CRUD completo, auto-asignación de salas, y panel de dashboard.

## Comandos de Referencia
- `/boot` — inicializa sesión, carga Contexto Activo
- `/close` — persiste estado, actualiza logs
- `/vault-sync` — lint + orphan check + inbox triage
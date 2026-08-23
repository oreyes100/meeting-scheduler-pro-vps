# Solución: Renderizado del Módulo de Territorios en iPad (Safari / WebKit)

**Fecha:** 19 de Agosto de 2026  
**Repositorio:** `meeting-scheduler-pro-vps`  
**Archivos modificados:**
- [`src/app/territories/page.tsx`](../src/app/territories/page.tsx)
- [`src/components/TerritoryMap.tsx`](../src/components/TerritoryMap.tsx)
- [`src/services/auto-assign-service.js`](../src/services/auto-assign-service.js)

---

## 1. Diagnóstico del Problema

Al abrir el módulo de Territorios (`/territories`) en dispositivos iPad (Safari / WebKit / Capacitor), la interfaz no mostraba el mapa interactivo o se presentaba en blanco/colapsado. 

### Causas Raíz Identificadas:

1. **Colapso de Altura Flexbox en WebKit (Safari / iPadOS):**
   - El contenedor del mapa usaba la clase `flex-1 relative` sin restricciones de altura explícitas (`h-full`, `min-h-0`, `w-full`).
   - En el motor WebKit de iOS/iPadOS, los hijos con altura porcentual (`h-full`) dentro de un elemento flex que no define `min-h-0` calculan su altura efectiva como `0px`.
   - El uso de `h-screen` (`100vh`) no contemplaba la barra dinámica de Safari y los `safe-area-insets`, desbordando la barra de navegación inferior (`pb-[52px]`).

2. **Manejo de Eventos Táctiles y Emulación de `tap` en Leaflet:**
   - Leaflet (v1.9.4) incluye un detector heredado de eventos táctiles (`tap: true` por defecto en navegadores táctiles). En Safari bajo iPadOS, esto provocaba la captura y anulación errónea de los eventos de clic y dibujo sobre el mapa.

3. **Ausencia de Observador de Redimensionamiento (`ResizeObserver`):**
   - El mapa solo ejecutaba `map.invalidateSize()` una sola vez (a los 100ms) tras la carga inicial. Al rotar el iPad (Landscape ↔ Portrait) o completarse el renderizado asíncrono de fuentes/estilos, el canvas de Leaflet no se ajustaba a las nuevas dimensiones del contenedor.

4. **Error de Tipos en Compilación de Producción (`next build`):**
   - En `src/services/auto-assign-service.js`, el parámetro opcional `customClient` no tenía valor por defecto, provocando un fallo de TypeScript en la ruta de auto-asignación durante el build en el VPS.

---

## 2. Cambios Implementados

### A. Corrección del Layout en `src/app/territories/page.tsx`

Se actualizaron las clases de los contenedores para usar `h-[100dvh]` y garantizar dimensiones completas en Safari:

```tsx
// Contenedor principal
<div className="flex flex-col md:flex-row h-screen h-[100dvh] bg-slate-50 dark:bg-gray-900 dark:text-gray-100 text-sm pb-[52px] md:pb-0 overflow-hidden">
  <IconSidebar />
  <SyncStatus />

  {/* Panel lateral con scroll y altura adecuada */}
  <div className="w-full md:w-80 h-auto md:h-full max-h-[45vh] md:max-h-none flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col min-h-0">
    ...
  </div>

  {/* Contenedor del Mapa con restricciones claras de flex */}
  <div className="flex-1 relative w-full h-full min-h-0 min-w-0">
    <TerritoryMap ... />
  </div>
</div>
```

---

### B. Mejoras en `src/components/TerritoryMap.tsx`

1. **Desactivación de `tap` en Leaflet**: Permite que los eventos de clic funcionen fluidamente en iPadOS.
2. **Integración de `ResizeObserver`**: Escucha cambios de tamaño del contenedor en tiempo real para invalidar el tamaño del mapa.
3. **Manejo de Reintentos en CDN**: Si la carga de Leaflet falla por red, la promesa se resetea para permitir nuevos intentos.
4. **Altura Mínima Responsiva**: Se cambió `minHeight: 400` a `min-h-[300px]` con `w-full h-full`.

```tsx
// Configuración del mapa Leaflet
const map = L.map(containerRef.current, {
  tap: false, // Evita conflictos con eventos táctiles en iPadOS Safari
}).setView(center || DEFAULT_CENTER, 14);

// Observador de cambio de tamaño
if (containerRef.current && typeof ResizeObserver !== 'undefined') {
  resizeObserver = new ResizeObserver(() => {
    if (mapRef.current) {
      mapRef.current.invalidateSize();
    }
  });
  resizeObserver.observe(containerRef.current);
}
```

---

### C. Corrección TypeScript en `src/services/auto-assign-service.js`

```javascript
// Se asignó valor por defecto para permitir llamadas de 1 solo parámetro
export async function runAutoAssignment(meetingId, customClient = null) {
  ...
}
```

---

## 3. Despliegue en Producción (VPS)

Los cambios fueron enviados al repositorio remoto y desplegados en el servidor VPS de producción:

1. **Commit y Push Git:**
   - Commit `4562466`: *fix(territories): fix iPad / WebKit rendering with ResizeObserver, tap handling, and flex height constraints*
   - Commit `1d9af13`: *fix(types): add default value to customClient parameter in runAutoAssignment*
2. **Compilación en VPS:**
   - Se eliminaron carpetas obsoletas (`/opt/msp/standalone`) que interferían con el type-checking.
   - Se ejecutó `npm run build` completando la compilación de 79 rutas.
3. **Reinicio de Servicio:**
   - Se actualizó el bundle standalone y se reinició el proceso en PM2 (`meeting-scheduler-pro`).
   - Verificación de estado: `/api/health` ➔ `{"ok": true}`.

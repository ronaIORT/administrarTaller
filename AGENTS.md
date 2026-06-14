# AGENTS.md — Taller de Costura PWA

## Stack

- **Vanilla JS** (ES modules, sin bundler, sin npm, sin TypeScript)
- **Router SPA basado en hash** en `js/app.js` — carga vistas según `location.hash`
- **IndexedDB** via Dexie 4 (`js/db.js`) — esquema multi-versión (v1→v4), sin datos semilla
- **Tema oscuro** con custom properties CSS en `css/variables.css`
- **Service Worker** — pre-cache, cache-first fetch, SPA fallback offline, banner de actualización
- **CDN**: Dexie 4.0.8, SheetJS (xlsx), jsPDF 2.5.1 + AutoTable 3.8.1, Chart.js 4.4.7, Inter

## Comandos

```
python -m http.server 8080
```

O VS Code Live Server. La PWA requiere `localhost` o HTTPS. No hay tests, lint, ni typecheck.

## Skills instalados

Hay skills en `.agents/skills/`: `pwa-expert`, `accessibility`, `frontend-design`, `seo`. Usa `pwa-expert` para decisiones de arquitectura PWA.

## Arquitectura

```
index.html            → scripts CDN + <main id="app"> + <script type="module" src="js/app.js">
js/app.js             → Router hash, bottom-nav singleton, registro SW + updatefound, limpieza FABs
js/db.js              → Dexie schema v1→v4 (sin seed)
js/utils.js           → Escape HTML, centavos/bolivianos, formatos de moneda
js/views/shared.js    → Modal confirmar, toast, tabs con swipe, header, estado vacío
js/views/shared-pagos.js  → Modal de pago reutilizable (usado por tab-pagos y tab-trabajador)
js/views/administrar-tareas/asignacion-compartida.js  → Lógica compartida entre tab-editar y tab-corte
js/views/             → Un archivo por ruta; administrar-tareas/ y gestion-pagos/ son subcarpetas con tabs
css/style.css         → Cadena @import (variables → base → layout → components → modals → bottom-nav → responsive → views/*)
css/views/            → Un archivo CSS por vista
```

### Rutas hash

| Ruta | Vista | Bottom nav |
|---|---|---|
| `#dashboard` | `dashboard.js` (Chart.js: KPIs + 3 gráficos) | Sí |
| `#gestion-cortes` | `gestion-cortes.js` | Sí |
| `#gestion-prendas` | `gestion-prendas.js` | Sí |
| `#gestion-trabajadores` | `gestion-trabajadores.js` | Sí |
| `#gestion-pagos` | `gestion-pagos.js` (3 tabs: Pagos, Gastos, Historial) | Sí |
| `#nuevo-corte` | `nuevo-corte.js` | Oculto |
| `#administrar-tareas/:id` | `administrar-tareas/*.js` (5 tabs) | Oculto |
| `#nueva-prenda` / `#editar-prenda/:id` | `gestion-prendas.js` | Oculto |

Bottom-nav oculto para rutas que contienen `/` (excepto `#dashboard`) y para `#nuevo-corte` / `#nueva-prenda`.

### Patrón de vistas

Toda vista: **renderizar HTML → cargar datos de la BD → adjuntar event listeners**. Re-render completo tras cada mutación.

**Exportaciones globales:** Handlers `onclick` inline en template strings requieren funciones en `window.*`.
```js
window.miFuncionGlobal = miFuncionGlobal;
```

**Limpieza de FABs:** `cargarVista()` elimina todos los contenedores de FAB conocidos por ID antes de renderizar.

## Crítico: Manejo de moneda

| Campo | Unidad | Tipo | Ejemplo |
|---|---|---|---|
| `precioUnitario` (tareas) | **Centavos** | Entero | `5` = 0.05 Bs |
| `precioVentaUnitario` | **Bolivianos** | Decimal | `15.00` = 15 Bs |
| `monto` (pagos) | **Bolivianos** | Decimal | `25.50` = 25.50 Bs |
| `monto` (gastos) | **Bolivianos** | Decimal | `12.00` = 12.00 Bs |

Funciones en `js/utils.js`: `centavosABolivianos()`, `bolivianosACentavos()`, `formatBs(bsDecimal)`, `formatBsCtv(centavos)`, `formatCtv(centavos)`, `formatCostoTotal(centavos)`, `formatNumero()`. Nunca duplicar la lógica de conversión.

- `formatBs(bolivianos)` → `"X.XX Bs"` (pagos, gastos, totales)
- `formatBsCtv(centavos)` → `"X.XX Bs"` (precios de tareas, legacy)
- `formatCostoTotal(centavos)` → divide entre 100 y formatea como `"X.XX Bs"`

## Base de datos

### Esquema (IndexedDB via Dexie 4.x, versión actual: 4)

```
db.prendas:       ++id, &nombre, tareas[]
db.trabajadores:  ++id, &nombre
db.cortes:        ++id, estado, prendaId, fechaCreacion, fechaFinalizacion
                   (tallas[], tareas[asignaciones[]] son arrays embebidos)
db.pagos:         ++id, [corteId+trabajadorId], trabajadorId, corteId, fecha, monto, nota
db.gastos:        ++id, categoria, fecha, descripcion, monto, nota
```

- **Sin restricciones FK** — borrados en cascada manuales (pagos por `corteId`, luego el corte)
- **Compound index** `[corteId+trabajadorId]` en pagos (v4)
- **Sin datos semilla** — BD vacía. Para reiniciar: DevTools → Application → IndexedDB → borrar `TallerCosturaDB`

## Service Worker

- **Versión:** `CACHE_NAME` en `service-worker.js` es la fuente única (actual: `v2.66`)
- `dashboard.js` usa `window.APP_VERSION` para mostrar la versión en el footer
- **Install:** pre-cachea assets locales con `Promise.allSettled` + `skipWaiting()`
- **Activate:** limpia caches antiguos + envía versión al cliente via postMessage
- **Fetch:** cache-first; offline+navegación SPA → sirve `index.html`; scripts/styles sin cache ni red → respuesta vacía
- **Message:** acepta `{ type: "SKIP_WAITING" }` y `{ type: "GET_VERSION" }`
- Recursos CDN se cachean perezosamente en el primer fetch exitoso (no en pre-cache)
- **Actualización:** `js/app.js` escucha `updatefound`, muestra banner "Nueva versión disponible"; botón "Recargar" envía `SKIP_WAITING` → `controllerchange` → recarga

## Convenciones CSS

- `css/style.css` es el único punto de entrada — cadena de `@import`
- Tema oscuro fijo, mobile-first, `--content-max-width: 720px`
- `--header-height: 56px`, `--bottom-nav-height: 64px`

## Convenciones de código

- Comentarios JS en español
- Template literals con concatenación `+` para strings HTML multilínea
- Sin arrow functions para funciones nombradas de nivel superior (usa `function`)
- `e.target.closest()` para delegación de eventos
- `javascript:void(0)` en links con handlers inline

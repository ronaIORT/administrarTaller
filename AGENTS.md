# AGENTS.md — Taller de Costura PWA

## Stack

- **Vanilla JS** (módulos ES, sin bundler, sin npm, sin TypeScript)
- **Router SPA basado en hash** en `js/app.js` — carga vistas según `location.hash`
- **IndexedDB** mediante Dexie 4 (`js/db.js`) — esquema multi-versión, sin datos semilla
- **Tema oscuro** con custom properties CSS en `css/variables.css`
- **Service Worker** en `service-worker.js` — pre-cache con `Promise.allSettled`, cache-first fetch, SPA fallback offline, message handler para skipWaiting
- **Banner de actualización** en `js/app.js` — notifica al usuario cuando hay nueva versión del SW lista
- Todas las librerías externas cargadas desde CDN: Dexie 4.0.8, SheetJS (xlsx), jsPDF 2.5.1 + AutoTable 3.8.1, Chart.js 4.4.7, Inter

## Comandos

```bash
python -m http.server 8080
```

O usar VS Code Live Server. La PWA requiere `localhost` o HTTPS. No hay tests, lint, ni typecheck.

## Arquitectura

```
index.html          → scripts CDN + <main id="app"> + <script type="module" src="js/app.js">
js/app.js           → Router, bottom-nav (singleton), registro del SW con updatefound, limpieza de FABs
js/db.js            → Esquema Dexie multi-versión (v1→v4), sin populate/seed
js/utils.js         → Escape HTML, conversión y formateo de moneda
js/views/shared.js  → Modal confirmar, toast, tabs, header, estado vacío
js/views/           → Un archivo JS por ruta; administrar-tareas/ y gestion-pagos/ son subcarpetas con tabs
css/style.css       → Cadena @import (variables → base → layout → components → modals → bottom-nav → responsive → views/*)
css/views/          → Un archivo CSS por vista
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
| `#administrar-tareas/:id` | `administrar-tareas/*.js` (5 tabs: resumen, corte, trabajador, editar, asignar) | Oculto |
| `#nueva-prenda` / `#editar-prenda/:id` | `gestion-prendas.js` | Oculto |

Bottom-nav oculto para rutas que contienen `/` (excepto `#dashboard`) y para `#nuevo-corte` / `#nueva-prenda`.

### Patrón de vistas

Toda vista sigue: **renderizar HTML → cargar datos de la BD → adjuntar event listeners**. Las vistas se re-renderizan por completo tras cada mutación.

**Exportaciones globales:** Los handlers `onclick` inline en template strings requieren funciones en `window.*`.
```js
window.miFuncionGlobal = miFuncionGlobal;
```

**Limpieza de FABs:** `cargarVista()` elimina todos los contenedores de FAB conocidos por ID antes de renderizar.

**Helpers de UI compartidos** (`js/views/shared.js`):
- `mostrarModalConfirmar(titulo, mensaje, tipo, onConfirmar)` — diálogo de confirmación bloqueante
- `mostrarToast(mensaje, tipo, duracion)` — notificación no bloqueante
- `crearTabs(tabs, tabActivo, onCambio, swipeElement)` — barra de tabs con soporte swipe
- `crearHeader(titulo, rutaVolver)` — barra superior con botón volver opcional
- `estadoVacioHTML(mensaje, submsg)` — placeholder de estado vacío

## Crítico: Manejo de moneda

| Campo | Unidad | Tipo | Ejemplo |
|---|---|---|---|
| `precioUnitario` (tareas) | **Centavos** | Entero | `5` = 0.05 Bs |
| `precioVentaUnitario` | **Bolivianos** | Decimal | `15.00` = 15 Bs |
| `monto` (pagos) | **Bolivianos** | Decimal | `25.50` = 25.50 Bs |
| `monto` (gastos) | **Bolivianos** | Decimal | `12.00` = 12.00 Bs |

Funciones en `js/utils.js`: `centavosABolivianos()`, `bolivianosACentavos()`, `formatBs(bsDecimal)`, `formatBsCtv(centavos)`, `formatCtv()`, `formatCostoTotal()`, `formatNumero()`. Nunca duplicar la lógica de conversión.

- `formatBs(bolivianos)` — formatea Bs decimal como `"X.XX Bs"` (pagos, gastos, totales)
- `formatBsCtv(centavos)` — formatea centavos como `"X.XX Bs"` (precios de tareas, legacy)

## Base de datos

### Esquema (IndexedDB mediante Dexie 4.x, versión actual: 4)

```
db.prendas:       ++id, &nombre, tareas[]
db.trabajadores:  ++id, &nombre
db.cortes:        ++id, estado, prendaId, fechaCreacion, fechaFinalizacion
                   (tallas[], tareas[asignaciones[]] son arrays embebidos)
db.pagos:         ++id, [corteId+trabajadorId], trabajadorId, corteId, fecha, monto, nota
db.gastos:        ++id, categoria, fecha, descripcion, monto, nota
```

- **Sin restricciones FK** — borrados en cascada manuales (eliminar pagos por `corteId`, luego eliminar el corte)
- **Sin datos semilla** — la BD arranca vacía. Para reiniciar, borrar `TallerCosturaDB` desde DevTools → Application → IndexedDB
- **Compound index** `[corteId+trabajadorId]` en pagos (v4) permite búsqueda eficiente por par único

## Service Worker

- `CACHE_NAME` definido en `service-worker.js` — fuente única de verdad de la versión
- La versión se extrae de `CACHE_NAME` y se envía al cliente via `postMessage` en el evento `activate`
- `js/app.js` recibe la versión y la almacena en `window.APP_VERSION`
- `dashboard.js` usa `window.APP_VERSION` para mostrar la versión en el footer
- **Install**: pre-cachea assets locales con `Promise.allSettled` + `cache.add()` individual + `skipWaiting()`
- **Activate**: limpia caches de versiones anteriores + envía versión al cliente
- **Fetch**: cache-first (cache → network → cachea respuesta). Si offline + navegación SPA → sirve `index.html`. Para scripts/styles sin cache ni red → respuesta vacía
- **Message**: recibe `{ type: "SKIP_WAITING" }` y `{ type: "GET_VERSION" }` del cliente
- Recursos CDN se cachean perezosamente en el primer fetch exitoso (no en pre-cache)
- Registrado desde `js/app.js`, no desde `index.html`

**Para cambiar la versión:** Actualizar `CACHE_NAME` en `service-worker.js`. La nueva versión se propagará automáticamente a `window.APP_VERSION` y al dashboard.

**Banner de actualización:** `js/app.js` escucha `updatefound` en el registro del SW y muestra `.sw-update-banner` (barra fija superior) cuando hay nueva versión en espera. El botón "Recargar" envía `SKIP_WAITING` al SW y fuerza `controllerchange` → recarga la página.

## Convenciones CSS

- `css/style.css` es el único punto de entrada — usa cadena de `@import`
- `css/variables.css` contiene todas las custom properties
- `css/base.css` — reset, scrollbar, keyframes (`fadeIn`, `slideDown`, `slideInRight`, etc.) y `prefers-reduced-motion`
- CSS específico de vista en `css/views/<nombre-vista>.css`
- Tema oscuro fijo, mobile-first con media queries en `responsive.css`
- `--header-height: 56px`, `--bottom-nav-height: 64px`
- `--content-max-width: 720px`

## Estilo de código

- Comentarios JS en español
- Template literals con concatenación `+` para strings HTML multilínea
- Sin arrow functions para funciones nombradas de nivel superior (usa `function`)
- Imports de módulos ES: rutas relativas desde la ubicación del archivo (ej. `../../db.js` desde vistas anidadas)
- `javascript:void(0)` en links con handlers inline que no deben navegar
- `e.target.closest()` para delegación de eventos en listas dinámicas

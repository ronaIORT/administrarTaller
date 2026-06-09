# AGENTS.md — Taller de Costura PWA

## Stack

- **Vanilla JS** (módulos ES, sin bundler, sin npm, sin TypeScript)
- **Router SPA basado en hash** en `js/app.js` — carga vistas según `location.hash`
- **IndexedDB** mediante Dexie 4 (`js/db.js`) — esquema en `db.version(1).stores()`, sin datos semilla
- **Tema oscuro** con custom properties CSS en `css/variables.css`
- **Service Worker** en `service-worker.js` — pre-cache install, cache-first fetch, SPA fallback offline, message handler para skipWaiting
- **Banner de actualización** en `js/app.js` — notifica al usuario cuando hay nueva versión del SW lista
- Todas las librerías externas cargadas desde CDN: Dexie, SheetJS (xlsx), jsPDF + AutoTable, Chart.js, Inter

## Comandos

```bash
python -m http.server 8080
```

O usar VS Code Live Server. La PWA requiere `localhost` o HTTPS.

## Arquitectura

```
index.html          → scripts CDN + <main id="app"> + <script type="module" src="js/app.js">
js/app.js           → Router, bottom-nav (singleton), registro del SW con updatefound, limpieza de FABs
js/db.js            → Esquema Dexie (sin populate/seed)
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
| `#historial-pagos` | `gestion-pagos.js` (3 tabs: resumen, registrar, historial) | Sí |
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

### Esquema (IndexedDB mediante Dexie 4.x)

```
db.prendas:       ++id, &nombre, tareas[]
db.trabajadores:  ++id, &nombre
db.cortes:        ++id, estado, prendaId, fechaCreacion, fechaFinalizacion
                   (tallas[], tareas[asignaciones[]] son arrays embebidos)
db.pagos:         ++id, trabajadorId, corteId, fecha
```

- **Sin restricciones FK** — borrados en cascada manuales (eliminar pagos por `corteId`, luego eliminar el corte)
- **Sin datos semilla** — la BD arranca vacía. Para reiniciar, borrar `TallerCosturaDB` desde DevTools → Application → IndexedDB

## Service Worker

- `CACHE_NAME = "taller-costura-v2.19"` — incrementar al modificar assets
- **Install**: pre-cachea 38 assets locales con `addAll` + `skipWaiting()`
- **Activate**: limpia caches de versiones anteriores + `clients.claim()`
- **Fetch**: cache-first (cache → network → cachea respuesta). Si offline + navegación SPA → sirve `index.html`. Para scripts/styles sin cache ni red → respuesta vacía
- **Message**: recibe `{ type: "SKIP_WAITING" }` del cliente para forzar activación
- Recursos CDN se cachean perezosamente en el primer fetch exitoso (no en `addAll`)
- Registrado desde `js/app.js`, no desde `index.html`

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

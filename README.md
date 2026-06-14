# Taller de Costura PWA

Aplicación web progresiva (PWA) para la gestión integral de un taller de costura: cortes, prendas, trabajadores, asignaciones de tareas y pagos.

## Stack

- **Vanilla JS** (módulos ES, sin bundler, sin npm, sin TypeScript)
- **SPA con hash routing** en `js/app.js` — carga vistas según `location.hash`
- **IndexedDB** con Dexie 4.0.8 (`js/db.js`) — esquema multi-versión, BD arranca vacía
- **Tema oscuro** mobile-first con CSS custom properties (`css/variables.css`)
- **Service Worker** en `service-worker.js` — pre-cache con `Promise.allSettled`, cache-first fetch, SPA fallback offline
- **CDN**: Dexie 4.0.8, SheetJS (xlsx), jsPDF 2.5.1 + AutoTable 3.8.1, Chart.js 4.4.7, Inter

## Inicio rápido

```bash
python -m http.server 8080
```

O VS Code Live Server. La PWA requiere `localhost` o HTTPS.

## Estructura del proyecto

```
index.html                → Shell SPA: scripts CDN + <main id="app"> + <script type="module" src="js/app.js">
manifest.json             → PWA manifest (name, short_name, icons 192/512, theme_color #1a1a2e, display standalone, orientation portrait, lang es-BO)
service-worker.js         → Install pre-cache, fetch cache-first, message skipWaiting + getVersion
AGENTS.md                 → Convenciones y documentación técnica para agentes de IA

js/
  app.js                  → Router hash, bottom-nav singleton, registro SW + updatefound, banner actualización
  db.js                   → Esquema Dexie multi-versión (v1→v4), compound index [corteId+trabajadorId] en pagos
  utils.js                → Escape HTML, conversión centavos/bolivianos, formatos de moneda

  views/
    shared.js             → Modal confirmar, toast, tabs con swipe, header con volver, estado vacío
    shared-pagos.js       → Modal de pago reutilizable (usado por tab-pagos y tab-trabajador)
    dashboard.js          → KPIs + 3 gráficos con Chart.js
    gestion-cortes.js     → Lista de cortes con filtros y progreso
    gestion-prendas.js    → CRUD prendas + importación Excel (SheetJS)
    gestion-trabajadores.js → CRUD trabajadores
    nuevo-corte.js        → Crear corte (seleccionar prenda, tallas, asignar tareas)

    gestion-pagos/
      gestion-pagos.js    → Vista principal (punto de entrada), orquesta 3 tabs
      tab-pagos.js        → Tab: registro y listado de pagos a trabajadores
      tab-gastos.js       → Tab: registro y listado de gastos del taller
      tab-historial.js    → Tab: historial combinado de pagos y gastos

    administrar-tareas/
      administrar-tareas.js         → Vista principal (punto de entrada), orquesta 5 tabs
      tab-resumen.js                → Tab: resumen del corte con totales y estado
      tab-corte.js                  → Tab: editar datos del corte (tallas, fechas, estado)
      tab-trabajador.js             → Tab: asignaciones por trabajador + pagos individuales
      tab-editar.js                 → Tab: editar tareas asignadas al corte
      tab-asignar.js                → Tab: asignar trabajadores a tareas del corte
      asignacion-compartida.js      → Lógica compartida de asignación/eliminación entre tabs

css/
  style.css             → Único punto de entrada, cadena @import
  variables.css         → Custom properties del tema oscuro
  base.css              → Reset, scrollbar, keyframes (fadeIn, slideDown, slideInRight), prefers-reduced-motion
  layout.css            → Layout general (header, main, content wrapper)
  components.css        → Componentes reutilizables (cards, badges, botones, inputs, selects)
  modals.css            → Modal de confirmación y modal de pago
  bottom-nav.css        → Barra de navegación inferior
  responsive.css        → Media queries mobile-first, --content-max-width: 720px

  views/
    dashboard.css
    gestion-cortes.css
    gestion-prendas.css
    gestion-trabajadores.css
    gestion-pagos.css
    nuevo-corte.css
    administrar-tareas.css

icons/                  → Iconos PWA: icon-192x192.png, icon-512x512.png
```

## Rutas hash

| Ruta | Vista | Bottom nav |
|---|---|---|
| `#dashboard` | KPIs + Chart.js (3 gráficos) | Sí |
| `#gestion-cortes` | Lista de cortes | Sí |
| `#gestion-prendas` | CRUD prendas | Sí |
| `#gestion-trabajadores` | CRUD trabajadores | Sí |
| `#gestion-pagos` | 3 tabs: Pagos, Gastos, Historial | Sí |
| `#nuevo-corte` | Formulario de corte | Oculto |
| `#administrar-tareas/:id` | 5 tabs: Resumen, Corte, Trabajador, Editar, Asignar | Oculto |
| `#nueva-prenda` / `#editar-prenda/:id` | Formulario prenda | Oculto |

El bottom-nav se oculta para rutas que contienen `/` (excepto `#dashboard`) y para `#nuevo-corte` / `#nueva-prenda`.

## Manejo de moneda

| Campo | Unidad | Tipo | Ejemplo |
|---|---|---|---|
| `precioUnitario` (tareas) | **Centavos** | Entero | `5` = 0.05 Bs |
| `precioVentaUnitario` | **Bolivianos** | Decimal | `15.00` = 15 Bs |
| `monto` (pagos) | **Bolivianos** | Decimal | `25.50` = 25.50 Bs |
| `monto` (gastos) | **Bolivianos** | Decimal | `12.00` = 12.00 Bs |

Funciones en `js/utils.js`:

| Función | Entrada | Salida | Uso |
|---|---|---|---|
| `centavosABolivianos(c)` | Centavos (int) | Bolivianos (float) | Precio unitario de tareas |
| `bolivianosACentavos(b)` | Bolivianos (float) | Centavos (int) | Conversión inversa |
| `formatBs(bsDecimal)` | Bolivianos (float) | `"X.XX Bs"` | Pagos, gastos, totales |
| `formatBsCtv(centavos)` | Centavos (int) | `"X.XX Bs"` | Precios de tareas (legacy) |
| `formatCtv(centavos)` | Centavos (int) | `"X.XX"` | Solo número sin sufijo |
| `formatCostoTotal(total)` | Total en Bs (float) | `"X.XX Bs"` | Costos totales |
| `formatNumero(n)` | Número | `"1,234.56"` | Formato con separadores |

## Base de datos

### Esquema (IndexedDB mediante Dexie 4.x, versión actual: 4)

```
db.prendas:       ++id, &nombre, tareas[]
db.trabajadores:  ++id, &nombre
db.cortes:        ++id, estado, prendaId, fechaCreacion, fechaFinalizacion
                   (tallas[], tareas[], asignaciones[] son arrays embebidos)
db.pagos:         ++id, [corteId+trabajadorId], trabajadorId, corteId, fecha, monto, nota
db.gastos:        ++id, categoria, fecha, descripcion, monto, nota
```

- **Sin restricciones FK** — borrados en cascada manuales (eliminar pagos por `corteId`, luego eliminar el corte)
- **Compound index** `[corteId+trabajadorId]` en pagos permite búsqueda eficiente por par único
- **Sin datos semilla** — la BD arranca vacía. Para reiniciar: DevTools → Application → IndexedDB → borrar `TallerCosturaDB`

## Service Worker

- `CACHE_NAME` definido en `service-worker.js` — fuente única de verdad de la versión
- La versión se extrae de `CACHE_NAME` y se envía al cliente via `postMessage` en el evento `activate`
- `js/app.js` recibe la versión y la almacena en `window.APP_VERSION`
- `dashboard.js` usa `window.APP_VERSION` para mostrar la versión en el footer
- **Install**: pre-cachea assets locales con `Promise.allSettled` + `cache.add()` individual + `skipWaiting()`
- **Activate**: limpia caches de versiones anteriores + envía versión al cliente
- **Fetch**: cache-first (cache → network → cachea respuesta). Si offline + navegación SPA → sirve `index.html`. Para scripts/styles sin cache ni red → respuesta vacía
- **Message**: recibe `{ type: "SKIP_WAITING" }` y `{ type: "GET_VERSION" }` del cliente
- **Actualización**: `js/app.js` escucha `updatefound` y muestra banner "Nueva versión disponible" al detectar SW nuevo; botón "Recargar" envía `SKIP_WAITING` y fuerza recarga

## Patrón de vistas

Toda vista sigue el mismo ciclo: **renderizar HTML → cargar datos de la BD → adjuntar event listeners**. Las vistas se re-renderizan por completo tras cada mutación (no hay reconciliación diferencial).

Para los handlers `onclick` inline en template strings, las funciones se exportan globalmente:

```js
window.miFuncionGlobal = miFuncionGlobal;
```

### Módulos compartidos

- **`shared.js`** — Helpers de UI: `mostrarModalConfirmar()`, `mostrarToast()`, `crearTabs()` (con swipe), `crearHeader()`, `estadoVacioHTML()`
- **`shared-pagos.js`** — Modal de pago reutilizable, usado por `tab-pagos.js` y `tab-trabajador.js`. Valida contra la BD en tiempo real para evitar race conditions entre vistas
- **`asignacion-compartida.js`** — Lógica de asignación y eliminación de tareas, compartida entre `tab-editar.js` y `tab-corte.js`

## Convenciones CSS

- `css/style.css` es el único punto de entrada — usa cadena de `@import`
- Tema oscuro fijo, mobile-first con media queries en `responsive.css`
- `--header-height: 56px`, `--bottom-nav-height: 64px`
- `--content-max-width: 720px`

## Convenciones de código

- Comentarios JS en español
- Template literals con concatenación `+` para strings HTML multilínea
- Sin arrow functions para funciones nombradas de nivel superior (usa `function`)
- `e.target.closest()` para delegación de eventos en listas dinámicas
- `javascript:void(0)` en links con handlers inline que no deben navegar

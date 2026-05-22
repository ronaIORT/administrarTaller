# AGENTS.md — Taller de Costura PWA

## Stack

- **Vanilla JS** (módulos ES, sin bundler, sin npm, sin TypeScript)
- **Router SPA basado en hash** en `js/app.js` — carga vistas según `location.hash`
- **IndexedDB** mediante Dexie 4 (`js/db.js`) — esquema en `db.version(1).stores()`, datos semilla en `db.on("populate")`
- **Tema oscuro** con custom properties CSS en `css/variables.css`
- **Service Worker** en `service-worker.js` — solo install/activate (sin handler fetch/cache aún)
- Todas las librerías externas cargadas desde CDN: Dexie, SheetJS (xlsx), jsPDF + AutoTable, Chart.js, Inter

## Comandos

Sin paso de build, linter, test runner ni gestor de paquetes. Servir archivos estáticos:

```
python -m http.server 8080
```

O usar VS Code Live Server. La PWA requiere `localhost` o HTTPS para registrar el Service Worker.

## Arquitectura

```
index.html          → scripts CDN + <main id="app"> + <script type="module" src="js/app.js">
js/app.js           → Router, bottom-nav (singleton), registro del SW, limpieza de FABs
js/db.js            → Esquema Dexie, datos semilla
js/utils.js         → Escape HTML, conversión y formateo de moneda
js/views/shared.js  → Modal confirmar, toast, tabs, header, estado vacío (helpers de UI compartidos)
js/views/           → Un archivo JS por ruta
css/style.css       → Cadena @import (variables → base → layout → components → modals → bottom-nav → responsive → views/*)
css/views/          → Un archivo CSS por vista
```

### Rutas hash

| Ruta | Archivo de vista | Bottom nav |
|---|---|---|
| `#dashboard` | Placeholder | Sí |
| `#gestion-cortes` | `gestion-cortes.js` | Sí |
| `#gestion-prendas` | `gestion-prendas.js` | Sí |
| `#gestion-trabajadores` | `gestion-trabajadores.js` | Sí |
| `#historial-pagos` | Placeholder | Sí |
| `#nuevo-corte` | `nuevo-corte.js` | Oculto |
| `#administrar-tareas/:id` | `administrar-tareas/*.js` (vista de 5 tabs) | Oculto |
| `#nueva-prenda` / `#editar-prenda/:id` | `gestion-prendas.js` | Oculto |

Bottom-nav oculto para rutas que contienen `/` (excepto `#dashboard`) y para `#nuevo-corte` / `#nueva-prenda`.

### Patrón de vistas

Toda vista sigue: **renderizar HTML → cargar datos de la BD → adjuntar event listeners**. Las vistas se re-renderizan por completo tras cada mutación (sin actualizaciones parciales del DOM).

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
| `monto` (pagos) | **Centavos** | Entero | `2550` = 25.50 Bs |

Funciones de conversión en `js/utils.js`: `centavosABolivianos()`, `bolivianosACentavos()`, `formatBs()`, `formatCtv()`, `formatCostoTotal()`, `formatNumero()`. Nunca duplicar la lógica de conversión.

## Base de datos

### Esquema (IndexedDB mediante Dexie 4.x)

```
db.prendas:       ++id, &nombre, tareas[]
db.trabajadores:  ++id, &nombre
db.cortes:        ++id, estado, prendaId, fechaCreacion, fechaFinalizacion
                   (tallas[], tareas[asignaciones[]] son arrays embebidos)
db.pagos:         ++id, trabajadorId, corteId, fecha
```

- **Sin restricciones FK** — los borrados en cascada deben hacerse manualmente (eliminar pagos por `corteId`, luego eliminar el corte)
- `db.on("populate")` siembra prendas y trabajadores iniciales al crear la BD por primera vez
- Los datos semilla solo se reinician si la BD se elimina por completo (un upgrade de versión limpia los datos viejos)

## Service Worker

- `CACHE_NAME = "taller-costura-v1.0"` — incrementar este string al modificar assets
- Actualmente sin handler `fetch` — solo `install`/`activate` con limpieza de caches antiguos
- Registrado desde `js/app.js`, no desde `index.html`
- `skipWaiting()` en install, `clients.claim()` en activate

## Convenciones CSS

- `css/style.css` es el único punto de entrada — usa cadena de `@import`
- `css/variables.css` contiene todas las custom properties (colores, espaciado, tipografía, sombras, transiciones, layout)
- `css/base.css` — reset, estilos de scrollbar, keyframes compartidos
- El CSS específico de cada vista va en `css/views/<nombre-vista>.css`
- Solo tema oscuro, mobile-first con media queries en `responsive.css`
- `--header-height: 56px`, `--bottom-nav-height: 64px` — las áreas de contenido deben contemplar estas alturas
- `--content-max-width: 720px` — ancho máximo para contenedores de contenido principal

## Estilo de código

- Comentarios JS en español
- Template literals con concatenación `+` para strings HTML multilínea
- Sin arrow functions para funciones nombradas de nivel superior (usa `function`)
- Imports de módulos ES: rutas relativas desde la ubicación del archivo (ej. `../../db.js` desde vistas anidadas)
- `javascript:void(0)` en links con handlers inline que no deben navegar
- `e.target.closest()` para delegación de eventos en listas dinámicas

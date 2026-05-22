# Taller de Costura PWA

Aplicación web progresiva (PWA) para la gestión integral de un taller de costura: cortes, prendas, trabajadores, asignaciones de tareas y pagos.

## Stack

- **Vanilla JS** (ES modules, sin bundler, sin npm, sin TypeScript)
- **SPA con hash routing** en `js/app.js`
- **IndexedDB** con Dexie 4 (`js/db.js`)
- **Tema oscuro** mobile-first con CSS custom properties
- **Service Worker** para soporte offline
- **CDN**: Dexie 4, SheetJS (xlsx), jsPDF + AutoTable, Chart.js

## Inicio rápido

Servir archivos estáticos con cualquier servidor HTTP:

```bash
python -m http.server 8080
```

O usar VS Code Live Server. La PWA requiere `localhost` o HTTPS para registrar el Service Worker.

## Estructura del proyecto

```
index.html              → Shell SPA + scripts CDN + <main id="app">
manifest.json           → PWA manifest (nombre, iconos, theme-color)
service-worker.js       → Cache-First con limpieza de caches viejos
js/
  app.js                → Router hash-based, bottom-nav, registro SW
  db.js                 → Esquema Dexie + datos semilla
  utils.js              → Escape HTML, conversión y formateo de moneda
  views/
    shared.js           → Modal confirmar, toast, tabs, header, estado vacío
    gestion-cortes.js   → Lista de cortes con filtros y progreso
    gestion-prendas.js  → CRUD prendas + importación Excel
    gestion-trabajadores.js → CRUD trabajadores
    nuevo-corte.js      → Crear corte (seleccionar prenda, tallas, tareas)
    administrar-tareas/ → Vista de 5 tabs para gestionar un corte
    gestion-pagos/      → Pagos: resumen, registrar, historial
css/
  style.css             → @import chain (variables → base → layout → ...)
  variables.css         → Custom properties del tema oscuro
  views/                → CSS específico por vista
icons/                  → Íconos PWA (192x192, 512x512)
```

## Rutas hash

| Ruta | Bottom nav |
|---|---|
| `#dashboard` | Sí |
| `#gestion-cortes` | Sí |
| `#gestion-prendas` | Sí |
| `#gestion-trabajadores` | Sí |
| `#historial-pagos` | Sí |
| `#nuevo-corte` | Oculto |
| `#administrar-tareas/:id` | Oculto |
| `#nueva-prenda` / `#editar-prenda/:id` | Oculto |

## Manejo de moneda

| Campo | Unidad | Tipo | Ejemplo |
|---|---|---|---|
| `precioUnitario` (tareas) | Centavos | Entero | `5` = 0.05 Bs |
| `precioVentaUnitario` | Bolivianos | Decimal | `15.00` = 15 Bs |
| `monto` (pagos) | Centavos | Entero | `2550` = 25.50 Bs |

Usar las funciones de `js/utils.js` para toda conversión: `centavosABolivianos()`, `bolivianosACentavos()`, `formatBs()`, `formatCtv()`.

## Base de datos

- **Sin restricciones FK** — los borrados en cascada deben hacerse manualmente
- Datos semilla en `db.on("populate")` (solo en primera creación de la BD)
- `CACHE_NAME = "taller-costura-v1.0"` — incrementar al modificar assets

## Patrón de vistas

Toda vista sigue el ciclo: **renderizar HTML → cargar datos de la BD → adjuntar event listeners**. Las vistas se re-renderizan por completo tras cada mutación.

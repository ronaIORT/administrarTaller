import { db } from "../db.js";
import { escaparHTML, formatBs, formatCtv, formatCostoTotal } from "../utils.js";
import { mostrarModalConfirmar, mostrarToast, crearHeader, estadoVacioHTML } from "./shared.js";

// ============================================================
// CONSTANTES DEL MÓDULO
// Se usan dos contenedores FAB separados porque las prendas y
// las tareas tienen sus propias acciones flotantes.
// ============================================================

/** ID del contenedor de FABs para acciones de prenda */
const FAB_CONTAINER_ID = "prendas-fab-container";
/** ID del contenedor de FABs para acciones de tarea */
const TASK_FAB_CONTAINER_ID = "tareas-fab-container";

/** Prenda actualmente seleccionada (o null si ninguna) */
let prendaSeleccionada = null;

/** Timeouts para ocultar FABs con delay (permite animación CSS de salida) */
let ocultarFABsTimeout = null;
let ocultarTareasFABsTimeout = null;

/** Índice de la fila de tarea actualmente seleccionada (o null) */
let filaTareaSeleccionada = null;

/** AbortController para cancelar event listeners del documento al cambiar de vista */
let clickAbortControllerP = null;

// ============================================================
// RENDER PRINCIPAL - Vista de gestión de prendas
// Mismo patrón que trabajadores: render → cargarDatos → eventos.
// ============================================================

export async function renderGestionPrendas() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.add("app--sidebar");

  // Cancelar listeners de la vista anterior para evitar memory leaks.
  if (clickAbortControllerP) {
    clickAbortControllerP.abort();
    clickAbortControllerP = null;
  }
  clickAbortControllerP = new AbortController();

  const container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  app.appendChild(container);

  deseleccionarPrenda();
  container.innerHTML = `
    <section class="prendas-header-actions">
      <input type="text" id="input-buscar-prenda" class="form-input" placeholder="Buscar prenda..." autocomplete="off" />
      <button id="btn-importar-excel" class="btn btn--outline btn--sm" aria-label="Importar desde Excel">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Importar
      </button>
    </section>
    <section aria-label="Lista de prendas" id="lista-prendas-container">
      <div class="spinner"></div>
    </section>
    <button class="btn btn--fab" id="btn-nueva-prenda" aria-label="Nueva prenda">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
  `;

  document.getElementById("btn-nueva-prenda").addEventListener("click", () => {
    location.hash = "#nueva-prenda";
  });

  document.getElementById("btn-importar-excel").addEventListener("click", abrirImportadorExcel);

  const inputBuscar = document.getElementById("input-buscar-prenda");
  inputBuscar.addEventListener("input", () => {
    filtrarPrendas(inputBuscar.value.trim());
  });

  // Delegación de eventos en el documento con AbortController
  // para cancelar al cambiar de vista y evitar memory leaks.
  document.addEventListener("click", manejarClickDocumento, { signal: clickAbortControllerP.signal });

  await cargarPrendas();
}

// ============================================================
// LISTA DE PRENDAS - Carga, filtro y render
// ============================================================

/** Cache local de todas las prendas para filtrar sin consultar DB */
let todasLasPrendas = [];

async function cargarPrendas() {
  const container = document.getElementById("lista-prendas-container");
  if (!container) return;

  try {
    todasLasPrendas = await db.prendas.orderBy("nombre").toArray();
    renderListaPrendas(todasLasPrendas);
  } catch (err) {
    console.error("Error cargando prendas:", err);
    container.innerHTML = estadoVacioHTML("Error al cargar", "Intenta recargar la pagina");
  }
}

function renderListaPrendas(prendas) {
  const container = document.getElementById("lista-prendas-container");
  if (!container) return;

  if (prendas.length === 0) {
    container.innerHTML = estadoVacioHTML("Sin prendas", "Crea tu primera prenda o importa desde Excel");
    return;
  }

  container.innerHTML = `
    <ul class="lista-prendas" role="list">
      ${prendas.map((p, i) => {
        const numTareas = p.tareas ? p.tareas.length : 0;
        const totalCosto = p.tareas
          ? p.tareas.reduce((sum, t) => sum + (t.precioUnitario || 0), 0)
          : 0;
        const nombreEscapado = escaparHTML(p.nombre);
        return `
        <li class="prenda-card" data-id="${p.id}" data-nombre="${nombreEscapado}" role="listitem" tabindex="0" style="animation-delay: ${i * 50}ms">
          <div class="prenda-card__contenido">
            <span class="prenda-card__nombre">${nombreEscapado}</span>
            <span class="prenda-card__meta">${numTareas} tarea${numTareas !== 1 ? "s" : ""} &middot; ID: ${p.id} &middot; ${formatCostoTotal(totalCosto)}</span>
          </div>
          <div class="prenda-card__acciones">
            <button class="btn btn--ghost btn--sm btn-editar-prenda" data-id="${p.id}" data-nombre="${nombreEscapado}" aria-label="Editar ${nombreEscapado}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn--ghost btn--sm btn-duplicar-prenda" data-id="${p.id}" data-nombre="${nombreEscapado}" aria-label="Duplicar ${nombreEscapado}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button class="btn btn--ghost btn--sm btn-eliminar-prenda" data-id="${p.id}" data-nombre="${nombreEscapado}" aria-label="Eliminar ${nombreEscapado}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </li>
      `;
    }).join("")}
    </ul>
  `;
}

// Filtra localmente (sin consultar DB) usando el cache `todasLasPrendas`.
async function filtrarPrendas(texto) {
  if (!texto) {
    renderListaPrendas(todasLasPrendas);
    return;
  }
  const filtradas = todasLasPrendas.filter((p) =>
    p.nombre.toLowerCase().includes(texto.toLowerCase())
  );
  renderListaPrendas(filtradas);
}

// ============================================================
// CLICK HANDLER - Event delegation para toda la vista
// Un solo listener en document maneja clicks en cards,
// FABs y botones inline. AbortController lo cancela al
// cambiar de vista para prevenir memory leaks.
// ============================================================

function manejarClickDocumento(e) {
  const fueEditar = e.target.closest(".btn-editar-prenda");
  const fueDuplicar = e.target.closest(".btn-duplicar-prenda");
  const fueEliminar = e.target.closest(".btn-eliminar-prenda");

  if (fueEditar) {
    const id = parseInt(fueEditar.dataset.id);
    location.hash = `#editar-prenda/${id}`;
    return;
  }
  if (fueDuplicar) {
    abrirModalDuplicar(parseInt(fueDuplicar.dataset.id), fueDuplicar.dataset.nombre);
    return;
  }
  if (fueEliminar) {
    confirmarEliminarPrenda(parseInt(fueEliminar.dataset.id), fueEliminar.dataset.nombre);
    return;
  }

  const fueFAB = e.target.closest(".fab-btn");
  const fueCard = e.target.closest(".prenda-card");
  const fueTareaFab = e.target.closest(".tarea-fab-btn");
  const fueTareaRow = e.target.closest(".tarea-tabla-row");

  if (fueFAB && prendaSeleccionada) {
    if (fueFAB.classList.contains("fab-edit")) {
      location.hash = `#editar-prenda/${prendaSeleccionada.id}`;
    } else if (fueFAB.classList.contains("fab-duplicate")) {
      abrirModalDuplicar(prendaSeleccionada.id, prendaSeleccionada.nombre);
    } else if (fueFAB.classList.contains("fab-delete")) {
      confirmarEliminarPrenda(prendaSeleccionada.id, prendaSeleccionada.nombre);
    }
    return;
  }

  if (fueTareaFab && filaTareaSeleccionada !== undefined && filaTareaSeleccionada !== null) {
    const idx = filaTareaSeleccionada;
    if (fueTareaFab.classList.contains("tarea-fab-edit")) {
      abrirModalEditarTarea(idx);
    } else if (fueTareaFab.classList.contains("tarea-fab-add")) {
      abrirModalAgregarTarea(idx);
    } else if (fueTareaFab.classList.contains("tarea-fab-delete")) {
      eliminarTarea(idx);
    }
    return;
  }

  if (fueCard && !e.target.closest(".tarea-tabla-row") && !e.target.closest("button")) {
    const id = parseInt(fueCard.dataset.id);
    // Clic redundante: no hacer nada si ya estaba seleccionada.
    if (prendaSeleccionada && prendaSeleccionada.id === id) {
      return;
    }
    seleccionarPrenda(id, fueCard.dataset.nombre);
    return;
  }

  // Clic dentro de fila de tarea o FAB de tarea → manejo específico.
  if (fueTareaRow || fueTareaFab) return;

  // Clic fuera de cualquier card/FAB → deseleccionar todo.
  if (prendaSeleccionada && !fueFAB && !fueCard) {
    deseleccionarPrenda();
  }

  if (filaTareaSeleccionada !== null && filaTareaSeleccionada !== undefined) {
    deseleccionarFilaTarea();
  }
}

// ============================================================
// SELECCIÓN DE PRENDA + FABs
// Al hacer clic en una card de prenda se muestran FABs
// flotantes con acciones (editar, duplicar, eliminar).
// Los FABs se crean una sola vez y se muestran/ocultan con CSS.
// ============================================================

function seleccionarPrenda(id, nombre) {
  deseleccionarPrenda();
  prendaSeleccionada = { id, nombre };

  const card = document.querySelector(`.prenda-card[data-id="${id}"]`);
  if (card) card.classList.add("selected");

  mostrarFABs();
}

function deseleccionarPrenda() {
  const card = document.querySelector(".prenda-card.selected");
  if (card) card.classList.remove("selected");
  prendaSeleccionada = null;
  ocultarFABs();
}

function mostrarFABs() {
  if (ocultarFABsTimeout) {
    clearTimeout(ocultarFABsTimeout);
    ocultarFABsTimeout = null;
  }

  let fabContainer = document.getElementById(FAB_CONTAINER_ID);
  // Crear una sola vez, después solo mostrar/ocultar con CSS.
  if (!fabContainer) {
    fabContainer = document.createElement("div");
    fabContainer.id = FAB_CONTAINER_ID;
    fabContainer.className = "prendas-fab-container";
    fabContainer.innerHTML = `
      <button class="fab-btn fab-edit" aria-label="Editar prenda">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="fab-btn fab-duplicate" aria-label="Duplicar prenda">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      </button>
      <button class="fab-btn fab-delete" aria-label="Eliminar prenda">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;
    document.body.appendChild(fabContainer);
  }

  fabContainer.classList.remove("visible");
  // requestAnimationFrame permite al navegador pintar antes de
  // aplicar la clase que dispara la animación CSS.
  requestAnimationFrame(() => {
    fabContainer.classList.add("visible");
  });
}

// Ocultar con delay de 300ms permite que la animación de salida
// (definida en CSS) se complete antes de remover el elemento.
function ocultarFABs() {
  const fabContainer = document.getElementById(FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarFABsTimeout = setTimeout(() => {
    const contenedor = document.getElementById(FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarFABsTimeout = null;
  }, 300);
}

// ============================================================
// MODAL DUPLICAR - Copia una prenda con nuevo nombre
// Hace deep clone de las tareas para evitar que la copia
// comparta referencias con la original.
// ============================================================

function abrirModalDuplicar(id, nombreActual) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-dup-titulo");

  const nombreSugerido = `${nombreActual} (copia)`;

  overlay.innerHTML = `
    <div class="modal modal--sm modal-edit">
      <div class="modal__header">
        <h3 id="modal-dup-titulo" class="modal__title">Duplicar Prenda</h3>
      </div>
      <div class="modal__body">
        <form id="form-duplicar-prenda" autocomplete="off">
          <div class="form-group">
            <label for="input-dup-nombre" class="form-label">Nombre de la prenda</label>
            <input
              type="text"
              id="input-dup-nombre"
              class="form-input"
              value="${escaparHTML(nombreSugerido)}"
              maxlength="60"
              required
              autocomplete="off"
            />
            <p id="error-dup-nombre" class="form-error" hidden></p>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary modal-cancelar">Cancelar</button>
        <button class="btn btn--primary modal-guardar">Duplicar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const input = overlay.querySelector("#input-dup-nombre");
  const errorEl = overlay.querySelector("#error-dup-nombre");

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  const cerrar = () => {
    overlay.classList.add("closing");
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  const duplicar = async () => {
    const nuevoNombre = input.value.trim();
    errorEl.hidden = true;
    input.classList.remove("form-input--error");

    if (!nuevoNombre) {
      errorEl.textContent = "El nombre no puede estar vacio";
      errorEl.hidden = false;
      input.classList.add("form-input--error");
      input.focus();
      return;
    }

    try {
      const existe = await db.prendas.where("nombre").equals(nuevoNombre).first();
      if (existe) {
        errorEl.textContent = "Ya existe una prenda con ese nombre";
        errorEl.hidden = false;
        input.classList.add("form-input--error");
        input.focus();
        return;
      }

      const prenda = await db.prendas.get(id);
      if (!prenda) {
        cerrar();
        return;
      }

      // Deep clone de tareas: cada tarea se copia con spread
      // para no compartir la referencia del objeto original.
      const copia = {
        nombre: nuevoNombre,
        tareas: prenda.tareas ? prenda.tareas.map((t) => ({ ...t })) : []
      };

      await db.prendas.add(copia);
      cerrar();
      deseleccionarPrenda();
      await cargarPrendas();
      mostrarToast("Prenda duplicada", "success");
    } catch (err) {
      console.error("Error al duplicar:", err);
      mostrarToast("Error al duplicar", "error");
    }
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", duplicar);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });

  const form = overlay.querySelector("#form-duplicar-prenda");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    duplicar();
  });

  const handler = (e) => {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", handler);
    }
  };
  document.addEventListener("keydown", handler);
}

// ============================================================
// CONFIRMAR ELIMINAR PRENDA
// Verifica cortes dependientes antes de permitir eliminación.
// IndexedDB no tiene FK constraints, el cascade delete debe
// implementarse manualmente.
// ============================================================

async function confirmarEliminarPrenda(id, nombre) {
  let count = 0;

  try {
    count = await db.cortes.where("prendaId").equals(id).count();
  } catch (err) {
    console.error("Error verificando cortes:", err);
  }

  const mensaje = count > 0
    ? `No se puede eliminar "${nombre}" porque esta asociada a ${count} corte(s). Elimina primero los cortes asociados.`
    : `Estas seguro de eliminar "${nombre}"? Esta accion no se puede deshacer.`;

  mostrarModalConfirmar(
    "Eliminar Prenda",
    mensaje,
    count > 0 ? "warning" : "danger",
    async () => {
      if (count > 0) return;
      try {
        await db.prendas.delete(id);
        deseleccionarPrenda();
        await cargarPrendas();
        mostrarToast("Prenda eliminada", "success");
      } catch (err) {
        console.error("Error al eliminar:", err);
        mostrarToast("Error al eliminar", "error");
      }
    }
  );
}

// ============================================================
// IMPORTADOR EXCEL - Importa prendas desde archivo .xlsx/.csv
// Formato esperado: columna 1 = nombre, columnas 2+ = pares
// (nombre tarea, precio). Usa SheetJS para parsear el archivo.
// ============================================================

function abrirImportadorExcel() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xlsx,.xls,.csv";
  input.hidden = true;
  document.body.appendChild(input);

  input.addEventListener("change", async (e) => {
    document.body.removeChild(input);
    const file = e.target.files[0];
    if (!file) return;

    try {
      const data = await readFile(file);
      const rows = parseExcelRows(data);
      const validas = rows.filter((r) => r.nombre && r.nombre.trim());

      if (validas.length === 0) {
        mostrarToast("No se encontraron prendas validas en el archivo", "warning");
        return;
      }

      const prendaObjs = validas.map((r) => ({
        nombre: r.nombre.trim(),
        tareas: r.tareas || []
      }));

      await db.prendas.bulkAdd(prendaObjs);
      await cargarPrendas();
      mostrarToast(`${prendaObjs.length} prenda(s) importada(s)`, "success");
    } catch (err) {
      console.error("Error importando:", err);
      mostrarToast("Error al importar archivo", "error");
    }
  });

  input.click();
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Parsea filas del Excel: col A = nombre, cols B+ = pares tarea/precio.
// Preserva precios como enteros (centavos) usando Math.round.
function parseExcelRows(data) {
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const nombre = String(row[0] || "").trim();
    if (!nombre) continue;

    const tareas = [];
    for (let j = 1; j < row.length; j += 2) {
      const tareaNombre = String(row[j] || "").trim();
      const tareaPrecio = parseFloat(row[j + 1]) || 0;
      if (tareaNombre) {
        tareas.push({
          nombre: tareaNombre,
          precioUnitario: Math.round(tareaPrecio)
        });
      }
    }

    results.push({ nombre, tareas });
  }
  return results;
}

// ============================================================
// FORMULARIO CREAR / EDITAR PRENDA
// Vista compartida para crear (id=null) y editar (id=number).
// Detecta cambios al intentar volver y pregunta si descartar.
// Las tareas son un array embebido dentro de la prenda porque
// siempre se consultan juntas; no se justifica tabla separada.
// ============================================================

export async function renderFormPrenda(id) {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.remove("app--sidebar");

  if (clickAbortControllerP) {
    clickAbortControllerP.abort();
    clickAbortControllerP = null;
  }
  clickAbortControllerP = new AbortController();
  document.addEventListener("click", manejarClickDocumento, { signal: clickAbortControllerP.signal });

  const esNueva = id === null || id === undefined;
  const titulo = esNueva ? "Nueva Prenda" : "Editar Prenda";
  const header = crearHeader(titulo, "#gestion-prendas");
  app.appendChild(header);

  const container = document.createElement("div");
  container.className = "app-container";
  app.appendChild(container);

  let prendaActual = null;
  let tareasData = [];

  if (!esNueva) {
    try {
      prendaActual = await db.prendas.get(id);
      if (!prendaActual) {
        container.innerHTML = estadoVacioHTML("Prenda no encontrada");
        return;
      }
      // Deep clone de tareas para trabajar sobre copia local.
      tareasData = prendaActual.tareas ? prendaActual.tareas.map((t) => ({ ...t })) : [];
    } catch (err) {
      container.innerHTML = estadoVacioHTML("Error al cargar la prenda");
      return;
    }
  }

  // Guardamos estado original para detectar cambios al volver.
  const nombreOriginal = esNueva ? "" : prendaActual.nombre;
  const tareasOriginalesJSON = JSON.stringify(esNueva ? [] : (prendaActual.tareas || []));

  container.innerHTML = `
    <form id="form-prenda" novalidate>
      <div class="form-group">
        <label class="form-label" for="input-nombre-prenda">Nombre de la prenda</label>
        <input
          type="text"
          id="input-nombre-prenda"
          class="form-input"
          value="${esNueva ? "" : escaparHTML(prendaActual.nombre)}"
          placeholder="Ej: Camisa, Pantalon, Chamarra"
          maxlength="60"
          required
          autocomplete="off"
        />
        <p id="error-nombre-prenda" class="form-error" hidden></p>
      </div>

      <div class="form-group">
        <div class="tareas-section-header">
          <span class="section-title">Tareas</span>
        </div>
        <div id="tareas-tabla-container">
          ${renderTareasTabla(tareasData)}
        </div>
      </div>

      <div class="form-group" id="form-agregar-tarea">
        <div class="agregar-tarea-row">
          <input type="text" id="input-nombre-tarea" class="form-input" placeholder="Nombre de la tarea" maxlength="60" autocomplete="off" />
          <div class="input-precio-ctv-wrapper">
            <input type="number" id="input-precio-tarea" class="form-input" placeholder="0" min="0" max="9999" step="1" autocomplete="off" />
            <span class="input-precio-ctv-sufijo">ctv</span>
          </div>
          <button type="button" class="btn btn--outline btn--sm" id="btn-agregar-tarea">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <p id="error-nombre-tarea-inline" class="form-error" hidden></p>
        <p id="error-precio-tarea-inline" class="form-error" hidden></p>
      </div>

      <div class="form-group" id="resumen-costo-container" style="${tareasData.length === 0 ? "display:none;" : ""}">
        <div class="resumen-costo">
          <span class="resumen-costo__label">Costo total:</span>
          <span class="resumen-costo__valor" id="span-costo-total">${formatCostoTotal(calcularCostoTotal(tareasData))}</span>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="btn-cancelar-prenda">Cancelar</button>
        <button type="submit" class="btn btn--primary" id="btn-guardar-prenda">
          ${esNueva ? "Crear Prenda" : "Guardar Cambios"}
        </button>
      </div>
    </form>
  `;

  document.getElementById("form-prenda").addEventListener("submit", async (e) => {
    e.preventDefault();
    await guardarPrenda(id);
  });

  document.getElementById("btn-cancelar-prenda").addEventListener("click", () => {
    const nombreActual = document.getElementById("input-nombre-prenda")?.value.trim() || "";
    const tareasActuales = obtenerTareasData() || [];
    const tareasActualesJSON = JSON.stringify(tareasActuales.filter((t) => t.nombre && t.nombre.trim()));
    const huboCambios = nombreActual !== nombreOriginal || tareasActualesJSON !== tareasOriginalesJSON;

    if (huboCambios) {
      mostrarModalConfirmar(
        "¿Descartar cambios?",
        "Los cambios que hiciste no se guardaran.",
        "warning",
        () => {
          location.hash = "#gestion-prendas";
        },
        "Seguir editando",
        "Descartar cambios",
        "btn--primary",
        "btn--danger"
      );
    } else {
      location.hash = "#gestion-prendas";
    }
  });

  // ============================================================
  // AGREGAR TAREA INLINE - Validaciones en tiempo real
  // ============================================================

  document.getElementById("btn-agregar-tarea").addEventListener("click", () => {
    const inputNombre = document.getElementById("input-nombre-tarea");
    const inputPrecio = document.getElementById("input-precio-tarea");
    const errorNombre = document.getElementById("error-nombre-tarea-inline");
    const errorPrecio = document.getElementById("error-precio-tarea-inline");
    const nombre = inputNombre.value.trim();
    const precio = parseInt(inputPrecio.value) || 0;

    errorNombre.hidden = true;
    errorPrecio.hidden = true;
    inputNombre.classList.remove("form-input--error");
    inputPrecio.classList.remove("form-input--error");

    if (!nombre) {
      errorNombre.textContent = "El nombre no puede estar vacio";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    if (precio < 0) {
      errorPrecio.textContent = "El precio no puede ser negativo";
      errorPrecio.hidden = false;
      inputPrecio.classList.add("form-input--error");
      inputPrecio.focus();
      return;
    }

    const nombreDuplicado = tareasData.some(
      (t) => t.nombre.trim().toLowerCase() === nombre.toLowerCase()
    );
    if (nombreDuplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre en esta prenda";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    tareasData.push({ nombre, precioUnitario: precio });
    inputNombre.value = "";
    inputPrecio.value = "";
    refrescarTareasTabla(tareasData);
  });

  document.getElementById("input-nombre-tarea").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("input-precio-tarea").focus();
    }
  });

  document.getElementById("input-precio-tarea").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("btn-agregar-tarea").click();
    }
  });

  // Delegación de eventos para filas de tarea (click en row, editar, agregar debajo, eliminar).
  container.addEventListener("click", (e) => {
    const row = e.target.closest(".tarea-tabla-row");
    if (row && !e.target.closest("button")) {
      const idx = parseInt(row.dataset.idx);
      seleccionarFilaTarea(idx);
      return;
    }

    if (e.target.closest(".btn-eliminar-tarea-row")) {
      const row = e.target.closest(".tarea-tabla-row");
      const idx = parseInt(row.dataset.idx);
      eliminarTarea(idx);
      return;
    }

    if (e.target.closest(".btn-editar-tarea-row")) {
      const row = e.target.closest(".tarea-tabla-row");
      const idx = parseInt(row.dataset.idx);
      abrirModalEditarTarea(idx);
      return;
    }

    if (e.target.closest(".btn-agregar-debajo-row")) {
      const row = e.target.closest(".tarea-tabla-row");
      const idx = parseInt(row.dataset.idx);
      abrirModalAgregarTarea(idx);
      return;
    }
  });

  // ============================================================
  // VERIFICACIÓN DE CAMBIOS AL VOLVER
  // Compara nombre y tareas con JSON.stringify para detectar
  // cambios no guardados. Si hubo cambios, pregunta confirmación.
  // ============================================================

  const btnVolver = header.querySelector("[data-nav-back]");
  if (btnVolver) {
    btnVolver.addEventListener("click", (e) => {
      e.preventDefault();

      const nombreActual = document.getElementById("input-nombre-prenda")?.value.trim() || "";
      const tareasActuales = obtenerTareasData() || [];
      const tareasActualesJSON = JSON.stringify(tareasActuales.filter((t) => t.nombre && t.nombre.trim()));

      const huboCambios = nombreActual !== nombreOriginal || tareasActualesJSON !== tareasOriginalesJSON;

      if (huboCambios) {
        mostrarModalConfirmar(
          "¿Descartar cambios?",
          "Los cambios que hiciste no se guardaran.",
          "warning",
          () => {
            location.hash = "#gestion-prendas";
          },
          "Seguir editando",
          "Descartar cambios",
          "btn--primary",
          "btn--danger"
        );
      } else {
        location.hash = "#gestion-prendas";
      }
    });
  }

  deseleccionarFilaTarea();
}

// ============================================================
// TABLA DE TAREAS - Render y refresh
// Renderiza la tabla completa cada vez que cambia (no virtual DOM).
// La tabla es suficientemente pequeña para esto.
// ============================================================

function renderTareasTabla(tareas) {
  if (tareas.length === 0) {
    return estadoVacioHTML("Sin tareas", "Agrega tareas usando el formulario de abajo");
  }

  return `
    <div class="tareas-tabla">
      <div class="tareas-tabla-header">
        <span class="tareas-tabla-header__nombre">Tarea</span>
        <span class="tareas-tabla-header__precio">Precio (ctv)</span>
        <span class="tareas-tabla-header__acciones"></span>
      </div>
      ${tareas.map((t, idx) => crearFilaTareaHTML(t, idx)).join("")}
    </div>
  `;
}

function crearFilaTareaHTML(tarea, idx) {
  const nombre = escaparHTML(tarea.nombre || "");
  const precio = tarea.precioUnitario || 0;
  const nombreMostrar = nombre || "<em>Sin nombre</em>";
  return `
    <div class="tarea-tabla-row" data-idx="${idx}" tabindex="0">
      <span class="tarea-tabla-nombre">${nombreMostrar}</span>
      <span class="tarea-tabla-precio">${formatCtv(precio)}</span>
      <div class="tarea-tabla-acciones">
        <button class="btn btn--ghost btn--sm btn-editar-tarea-row" data-idx="${idx}" aria-label="Editar tarea">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn btn--ghost btn--sm btn-agregar-debajo-row" data-idx="${idx}" aria-label="Agregar tarea debajo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="btn btn--ghost btn--sm btn-eliminar-tarea-row" data-idx="${idx}" aria-label="Eliminar tarea">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;
}

// Re-renderiza la tabla preservando la selección actual.
function refrescarTareasTabla(tareasData) {
  const container = document.getElementById("tareas-tabla-container");
  if (!container) return;

  const rowSeleccionada = document.querySelector(".tarea-tabla-row.selected");
  const idxSeleccionado = rowSeleccionada ? parseInt(rowSeleccionada.dataset.idx) : -1;

  container.innerHTML = renderTareasTabla(tareasData);
  actualizarCostoTotal(tareasData);

  // Re-aplicar clase selected después del render.
  if (idxSeleccionado >= 0 && idxSeleccionado < tareasData.length) {
    const nuevaRow = container.querySelector(`.tarea-tabla-row[data-idx="${idxSeleccionado}"]`);
    if (nuevaRow) {
      nuevaRow.classList.add("selected");
    }
  }
}

// Actualiza el resumen de costo total en tiempo real.
function actualizarCostoTotal(tareasData) {
  const container = document.getElementById("resumen-costo-container");
  const span = document.getElementById("span-costo-total");
  if (!container || !span) return;

  const total = tareasData.reduce((sum, t) => sum + (t.precioUnitario || 0), 0);
  container.style.display = total > 0 ? "block" : "none";
  span.textContent = formatCostoTotal(total);
}

function calcularCostoTotal(tareas) {
  return tareas.reduce((sum, t) => sum + (t.precioUnitario || 0), 0);
}

// ============================================================
// FABs DE TAREA - Seleccionar fila y mostrar acciones flotantes
// Similar a los FABs de prenda pero específicos para tareas.
// ============================================================

function seleccionarFilaTarea(idx) {
  deseleccionarFilaTarea();

  filaTareaSeleccionada = idx;
  const row = document.querySelector(`.tarea-tabla-row[data-idx="${idx}"]`);
  if (row) row.classList.add("selected");

  mostrarTareaFABs();
}

function deseleccionarFilaTarea() {
  const row = document.querySelector(".tarea-tabla-row.selected");
  if (row) row.classList.remove("selected");
  filaTareaSeleccionada = null;
  ocultarTareaFABs();
}

function mostrarTareaFABs() {
  if (ocultarTareasFABsTimeout) {
    clearTimeout(ocultarTareasFABsTimeout);
    ocultarTareasFABsTimeout = null;
  }

  let fabContainer = document.getElementById(TASK_FAB_CONTAINER_ID);
  if (!fabContainer) {
    fabContainer = document.createElement("div");
    fabContainer.id = TASK_FAB_CONTAINER_ID;
    fabContainer.className = "tareas-fab-container";
    fabContainer.innerHTML = `
      <button class="tarea-fab-btn tarea-fab-edit" aria-label="Editar tarea">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="tarea-fab-btn tarea-fab-add" aria-label="Agregar tarea debajo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      </button>
      <button class="tarea-fab-btn tarea-fab-delete" aria-label="Eliminar tarea">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    document.body.appendChild(fabContainer);
  }

  fabContainer.classList.remove("visible");
  requestAnimationFrame(() => {
    fabContainer.classList.add("visible");
  });
}

function ocultarTareaFABs() {
  const fabContainer = document.getElementById(TASK_FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarTareasFABsTimeout = setTimeout(() => {
    const contenedor = document.getElementById(TASK_FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarTareasFABsTimeout = null;
  }, 300);
}

// ============================================================
// MODAL EDITAR TAREA - Cambiar nombre y precio de una tarea
// ============================================================

function abrirModalEditarTarea(idx) {
  const row = document.querySelector(`.tarea-tabla-row[data-idx="${idx}"]`);
  if (!row) return;

  const tareasData = obtenerTareasData();
  if (!tareasData || idx >= tareasData.length) return;

  const tarea = tareasData[idx];
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-tarea-titulo");

  overlay.innerHTML = `
    <div class="modal modal--sm modal-edit">
      <div class="modal__header">
        <h3 id="modal-tarea-titulo" class="modal__title">Editar Tarea</h3>
      </div>
      <div class="modal__body">
        <form id="form-editar-tarea" autocomplete="off">
          <div class="form-group">
            <label for="input-tarea-nombre" class="form-label">Nombre de la tarea</label>
            <input
              type="text"
              id="input-tarea-nombre"
              class="form-input"
              value="${escaparHTML(tarea.nombre || "")}"
              maxlength="60"
              required
              autocomplete="off"
            />
          </div>
          <div class="form-group">
            <label for="input-tarea-precio" class="form-label">Precio (ctv)</label>
            <input
              type="number"
              id="input-tarea-precio"
              class="form-input"
              value="${tarea.precioUnitario || 0}"
              min="0"
              max="9999"
              step="1"
              autocomplete="off"
            />
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary modal-cancelar">Cancelar</button>
        <button class="btn btn--primary modal-guardar">Guardar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const inputNombre = overlay.querySelector("#input-tarea-nombre");
  const inputPrecio = overlay.querySelector("#input-tarea-precio");

  requestAnimationFrame(() => {
    inputNombre.focus();
  });

  inputNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputPrecio.focus();
    }
  });

  inputPrecio.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      overlay.querySelector(".modal-guardar").click();
    }
  });

  const cerrar = () => {
    overlay.classList.add("closing");
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  const guardar = () => {
    const nuevoNombre = inputNombre.value.trim();
    const nuevoPrecio = parseInt(overlay.querySelector("#input-tarea-precio").value) || 0;

    if (!nuevoNombre) {
      mostrarToast("El nombre no puede estar vacio", "warning");
      inputNombre.focus();
      return;
    }

    const td = obtenerTareasData();
    if (td && idx < td.length) {
      td[idx].nombre = nuevoNombre;
      td[idx].precioUnitario = nuevoPrecio;
      refrescarTareasTabla(td);
    }

    cerrar();
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", guardar);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });

  const form = overlay.querySelector("#form-editar-tarea");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    guardar();
  });

  const handler = (e) => {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", handler);
    }
  };
  document.addEventListener("keydown", handler);
}

// ============================================================
// MODAL AGREGAR TAREA - Insertar tarea debajo de la seleccionada
// ============================================================

function abrirModalAgregarTarea(idx) {
  const tareasActuales = obtenerTareasData();
  if (!tareasActuales) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-agregar-tarea-titulo");

  overlay.innerHTML = `
    <div class="modal modal--sm modal-edit">
      <div class="modal__header">
        <h3 id="modal-agregar-tarea-titulo" class="modal__title">Agregar Tarea</h3>
      </div>
      <div class="modal__body">
        <form id="form-agregar-tarea-modal" autocomplete="off">
          <div class="form-group">
            <label for="input-agregar-tarea-nombre" class="form-label">Nombre de la tarea</label>
            <input
              type="text"
              id="input-agregar-tarea-nombre"
              class="form-input"
              placeholder="Ej: Costura, Corte"
              maxlength="60"
              required
              autocomplete="off"
            />
            <p id="error-agregar-tarea-nombre" class="form-error" hidden></p>
          </div>
          <div class="form-group">
            <label for="input-agregar-tarea-precio" class="form-label">Precio (ctv)</label>
            <input
              type="number"
              id="input-agregar-tarea-precio"
              class="form-input"
              placeholder="0"
              min="0"
              max="9999"
              step="1"
              autocomplete="off"
            />
            <p id="error-agregar-tarea-precio" class="form-error" hidden></p>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary modal-cancelar">Cancelar</button>
        <button class="btn btn--primary modal-guardar">Agregar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const inputNombre = overlay.querySelector("#input-agregar-tarea-nombre");
  const inputPrecio = overlay.querySelector("#input-agregar-tarea-precio");
  const errorNombre = overlay.querySelector("#error-agregar-tarea-nombre");
  const errorPrecio = overlay.querySelector("#error-agregar-tarea-precio");

  requestAnimationFrame(() => {
    inputNombre.focus();
  });

  inputNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputPrecio.focus();
    }
  });

  inputPrecio.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      overlay.querySelector(".modal-guardar").click();
    }
  });

  const cerrar = () => {
    overlay.classList.add("closing");
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  const agregar = () => {
    const nombre = inputNombre.value.trim();
    const precio = parseInt(inputPrecio.value) || 0;

    errorNombre.hidden = true;
    errorPrecio.hidden = true;
    inputNombre.classList.remove("form-input--error");
    inputPrecio.classList.remove("form-input--error");

    if (!nombre) {
      errorNombre.textContent = "El nombre no puede estar vacio";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    if (precio < 0) {
      errorPrecio.textContent = "El precio no puede ser negativo";
      errorPrecio.hidden = false;
      inputPrecio.classList.add("form-input--error");
      inputPrecio.focus();
      return;
    }

    const nombreDuplicado = tareasActuales.some(
      (t) => t.nombre.trim().toLowerCase() === nombre.toLowerCase()
    );
    if (nombreDuplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre en esta prenda";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    const td = obtenerTareasData();
    if (!td) {
      cerrar();
      return;
    }

    // Insertar en la posición idx+1 (debajo de la fila seleccionada).
    td.splice(idx + 1, 0, { nombre, precioUnitario: precio });
    refrescarTareasTabla(td);
    seleccionarFilaTarea(idx + 1);
    mostrarToast("Tarea agregada", "success");
    cerrar();
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", agregar);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });

  const form = overlay.querySelector("#form-agregar-tarea-modal");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    agregar();
  });

  const handler = (e) => {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", handler);
    }
  };
  document.addEventListener("keydown", handler);
}

// ============================================================
// ELIMINAR TAREA - Splice del array local
// ============================================================

function eliminarTarea(idx) {
  const tareasData = obtenerTareasData();
  if (!tareasData || idx >= tareasData.length) return;

  tareasData.splice(idx, 1);
  refrescarTareasTabla(tareasData);
  deseleccionarFilaTarea();
  mostrarToast("Tarea eliminada", "success");
}

// ============================================================
// UTILIDADES DE TAREAS
// `obtenerTareasData` reconstruye el array de tareas desde el
// DOM en lugar de mantener estado JS duplicado.
// ============================================================

function obtenerTareasData() {
  const filas = document.querySelectorAll(".tarea-tabla-row");
  if (filas.length === 0) return null;

  const tareasData = [];
  filas.forEach((fila) => {
    const nombre = fila.querySelector(".tarea-tabla-nombre")?.textContent || "";
    const precio = parseInt(fila.querySelector(".tarea-tabla-precio")?.textContent) || 0;
    tareasData.push({ nombre, precioUnitario: precio });
  });

  return tareasData;
}

// ============================================================
// PERSISTIR EN DB - Guardar prenda (crear o actualizar)
// Valida nombre único, guarda en IndexedDB y navega de vuelta.
// ============================================================

async function guardarPrenda(idOriginal) {
  const inputNombre = document.getElementById("input-nombre-prenda");
  const errorEl = document.getElementById("error-nombre-prenda");
  const nombre = inputNombre.value.trim();

  errorEl.hidden = true;

  if (!nombre) {
    errorEl.textContent = "El nombre no puede estar vacio";
    errorEl.hidden = false;
    inputNombre.focus();
    return;
  }

  const tareasActuales = obtenerTareasData() || [];
  const tareasValidas = tareasActuales.filter((t) => t.nombre && t.nombre.trim());

  try {
    // Verificar nombre único (excluye el ID actual en edición).
    const existe = await db.prendas.where("nombre").equals(nombre).first();
    if (existe && existe.id !== idOriginal) {
      errorEl.textContent = "Ya existe una prenda con ese nombre";
      errorEl.hidden = false;
      inputNombre.focus();
      return;
    }

    const obj = { nombre, tareas: tareasValidas };

    if (idOriginal === null || idOriginal === undefined) {
      await db.prendas.add(obj);
      mostrarToast("Prenda creada", "success");
    } else {
      await db.prendas.update(idOriginal, obj);
      mostrarToast("Prenda actualizada", "success");
    }

    location.hash = "#gestion-prendas";
  } catch (err) {
    console.error("Error al guardar prenda:", err);
    mostrarToast("Error al guardar", "error");
  }
}
import { db } from "../db.js";
import { escaparHTML, formatBs, formatCtv, formatCostoTotal, COMPONENTE_DEFAULT } from "../utils.js";
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

/** Selección de tarea: { componenteIdx, tareaIdx } o null */
let filaTareaSeleccionada = null;

/** AbortController para cancelar event listeners del documento al cambiar de vista */
let clickAbortControllerP = null;

/** Estado local de componentes y filtro activo para el formulario de prenda */
let componentesData = [];
let componenteFiltroActivo = "__todas";

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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
        var numTareas = 0;
        var totalCosto = 0;
        if (p.componentes && p.componentes.length > 0) {
          p.componentes.forEach(function (c) {
            if (c.tareas) {
              numTareas += c.tareas.length;
              totalCosto += c.tareas.reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
            }
          });
        } else if (p.tareas && p.tareas.length > 0) {
          numTareas = p.tareas.length;
          totalCosto = p.tareas.reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
        }
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
            <button class="btn btn--ghost btn--sm btn-exportar-prenda" data-id="${p.id}" data-nombre="${nombreEscapado}" aria-label="Exportar ${nombreEscapado} a Excel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
  const fueExportar = e.target.closest(".btn-exportar-prenda");

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
  if (fueExportar) {
    confirmarExportarPrenda(parseInt(fueExportar.dataset.id), fueExportar.dataset.nombre);
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
    } else if (fueFAB.classList.contains("fab-export")) {
      confirmarExportarPrenda(prendaSeleccionada.id, prendaSeleccionada.nombre);
    }
    return;
  }

  if (fueTareaFab && filaTareaSeleccionada) {
    var sel = filaTareaSeleccionada;
    if (fueTareaFab.classList.contains("tarea-fab-edit")) {
      abrirModalEditarTarea(sel.componenteIdx, sel.tareaIdx);
    } else if (fueTareaFab.classList.contains("tarea-fab-add")) {
      abrirModalAgregarTarea(sel.componenteIdx, sel.tareaIdx);
    } else if (fueTareaFab.classList.contains("tarea-fab-delete")) {
      eliminarTarea(sel.componenteIdx, sel.tareaIdx);
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

  if (filaTareaSeleccionada !== null) {
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
      <button class="fab-btn fab-export" aria-label="Exportar prenda a Excel">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
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
// Hace deep clone de los componentes para evitar que la copia
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

      // Deep clone de componentes: cada componente y sus tareas se copian
      // para no compartir referencias del objeto original.
      var copiaComponentes = [];
      if (prenda.componentes && prenda.componentes.length > 0) {
        copiaComponentes = prenda.componentes.map(function (c) {
          return { nombre: c.nombre, tareas: (c.tareas || []).map(function (t) { return { ...t }; }) };
        });
      } else if (prenda.tareas && prenda.tareas.length > 0) {
        copiaComponentes = [{ nombre: COMPONENTE_DEFAULT, tareas: prenda.tareas.map(function (t) { return { ...t }; }) }];
      }
      const copia = {
        nombre: nuevoNombre,
        componentes: copiaComponentes
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
    },
    undefined,
    "Eliminar"
  );
}

// ============================================================
// CONFIRMAR EXPORTAR PRENDA - Modal de confirmacion
// ============================================================

function confirmarExportarPrenda(id, nombre) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-exportar-prenda-titulo");

  overlay.innerHTML = `
    <div class="modal modal--sm">
      <div class="modal__header">
        <h3 id="modal-exportar-prenda-titulo" class="modal__title">Exportar Prenda</h3>
      </div>
      <div class="modal__body">
        <p>Se exportara la prenda <strong>"${escaparHTML(nombre)}"</strong> con sus componentes y tareas como archivo .xlsx.</p>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary modal-cancelar">Cancelar</button>
        <button class="btn btn--primary modal-confirmar">Exportar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const cerrar = () => {
    overlay.classList.add("closing");
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-confirmar").addEventListener("click", () => {
    cerrar();
    exportarPrendaExcel(id);
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });

  const escHandler = (e) => {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ============================================================
// EXPORTAR PRENDA A EXCEL - Genera .xlsx con formato:
//   Fila 1: nombre de la prenda | (vacio) | (vacio)
//   Fila 2: Componente | Nombre tareas | Precio Unitario
//   Fila 3+: componente | tarea | precio (centavos)
// ============================================================

async function exportarPrendaExcel(id) {
  try {
    const prenda = await db.prendas.get(id);
    if (!prenda) {
      mostrarToast("Prenda no encontrada", "error");
      return;
    }

    const rows = [];
    rows.push([prenda.nombre, null, null]);
    rows.push(["Componente", "Nombre tareas", "Precio Unitario"]);

    if (prenda.componentes && prenda.componentes.length > 0) {
      prenda.componentes.forEach(function (c) {
        (c.tareas || []).forEach(function (t) {
          rows.push([c.nombre, t.nombre, t.precioUnitario || 0]);
        });
      });
    } else if (prenda.tareas && prenda.tareas.length > 0) {
      prenda.tareas.forEach(function (t) {
        rows.push([COMPONENTE_DEFAULT, t.nombre, t.precioUnitario || 0]);
      });
    }

    if (rows.length <= 2) {
      mostrarToast("La prenda no tiene tareas para exportar", "warning");
      return;
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, prenda.nombre.substring(0, 31));

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = prenda.nombre.replace(/[^a-zA-Z0-9_-]/g, "_") + ".xlsx";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    mostrarToast("Prenda exportada a Excel", "success");
  } catch (err) {
    console.error("Error exportando prenda:", err);
    mostrarToast("Error al exportar", "error");
  }
}

// ============================================================
// IMPORTADOR EXCEL - Importa prendas desde archivo .xlsx/.csv
// Una prenda por hoja/pestana. Nuevo formato de 3 columnas:
//   Fila 1: nombre de la prenda | (vacio) | (vacio)
//   Fila 2: Componente | Nombre tareas | Precio Unitario (cabecera)
//   Fila 3+: componente | nombre tarea | precio centavos (opcional)
// Muestra modal con campo editable para nombre de la prenda.
// ============================================================

function abrirImportadorExcel() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".xlsx,.xls,.csv";
  input.hidden = true;
  document.body.appendChild(input);

  input.addEventListener("change", async function (e) {
    document.body.removeChild(input);
    const file = e.target.files[0];
    if (!file) return;

    try {
      const workbook = await leerWorkbook(file);
      const prendasData = [];

      workbook.SheetNames.forEach(function (sheetName) {
        const sheet = workbook.Sheets[sheetName];
        const prendaData = parseSheetToPrenda3Cols(sheetName, sheet);
        if (prendaData) {
          prendasData.push(prendaData);
        }
      });

      if (prendasData.length === 0) {
        mostrarToast("No se encontraron prendas validas en el archivo", "warning");
        return;
      }

      abrirModalImportarPrendas(prendasData);
    } catch (err) {
      console.error("Error importando:", err);
      mostrarToast("Error al importar archivo", "error");
    }
  });

  input.click();
}

function leerWorkbook(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const workbook = XLSX.read(e.target.result, { type: "array" });
        resolve(workbook);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Parsea una hoja como una sola prenda usando el nuevo formato de 3 columnas:
//   Fila 1: nombre de la prenda (col A)
//   Fila 2: Componente | Nombre tareas | Precio Unitario (cabecera, se saltea)
//   Fila 3+: col A = componente, col B = nombre tarea, col C = precio centavos (opcional)
// Retorna { nombre, componentes: [] } o null si no hay tareas.
function parseSheetToPrenda3Cols(sheetName, sheet) {
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const rows = [];
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;
    const tieneContenido = row.some(function (cell) {
      return cell !== null && cell !== undefined && String(cell).trim() !== "";
    });
    if (!tieneContenido) continue;
    rows.push(row);
  }

  if (rows.length === 0) return null;

  // Fila 1: nombre de la prenda (col A)
  var prendaName = String(rows[0][0] || "").trim();
  if (!prendaName) {
    prendaName = sheetName;
  }

  // Determinar dónde empiezan los datos
  var dataStartIdx = 2;
  if (rows.length > 1) {
    var row2colB = rows[1] ? String(rows[1][1] || "").trim() : "";
    // Si no hay texto en col B de fila 2, no hay cabecera
    if (!row2colB) {
      dataStartIdx = 1;
      prendaName = sheetName;
    }
  }

  // Agrupar tareas por componente
  var componentesMap = {};
  for (let i = dataStartIdx; i < rows.length; i++) {
    var comp = String(rows[i][0] || "").trim();
    var tareaNombre = String(rows[i][1] || "").trim();
    var tareaPrecio = Math.round(parseFloat(rows[i][2]) || 0);

    if (!tareaNombre) continue;

    var compNombre = comp || COMPONENTE_DEFAULT;
    if (!componentesMap[compNombre]) {
      componentesMap[compNombre] = [];
    }
    componentesMap[compNombre].push({ nombre: tareaNombre, precioUnitario: tareaPrecio });
  }

  var componentes = Object.keys(componentesMap).map(function (nombre) {
    return { nombre: nombre, tareas: componentesMap[nombre] };
  });

  if (componentes.length === 0) return null;

  return {
    nombre: prendaName,
    componentes: componentes
  };
}

// ============================================================
// MODAL IMPORTAR PRENDAS - Muestra modal con las prendas
// parseadas del Excel, cada una con nombre editable y resumen.
// ============================================================

function abrirModalImportarPrendas(prendasData) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-importar-titulo");

  var prendasHTML = prendasData.map(function (pd, idx) {
    var numTareas = 0;
    var totalCosto = 0;
    pd.componentes.forEach(function (c) {
      numTareas += c.tareas.length;
      totalCosto += c.tareas.reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
    });

    return '<div class="import-prenda-item" data-idx="' + idx + '">' +
      '<div class="form-group">' +
      '<label class="form-label" for="import-nombre-' + idx + '">Nombre de la prenda</label>' +
      '<input type="text" id="import-nombre-' + idx + '" class="form-input input-import-nombre" value="' + escaparHTML(pd.nombre) + '" maxlength="60" autocomplete="off" />' +
      '</div>' +
      '<p class="form-hint" style="margin-top:-8px;">' +
      numTareas + ' tarea(s) en ' + pd.componentes.length + ' componente(s) &middot; Costo total: ' + formatCostoTotal(totalCosto) +
      '</p>' +
      '<hr class="import-divider" />' +
      '</div>';
  }).join("");

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 id="modal-importar-titulo" class="modal__title">Importar Prendas</h3>
        <p class="modal__subtitle">Revisa los nombres antes de importar</p>
      </div>
      <div class="modal__body">
        ${prendasHTML}
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary modal-cancelar">Cancelar</button>
        <button class="btn btn--primary modal-confirmar">Importar (${prendasData.length})</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const cerrar = () => {
    overlay.classList.add("closing");
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-confirmar").addEventListener("click", async function () {
    var nombresUsados = {};
    var items = overlay.querySelectorAll(".import-prenda-item");
    var finalPrendas = [];
    var error = false;

    items.forEach(function (item) {
      if (error) return;
      var idx = parseInt(item.dataset.idx);
      var input = item.querySelector(".input-import-nombre");
      var nombre = input.value.trim();

      if (!nombre) {
        mostrarToast("El nombre de la prenda no puede estar vacio", "warning");
        input.focus();
        error = true;
        return;
      }

      var nombreLower = nombre.toLowerCase();
      if (nombresUsados[nombreLower]) {
        mostrarToast("Hay nombres duplicados en la importacion", "warning");
        input.focus();
        error = true;
        return;
      }
      nombresUsados[nombreLower] = true;

      finalPrendas.push({
        nombre: nombre,
        componentes: prendasData[idx].componentes
      });
    });

    if (error) return;

    try {
      // Verificar contra nombres existentes en la BD
      var nombresFinal = finalPrendas.map(function (p) { return p.nombre; });
      var existentes = await db.prendas.where("nombre").anyOf(nombresFinal).toArray();
      if (existentes.length > 0) {
        var conflictos = existentes.map(function (p) { return '"' + p.nombre + '"'; }).join(", ");
        mostrarToast("Ya existen prendas con nombre: " + conflictos, "warning");
        return;
      }
      await db.prendas.bulkAdd(finalPrendas);
      cerrar();
      await cargarPrendas();
      mostrarToast(finalPrendas.length + " prenda(s) importada(s)", "success");
    } catch (err) {
      console.error("Error importando:", err);
      mostrarToast("Error al importar", "error");
    }
  });

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
  });

  var escHandler = function (e) {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ============================================================
// FORMULARIO CREAR / EDITAR PRENDA
// Vista compartida para crear (id=null) y editar (id=number).
// Detecta cambios al intentar volver y pregunta si descartar.
// Los componentes se muestran como cards colapsables,
// cada una con su tabla de tareas y formulario inline para agregar.
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
  componentesData = [];
  componenteFiltroActivo = "__todas";

  if (!esNueva) {
    try {
      prendaActual = await db.prendas.get(id);
      if (!prendaActual) {
        container.innerHTML = estadoVacioHTML("Prenda no encontrada");
        return;
      }
      // Cargar componentes con deep clone de tareas.
      if (prendaActual.componentes && prendaActual.componentes.length > 0) {
        componentesData = prendaActual.componentes.map(function (c) {
          return { nombre: c.nombre, tareas: (c.tareas || []).map(function (t) { return { ...t }; }) };
        });
      } else if (prendaActual.tareas && prendaActual.tareas.length > 0) {
        // Fallback para datos legacy con tareas planas.
        componentesData = [{ nombre: COMPONENTE_DEFAULT, tareas: prendaActual.tareas.map(function (t) { return { ...t }; }) }];
      }
    } catch (err) {
      container.innerHTML = estadoVacioHTML("Error al cargar la prenda");
      return;
    }
  }

  // Guardamos estado original para detectar cambios al volver.
  const nombreOriginal = esNueva ? "" : prendaActual.nombre;
  const componentesOriginalesJSON = JSON.stringify(esNueva ? [] : (prendaActual.componentes || []));

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
        <div class="componentes-section-header">
          <span class="section-title">Componentes</span>
          <span class="componentes-hint">Opcional. Agrupa las tareas por componente (Ej: Delanteros, Traseros).</span>
        </div>
        <div class="componentes-input-row">
          <input type="text" id="input-componente" class="form-input" placeholder="Ej: Delanteros" maxlength="30" autocomplete="off" />
          <button type="button" class="btn btn--outline btn--sm" id="btn-agregar-componente">Agregar</button>
        </div>
        <p id="error-componente" class="form-error" hidden></p>
        <div class="filter-chips" id="componente-filter-chips" style="display:none;">
          ${renderComponenteFilterChips(componentesData, '__todas')}
        </div>
      </div>

      <div class="form-group">
        <div class="tareas-section-header">
          <span class="section-title">Tareas por Componente</span>
        </div>
        <div id="componentes-cards-container">
          ${renderComponentesCards(componentesData)}
        </div>
      </div>

      <div class="form-group" id="resumen-costo-container" style="${calcularCostoTotal(componentesData) === 0 ? "display:none;" : ""}">
        <div class="resumen-costo" id="resumen-costo-total">
          <span class="resumen-costo__label">Costo total:</span>
          <span class="resumen-costo__valor" id="span-costo-total">${formatCostoTotal(calcularCostoTotal(componentesData))}</span>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn--secondary" id="btn-cancelar-prenda">Cancelar</button>
        <button type="submit" class="btn btn--success" id="btn-guardar-prenda">
          ${esNueva ? "Crear Prenda" : "Guardar Cambios"}
        </button>
      </div>
    </form>
  `;

  // ============================================================
  // COMPONENTES - Inicializar chips de filtro
  // ============================================================

  if (componentesData.length > 0) {
    mostrarFiltroComponentes();
  }

  var btnAgregarComponente = document.getElementById("btn-agregar-componente");
  if (btnAgregarComponente) {
    btnAgregarComponente.addEventListener("click", function () {
      var input = document.getElementById("input-componente");
      var errorEl = document.getElementById("error-componente");
      var nombre = input.value.trim();
      errorEl.hidden = true;
      input.classList.remove("form-input--error");

      if (!nombre) {
        errorEl.textContent = "El nombre del componente no puede estar vacio";
        errorEl.hidden = false;
        input.classList.add("form-input--error");
        input.focus();
        return;
      }
      var duplicado = componentesData.some(function (c) { return c.nombre.toLowerCase() === nombre.toLowerCase(); });
      if (duplicado) {
        errorEl.textContent = "Ya existe un componente con ese nombre";
        errorEl.hidden = false;
        input.classList.add("form-input--error");
        input.focus();
        return;
      }

      componentesData.push({ nombre: nombre, tareas: [] });
      input.value = "";
      input.focus();
      mostrarFiltroComponentes();
      refrescarCardsTareas();
    });

    document.getElementById("input-componente").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-agregar-componente").click();
      }
    });
  }

  // Delegacion de clicks en chips de filtro de componente
  var filterChips = document.getElementById("componente-filter-chips");
  if (filterChips) {
    filterChips.addEventListener("click", function (e) {
      // Click en chip (filtrar)
      var chip = e.target.closest(".filter-chip");
      if (!chip) return;
      var comp = chip.dataset.componente;
      componenteFiltroActivo = comp;
      actualizarChipsFiltroActivo();
      aplicarFiltroCards();
    });
  }

  // ============================================================
  // DELEGACIÓN DE EVENTOS EN CARDS
  // Colapso, eliminar componente, agregar tarea inline,
  // selección de tarea y botones de fila de tarea.
  // ============================================================

  container.addEventListener("click", function (e) {
    // Card header click → collapse toggle (no disparar si fue un botón)
    var cardHeader = e.target.closest(".componente-card__header");
    if (cardHeader && !e.target.closest("button")) {
      var card = cardHeader.closest(".componente-card");
      if (card) card.classList.toggle("componente-card--collapsed");
      return;
    }

    // Botón eliminar componente dentro de card
    var btnDelComponente = e.target.closest(".btn-eliminar-componente-card");
    if (btnDelComponente) {
      var idx = parseInt(btnDelComponente.dataset.idx, 10);
      eliminarComponenteCard(idx);
      return;
    }

    // Botón agregar tarea inline dentro de card
    var btnAddTarea = e.target.closest(".btn-agregar-tarea-card");
    if (btnAddTarea) {
      var cIdx = parseInt(btnAddTarea.dataset.componenteIdx, 10);
      agregarTareaCardInline(cIdx);
      return;
    }

    // Click en fila de tarea → seleccionar (no disparar si fue un botón)
    var row = e.target.closest(".tarea-tabla-row");
    if (row && !e.target.closest("button")) {
      var cIdx = parseInt(row.dataset.componenteIdx);
      var tIdx = parseInt(row.dataset.tareaIdx);
      seleccionarFilaTarea(cIdx, tIdx);
      return;
    }

    // Botones de acción en fila de tarea
    if (e.target.closest(".btn-eliminar-tarea-row")) {
      var row = e.target.closest(".tarea-tabla-row");
      var cIdx = parseInt(row.dataset.componenteIdx);
      var tIdx = parseInt(row.dataset.tareaIdx);
      eliminarTarea(cIdx, tIdx);
      return;
    }

    if (e.target.closest(".btn-editar-tarea-row")) {
      var row = e.target.closest(".tarea-tabla-row");
      var cIdx = parseInt(row.dataset.componenteIdx);
      var tIdx = parseInt(row.dataset.tareaIdx);
      abrirModalEditarTarea(cIdx, tIdx);
      return;
    }

    if (e.target.closest(".btn-agregar-debajo-row")) {
      var row = e.target.closest(".tarea-tabla-row");
      var cIdx = parseInt(row.dataset.componenteIdx);
      var tIdx = parseInt(row.dataset.tareaIdx);
      abrirModalAgregarTarea(cIdx, tIdx);
      return;
    }
  });

  // Keydown delegation para inputs de tarea dentro de las cards
  container.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;

    var nombreInput = e.target.closest(".input-tarea-nombre-card");
    if (nombreInput) {
      e.preventDefault();
      var cIdx = parseInt(nombreInput.dataset.componenteIdx, 10);
      var card = nombreInput.closest(".componente-card");
      if (card) {
        var precioInput = card.querySelector(".input-tarea-precio-card");
        if (precioInput) precioInput.focus();
      }
      return;
    }

    var precioInput = e.target.closest(".input-tarea-precio-card");
    if (precioInput) {
      e.preventDefault();
      var cIdx = parseInt(precioInput.dataset.componenteIdx, 10);
      agregarTareaCardInline(cIdx);
      return;
    }
  });

  document.getElementById("form-prenda").addEventListener("submit", async (e) => {
    e.preventDefault();
    await guardarPrenda(id);
  });

  document.getElementById("btn-cancelar-prenda").addEventListener("click", () => {
    const nombreActual = document.getElementById("input-nombre-prenda")?.value.trim() || "";
    const componentesActualesJSON = JSON.stringify(componentesData);
    const huboCambios = nombreActual !== nombreOriginal || componentesActualesJSON !== componentesOriginalesJSON;

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
  // VERIFICACIÓN DE CAMBIOS AL VOLVER
  // Compara nombre y componentes con JSON.stringify para detectar
  // cambios no guardados. Si hubo cambios, pregunta confirmación.
  // ============================================================

  const btnVolver = header.querySelector("[data-nav-back]");
  if (btnVolver) {
    btnVolver.addEventListener("click", (e) => {
      e.preventDefault();

      const nombreActual = document.getElementById("input-nombre-prenda")?.value.trim() || "";
      const componentesActualesJSON = JSON.stringify(componentesData);

      const huboCambios = nombreActual !== nombreOriginal || componentesActualesJSON !== componentesOriginalesJSON;

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
// COMPONENTE CARDS - Render de cards colapsables
// Cada card muestra: header (chevrón, título, cantidad de tareas,
// subtotal, botón eliminar) y body (tabla de tareas + formulario
// inline para agregar tarea a ese componente).
// ============================================================

function renderComponentesCards(componentes) {
  if (!componentes || componentes.length === 0) {
    return estadoVacioHTML("Sin componentes", "Agrega componentes y luego tareas desde cada card");
  }

  var html = "";
  componentes.forEach(function (c, cIdx) {
    var taskList = c.tareas || [];
    var numTareas = taskList.length;
    var subtotal = taskList.reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);

    html += '<div class="componente-card" data-componente-idx="' + cIdx + '" data-componente-nombre="' + escaparHTML(c.nombre) + '">';
    // Header
    html += '<div class="componente-card__header">';
    html += '<svg class="componente-card__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    html += '<span class="componente-card__title">' + escaparHTML(c.nombre) + '</span>';
    html += '<span class="componente-card__count">' + numTareas + ' tarea' + (numTareas !== 1 ? 's' : '') + '</span>';
    html += '<span class="componente-card__subtotal">' + formatCostoTotal(subtotal) + '</span>';
    html += '<button type="button" class="btn btn--ghost btn--sm btn-eliminar-componente-card" data-idx="' + cIdx + '" aria-label="Eliminar componente ' + escaparHTML(c.nombre) + '">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    html += '</button>';
    html += '</div>';

    // Body
    html += '<div class="componente-card__body">';
    if (numTareas > 0) {
      html += '<div class="tareas-tabla">';
      html += '<div class="tareas-tabla-header">';
      html += '<span class="tareas-tabla-header__nombre">Tarea</span>';
      html += '<span class="tareas-tabla-header__precio">Precio (ctv)</span>';
      html += '<span class="tareas-tabla-header__acciones"></span>';
      html += '</div>';
      taskList.forEach(function (t, tIdx) {
        html += crearFilaTareaHTML(t, cIdx, tIdx);
      });
      html += '</div>';
    } else {
      html += '<p class="form-hint" style="padding:var(--space-3) var(--space-3);text-align:center;margin:0;border-bottom:1px solid var(--color-divider);">Sin tareas en este componente</p>';
    }

    // Fila inline para agregar tarea
    html += '<div class="componente-card__add-row">';
    html += '<input type="text" class="form-input input-tarea-nombre-card" data-componente-idx="' + cIdx + '" placeholder="Nombre de la tarea" maxlength="60" autocomplete="off" />';
    html += '<div class="input-precio-ctv-wrapper">';
    html += '<input type="number" class="form-input input-tarea-precio-card" data-componente-idx="' + cIdx + '" placeholder="0" min="0" max="9999" step="1" autocomplete="off" />';
    html += '<span class="input-precio-ctv-sufijo">ctv</span>';
    html += '</div>';
    html += '<button type="button" class="btn btn--outline btn--sm btn-agregar-tarea-card" data-componente-idx="' + cIdx + '" aria-label="Agregar tarea a ' + escaparHTML(c.nombre) + '">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    html += '</button>';
    html += '</div>';

    html += '</div>'; // body
    html += '</div>'; // card
  });

  return html;
}

// ============================================================
// CREAR FILA DE TAREA - HTML de una fila en la tabla de tareas
// ============================================================

function crearFilaTareaHTML(tarea, componenteIdx, tareaIdx) {
  const nombre = escaparHTML(tarea.nombre || "");
  const precio = tarea.precioUnitario || 0;
  const nombreMostrar = nombre || "<em>Sin nombre</em>";
  return `
    <div class="tarea-tabla-row" data-componente-idx="${componenteIdx}" data-tarea-idx="${tareaIdx}" tabindex="0">
      <span class="tarea-tabla-nombre">${nombreMostrar}</span>
      <span class="tarea-tabla-precio">${formatCtv(precio)}</span>
      <div class="tarea-tabla-acciones">
        <button type="button" class="btn btn--ghost btn--sm btn-editar-tarea-row" data-componente-idx="${componenteIdx}" data-tarea-idx="${tareaIdx}" aria-label="Editar tarea">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button type="button" class="btn btn--ghost btn--sm btn-agregar-debajo-row" data-componente-idx="${componenteIdx}" data-tarea-idx="${tareaIdx}" aria-label="Agregar tarea debajo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button type="button" class="btn btn--ghost btn--sm btn-eliminar-tarea-row" data-componente-idx="${componenteIdx}" data-tarea-idx="${tareaIdx}" aria-label="Eliminar tarea">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ============================================================
// REFRESCAR CARDS - Re-renderiza las cards de componentes
// preservando la selección actual de fila de tarea.
// ============================================================

function refrescarCardsTareas() {
  var container = document.getElementById("componentes-cards-container");
  if (!container) return;

  var rowSeleccionada = document.querySelector(".tarea-tabla-row.selected");
  var cIdxSel = rowSeleccionada ? parseInt(rowSeleccionada.dataset.componenteIdx) : -1;
  var tIdxSel = rowSeleccionada ? parseInt(rowSeleccionada.dataset.tareaIdx) : -1;

  container.innerHTML = renderComponentesCards(componentesData);
  actualizarCostoTotal();

  // Re-aplicar clase selected después del render.
  if (cIdxSel >= 0 && tIdxSel >= 0 && cIdxSel < componentesData.length) {
    var comp = componentesData[cIdxSel];
    if (comp && tIdxSel < (comp.tareas || []).length) {
      var nuevaRow = container.querySelector('.tarea-tabla-row[data-componente-idx="' + cIdxSel + '"][data-tarea-idx="' + tIdxSel + '"]');
      if (nuevaRow) {
        nuevaRow.classList.add("selected");
      }
    }
  }

  // Re-aplicar filtro de componente y actualizar chips
  aplicarFiltroCards();
  mostrarFiltroComponentes();
}

// ============================================================
// ACTUALIZAR COSTO TOTAL - Recalcula y muestra el costo
// ============================================================

function actualizarCostoTotal() {
  const container = document.getElementById("resumen-costo-container");
  const span = document.getElementById("span-costo-total");
  if (!container || !span) return;

  const total = calcularCostoTotal(componentesData);
  container.style.display = total > 0 ? "block" : "none";
  span.textContent = formatCostoTotal(total);
}

function calcularCostoTotal(componentes) {
  var total = 0;
  (componentes || []).forEach(function (c) {
    total += (c.tareas || []).reduce(function (sum, t) { return sum + (t.precioUnitario || 0); }, 0);
  });
  return total;
}

// ============================================================
// AGREGAR TAREA INLINE EN CARD - Valida y agrega tarea
// al componente indicado usando los inputs de la card.
// ============================================================

function agregarTareaCardInline(cIdx) {
  var comp = componentesData[cIdx];
  if (!comp) return;

  var card = document.querySelector('.componente-card[data-componente-idx="' + cIdx + '"]');
  if (!card) return;

  var inputNombre = card.querySelector(".input-tarea-nombre-card");
  var inputPrecio = card.querySelector(".input-tarea-precio-card");
  if (!inputNombre || !inputPrecio) return;

  var nombre = inputNombre.value.trim();
  var precio = parseInt(inputPrecio.value) || 0;

  if (!nombre) {
    mostrarToast("El nombre de la tarea no puede estar vacio", "warning");
    inputNombre.focus();
    return;
  }

  if (precio < 0) {
    mostrarToast("El precio no puede ser negativo", "warning");
    inputPrecio.focus();
    return;
  }

  // Verificar unicidad de nombre de tarea en todos los componentes.
  var nombreDuplicado = false;
  componentesData.forEach(function (c) {
    if ((c.tareas || []).some(function (t) { return t.nombre.trim().toLowerCase() === nombre.toLowerCase(); })) {
      nombreDuplicado = true;
    }
  });
  if (nombreDuplicado) {
    mostrarToast("Ya existe una tarea con ese nombre en esta prenda", "warning");
    inputNombre.focus();
    return;
  }

  comp.tareas.push({ nombre: nombre, precioUnitario: precio });
  inputNombre.value = "";
  inputPrecio.value = "";
  refrescarCardsTareas();

  // Devolver foco al input de nombre de esta card tras re-render
  var nuevaCard = document.querySelector('.componente-card[data-componente-idx="' + cIdx + '"]');
  if (nuevaCard) {
    var nuevoInput = nuevaCard.querySelector(".input-tarea-nombre-card");
    if (nuevoInput) nuevoInput.focus();
  }
}

// ============================================================
// ELIMINAR COMPONENTE CARD - Si tiene tareas pide confirmación
// ============================================================

function eliminarComponenteCard(idx) {
  var comp = componentesData[idx];
  if (!comp) return;

  var numTareas = (comp.tareas || []).length;
  var nombreComponente = comp.nombre;

  var doEliminar = function () {
    // Si el filtro activo es este componente, resetear
    if (componenteFiltroActivo === nombreComponente) {
      componenteFiltroActivo = "__todas";
    }
    componentesData.splice(idx, 1);
    deseleccionarFilaTarea();
    refrescarCardsTareas();
  };

  if (numTareas > 0) {
    mostrarModalConfirmar(
      "Eliminar Componente",
      'El componente "' + nombreComponente + '" tiene ' + numTareas + ' tarea(s). ¿Estas seguro de eliminarlo?',
      "warning",
      doEliminar,
      "Cancelar",
      "Eliminar",
      "btn--secondary",
      "btn--danger"
    );
  } else {
    doEliminar();
  }
}

// ============================================================
function renderComponenteFilterChips(componentes, activa) {
  var comps = componentes || [];
  var html = '<button type="button" class="filter-chip filter-chip--sm' + (activa === '__todas' ? ' active' : '') + '" data-componente="__todas">Todos</button>';
  comps.forEach(function (c) {
    html += '<button type="button" class="filter-chip filter-chip--sm' + (c.nombre === activa ? ' active' : '') + '" data-componente="' + escaparHTML(c.nombre) + '">' +
      escaparHTML(c.nombre) +
      '</button>';
  });
  return html;
}

function mostrarFiltroComponentes() {
  var group = document.getElementById("componente-filter-chips");
  if (!group) return;
  if (componentesData.length === 0) {
    group.style.display = "none";
    return;
  }
  group.style.display = "";
  group.innerHTML = renderComponenteFilterChips(componentesData, componenteFiltroActivo || "__todas");
}

function actualizarChipsFiltroActivo() {
  var container = document.getElementById("componente-filter-chips");
  if (!container) return;
  container.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
  var activo = container.querySelector('.filter-chip[data-componente="' + escaparHTML(componenteFiltroActivo || '__todas') + '"]');
  if (activo) activo.classList.add("active");
}

function aplicarFiltroCards() {
  var filtro = componenteFiltroActivo;
  var cards = document.querySelectorAll(".componente-card");
  cards.forEach(function (card) {
    var nombre = card.dataset.componenteNombre;
    if (filtro === "__todas" || nombre === filtro) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  });
}

// ============================================================
// FABs DE TAREA - Seleccionar fila y mostrar acciones flotantes
// Similar a los FABs de prenda pero específicos para tareas.
// La selección almacena { componenteIdx, tareaIdx }.
// ============================================================

function seleccionarFilaTarea(componenteIdx, tareaIdx) {
  deseleccionarFilaTarea();

  filaTareaSeleccionada = { componenteIdx: componenteIdx, tareaIdx: tareaIdx };
  const row = document.querySelector('.tarea-tabla-row[data-componente-idx="' + componenteIdx + '"][data-tarea-idx="' + tareaIdx + '"]');
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

function abrirModalEditarTarea(componenteIdx, tareaIdx) {
  var comp = componentesData[componenteIdx];
  if (!comp || tareaIdx >= comp.tareas.length) return;

  const tarea = comp.tareas[tareaIdx];
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-tarea-titulo");

  overlay.innerHTML = `
    <div class="modal modal--sm modal-edit">
      <div class="modal__header">
        <h3 id="modal-tarea-titulo" class="modal__title">Editar Tarea</h3>
        <p class="modal__subtitle">Componente: ${escaparHTML(comp.nombre)}</p>
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
    const nuevoPrecio = parseInt(inputPrecio.value) || 0;

    if (!nuevoNombre) {
      mostrarToast("El nombre no puede estar vacio", "warning");
      inputNombre.focus();
      return;
    }

    if (nuevoPrecio < 0) {
      mostrarToast("El precio no puede ser negativo", "warning");
      inputPrecio.focus();
      return;
    }

    comp.tareas[tareaIdx].nombre = nuevoNombre;
    comp.tareas[tareaIdx].precioUnitario = nuevoPrecio;
    refrescarCardsTareas();
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
// dentro del mismo componente.
// ============================================================

function abrirModalAgregarTarea(componenteIdx, tareaIdx) {
  var comp = componentesData[componenteIdx];
  if (!comp) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-agregar-tarea-titulo");

  overlay.innerHTML = `
    <div class="modal modal--sm modal-edit">
      <div class="modal__header">
        <h3 id="modal-agregar-tarea-titulo" class="modal__title">Agregar Tarea</h3>
        <p class="modal__subtitle">Componente: ${escaparHTML(comp.nombre)}</p>
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

    var nombreDuplicado = false;
    componentesData.forEach(function (c) {
      if ((c.tareas || []).some(function (t) { return t.nombre.trim().toLowerCase() === nombre.toLowerCase(); })) {
        nombreDuplicado = true;
      }
    });
    if (nombreDuplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre en esta prenda";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    // Insertar en la posición tareaIdx+1 dentro del mismo componente.
    comp.tareas.splice(tareaIdx + 1, 0, { nombre: nombre, precioUnitario: precio });
    refrescarCardsTareas();
    seleccionarFilaTarea(componenteIdx, tareaIdx + 1);
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
// ELIMINAR TAREA - Splice del array dentro del componente
// ============================================================

function eliminarTarea(componenteIdx, tareaIdx) {
  var comp = componentesData[componenteIdx];
  if (!comp || tareaIdx >= comp.tareas.length) return;

  comp.tareas.splice(tareaIdx, 1);
  refrescarCardsTareas();
  deseleccionarFilaTarea();
  mostrarToast("Tarea eliminada", "success");
}

// ============================================================
// PERSISTIR EN DB - Guardar prenda (crear o actualizar)
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

  try {
    // Verificar nombre único (excluye el ID actual en edición).
    const existe = await db.prendas.where("nombre").equals(nombre).first();
    if (existe && existe.id !== idOriginal) {
      errorEl.textContent = "Ya existe una prenda con ese nombre";
      errorEl.hidden = false;
      inputNombre.focus();
      return;
    }

    const obj = {
      nombre: nombre,
      componentes: componentesData
    };

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

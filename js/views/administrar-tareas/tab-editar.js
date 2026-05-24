// ============================================================
// TAB EDITAR - CRUD de tareas del corte
// Permite editar, eliminar y agregar tareas. Incluye filtros
// (Todos / Asignadas / No asignadas), FABs flotantes al
// seleccionar fila, y boton "Actualizar Prenda" que sincroniza
// las tareas no asignadas de vuelta al template de la prenda.
// Solo se pueden eliminar tareas sin asignaciones.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatCtv, formatCostoTotal } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "../shared.js";

// ============================================================
// CONSTANTES DEL MODULO
// ============================================================

/** ID del contenedor de FABs para este tab */
const EDIT_FAB_CONTAINER_ID = "at-editar-fab-container";

/** Indice de la fila de tarea seleccionada */
let filaSeleccionadaIdx = null;

/** Timeout para ocultar FABs con animacion */
let ocultarFABsTimeout = null;

/** Filtro activo: "todas" | "asignadas" | "no-asignadas" */
let filtroActual = "todas";

/** Referencia a onDataChange para FABs y modales que no lo reciben directamente */
let onDataChangeRef = null;

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabEditar(corte, container, opciones) {
  const { prenda, onDataChange } = opciones;
  onDataChangeRef = onDataChange;

  // Limpiar FABs del estado anterior
  document.getElementById(EDIT_FAB_CONTAINER_ID)?.remove();
  filaSeleccionadaIdx = null;
  filtroActual = "todas";

  // Calcular costo por prenda total
  const costoUnitarioCtv = (corte.tareas || []).reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
  const tienePrenda = !!(prenda && corte.prendaId);

  container.innerHTML =
    '<section class="at-editar">' +

    // Filtros + costo por prenda
    '<div class="at-editar__filtros">' +
    '<div class="filter-chips" id="filter-chips-editar">' +
    '<button class="filter-chip active" data-filtro="todas">Todas</button>' +
    '<button class="filter-chip" data-filtro="asignadas">Completas</button>' +
    '<button class="filter-chip" data-filtro="parcialmente">Parcial</button>' +
    '<button class="filter-chip" data-filtro="no-asignadas">Sin asignar</button>' +
    '</div>' +
    '<span class="at-editar__costo-prenda">Costo por prenda: <strong>' + formatCostoTotal(costoUnitarioCtv) + '</strong></span>' +
    '</div>' +

    // Tabla de tareas
    '<div id="at-editar-tabla-container">' +
    renderTablaTareas(corte.tareas, filtroActual) +
    '</div>' +

    // Formulario para agregar nueva tarea al final
    '<div class="at-editar__nueva-tarea">' +
    '<input type="text" id="input-editar-nombre-tarea" class="form-input" placeholder="Nombre de la tarea" maxlength="60" autocomplete="off" />' +
    '<input type="number" id="input-editar-precio-tarea" class="form-input" placeholder="ctv" min="0" max="9999" step="1" autocomplete="off" />' +
    '<button class="btn btn--outline btn--sm" id="btn-editar-agregar-tarea" aria-label="Agregar tarea">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    '</button>' +
    '</div>' +
    '<p id="error-editar-nombre-tarea" class="form-error" hidden></p>' +
    '<p id="error-editar-precio-tarea" class="form-error" hidden></p>' +

    // Boton Actualizar Prenda (solo si el corte tiene prenda asociada)
    (tienePrenda
      ? '<div class="at-editar__acciones">' +
        '<button class="btn btn--secondary btn--sm" id="btn-actualizar-prenda">Actualizar Prenda</button>' +
        '</div>'
      : "") +

    '</section>';

  // Event listeners para filtros
  const filterChips = document.getElementById("filter-chips-editar");
  filterChips.addEventListener("click", function (e) {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    filtroActual = chip.dataset.filtro;
    filterChips.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");
    deseleccionarFila();
    refrescarTabla(corte);
  });

  // Event listener para agregar tarea
  document.getElementById("btn-editar-agregar-tarea").addEventListener("click", function () {
    agregarTareaInline(corte, onDataChange);
  });

  // Enter en inputs: navega al siguiente y luego agrega
  document.getElementById("input-editar-nombre-tarea").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("input-editar-precio-tarea").focus();
    }
  });
  document.getElementById("input-editar-precio-tarea").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      agregarTareaInline(corte, onDataChange);
    }
  });

  // Boton Actualizar Prenda
  if (tienePrenda) {
    document.getElementById("btn-actualizar-prenda").addEventListener("click", function () {
      confirmarActualizarPrenda(corte, prenda, onDataChange);
    });
  }

  // Delegacion de clicks en la tabla
  const tablaContainer = document.getElementById("at-editar-tabla-container");
  tablaContainer.addEventListener("click", function (e) {
    const row = e.target.closest(".tarea-tabla-row");
    if (row && !e.target.closest("button")) {
      seleccionarFila(corte, parseInt(row.dataset.idx));
      return;
    }
    if (e.target.closest(".btn-editar-tarea-row")) {
      const r = e.target.closest(".tarea-tabla-row");
      abrirModalEditarTarea(corte, parseInt(r.dataset.idx), onDataChange);
      return;
    }
    if (e.target.closest(".btn-agregar-debajo-tarea-row")) {
      const r = e.target.closest(".tarea-tabla-row");
      abrirModalAgregarTarea(corte, parseInt(r.dataset.idx));
      return;
    }
    if (e.target.closest(".btn-eliminar-tarea-row")) {
      const r = e.target.closest(".tarea-tabla-row");
      confirmarEliminarTarea(corte, parseInt(r.dataset.idx), onDataChange);
      return;
    }
  });

  // Cerrar FABs al hacer click fuera
  document.addEventListener("click", function handler(e) {
    if (!e.target.closest(".tarea-tabla-row") && !e.target.closest(".tarea-fab-btn")) {
      deseleccionarFila();
    }
  });
}

// ============================================================
// RENDER TABLA DE TAREAS con filtro aplicado
// Reutiliza las clases .tareas-tabla y .tarea-tabla-row del CSS
// de nuevo-corte.css para mantener consistencia visual.
// ============================================================

function renderTablaTareas(tareas, filtro) {
  if (!tareas || tareas.length === 0) {
    return estadoVacioHTML("Sin tareas", "Agrega tareas usando el formulario inferior");
  }

  // Aplicar filtro local
  let tareasFiltradas = tareas;
  if (filtro === "asignadas") {
    tareasFiltradas = tareas.filter(function (t) {
      const totalAsignado = (t.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
      return totalAsignado > 0 && totalAsignado >= t.unidadesTotales;
    });
  } else if (filtro === "parcialmente") {
    tareasFiltradas = tareas.filter(function (t) {
      const totalAsignado = (t.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
      return totalAsignado > 0 && totalAsignado < t.unidadesTotales;
    });
  } else if (filtro === "no-asignadas") {
    tareasFiltradas = tareas.filter(function (t) {
      const totalAsignado = (t.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
      return totalAsignado === 0;
    });
  }

  if (tareasFiltradas.length === 0) {
    const msjFiltro = filtro === "asignadas" ? "Sin tareas completas" : filtro === "parcialmente" ? "Sin tareas parciales" : filtro === "no-asignadas" ? "Sin tareas sin asignar" : "Sin tareas";
    const subFiltro = "Prueba con otro filtro";
    return estadoVacioHTML(msjFiltro, subFiltro);
  }

  // Mapear los indices filtrados a los indices reales del array original
  const mapaIndices = tareasFiltradas.map(function (tf) {
    return tareas.indexOf(tf);
  });

  return '<div class="tareas-tabla">' +
    '<div class="tareas-tabla-header">' +
    '<span class="tareas-tabla-header__nombre">Tarea</span>' +
    '<span class="tareas-tabla-header__precio">Precio (ctv)</span>' +
    '<span class="tareas-tabla-header__acciones"></span>' +
    '</div>' +
    tareasFiltradas.map(function (t, i) {
      const idxReal = mapaIndices[i];
      const nombre = escaparHTML(t.nombre || "");
      const precio = t.precioUnitario || 0;
      const totalAsignado = (t.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
      const unidadesTotales = t.unidadesTotales || 0;
      const porcentaje = unidadesTotales > 0 ? Math.min(100, (totalAsignado / unidadesTotales) * 100) : 0;
      const estadoBarra = totalAsignado >= unidadesTotales ? "completa" : totalAsignado > 0 ? "parcial" : "vacia";
      const tieneAsignaciones = totalAsignado > 0;

      return '<div class="tarea-tabla-row" data-idx="' + idxReal + '" tabindex="0">' +
        '<div class="tarea-tabla-nombre">' +
        '<span class="tarea-nombre">' + (nombre || "<em>Sin nombre</em>") + '</span>' +
        '<div class="tarea-barra-container">' +
        '<div class="tarea-barra tarea-barra--' + estadoBarra + '" style="width:' + porcentaje + '%;"></div>' +
        '</div>' +
        '<span class="tarea-barra-texto">' + totalAsignado + ' / ' + unidadesTotales + ' unidades</span>' +
        '</div>' +
        '<span class="tarea-tabla-precio">' + formatCtv(precio) + '</span>' +
        '<div class="tarea-tabla-acciones">' +
        '<button class="btn btn--ghost btn--sm btn-editar-tarea-row" data-idx="' + idxReal + '" aria-label="Editar tarea">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="btn btn--ghost btn--sm btn-agregar-debajo-tarea-row" data-idx="' + idxReal + '" aria-label="Agregar tarea debajo">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>' +
        (tieneAsignaciones
          ? '<button class="btn btn--ghost btn--sm" disabled style="opacity:0.3;" title="No se puede eliminar: tiene asignaciones">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>'
          : '<button class="btn btn--ghost btn--sm btn-eliminar-tarea-row" data-idx="' + idxReal + '" aria-label="Eliminar tarea">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>') +
        '</div>' +
        '</div>';
    }).join("") +
    '</div>';
}

// ============================================================
// REFRESCAR TABLA tras una mutacion
// ============================================================

function refrescarTabla(corte) {
  const container = document.getElementById("at-editar-tabla-container");
  if (!container) return;

  const rowSeleccionada = container.querySelector(".tarea-tabla-row.selected");
  const idxSeleccionado = rowSeleccionada ? parseInt(rowSeleccionada.dataset.idx) : -1;

  container.innerHTML = renderTablaTareas(corte.tareas, filtroActual);

  // Re-seleccionar fila si aun existe
  if (idxSeleccionado >= 0 && idxSeleccionado < (corte.tareas || []).length) {
    const nuevaRow = container.querySelector('.tarea-tabla-row[data-idx="' + idxSeleccionado + '"]');
    if (nuevaRow) {
      nuevaRow.classList.add("selected");
      filaSeleccionadaIdx = idxSeleccionado;
      mostrarFABs(corte, idxSeleccionado);
    } else {
      deseleccionarFila();
    }
  }

  // Actualizar costo por prenda
  const costoLabel = document.querySelector(".at-editar__costo-prenda strong");
  if (costoLabel && corte.tareas) {
    const costo = corte.tareas.reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
    costoLabel.textContent = formatCostoTotal(costo);
  }
}

// ============================================================
// AGREGAR TAREA INLINE - Desde el formulario inferior
// ============================================================

async function agregarTareaInline(corte, onDataChange) {
  const inputNombre = document.getElementById("input-editar-nombre-tarea");
  const inputPrecio = document.getElementById("input-editar-precio-tarea");
  const errorNombre = document.getElementById("error-editar-nombre-tarea");
  const errorPrecio = document.getElementById("error-editar-precio-tarea");

  if (!inputNombre || !inputPrecio) return;

  const nombre = inputNombre.value.trim();
  const precio = parseInt(inputPrecio.value) || 0;

  // Limpiar errores previos
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

  // Verificar nombre duplicado
  const duplicado = (corte.tareas || []).some(function (t) {
    return (t.nombre || "").trim().toLowerCase() === nombre.toLowerCase();
  });
  if (duplicado) {
    errorNombre.textContent = "Ya existe una tarea con ese nombre";
    errorNombre.hidden = false;
    inputNombre.classList.add("form-input--error");
    inputNombre.focus();
    return;
  }

  // Agregar tarea al array del corte
  const cantidadPrendas = corte.tallas.reduce(function (s, t) { return s + t.cantidad; }, 0);
  const tareasActualizadas = (corte.tareas || []).concat([{
    id: ((corte.tareas || []).length > 0 ? Math.max.apply(null, corte.tareas.map(function (t) { return t.id || 0; })) : 0) + 1,
    nombre: nombre,
    precioUnitario: precio,
    unidadesTotales: cantidadPrendas,
    asignaciones: []
  }]);

  try {
    await db.cortes.update(corte.id, { tareas: tareasActualizadas });
    inputNombre.value = "";
    inputPrecio.value = "";
    mostrarToast("Tarea agregada", "success");
    if (onDataChange) await onDataChange();
  } catch (err) {
    console.error("Error al agregar tarea:", err);
    mostrarToast("Error al agregar tarea", "error");
  }
}

// ============================================================
// FABs - Mostrar / ocultar acciones flotantes al seleccionar fila
// ============================================================

function seleccionarFila(corte, idx) {
  deseleccionarFila();
  filaSeleccionadaIdx = idx;

  const row = document.querySelector('.tarea-tabla-row[data-idx="' + idx + '"]');
  if (row) row.classList.add("selected");

  mostrarFABs(corte, idx);
}

function deseleccionarFila() {
  const row = document.querySelector(".tarea-tabla-row.selected");
  if (row) row.classList.remove("selected");
  filaSeleccionadaIdx = null;
  ocultarFABs();
}

function mostrarFABs(corte, idx) {
  if (ocultarFABsTimeout) {
    clearTimeout(ocultarFABsTimeout);
    ocultarFABsTimeout = null;
  }

  const tarea = (corte.tareas || [])[idx];
  if (!tarea) return;

  const tieneAsignaciones = tarea.asignaciones && tarea.asignaciones.length > 0;

  let fabContainer = document.getElementById(EDIT_FAB_CONTAINER_ID);
  if (fabContainer) fabContainer.remove();

  fabContainer = document.createElement("div");
  fabContainer.id = EDIT_FAB_CONTAINER_ID;
  fabContainer.className = "tareas-fab-container";

  fabContainer.innerHTML =
    '<button class="tarea-fab-btn tarea-fab-edit" aria-label="Editar tarea">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
    '</button>' +
    '<button class="tarea-fab-btn tarea-fab-add" aria-label="Agregar tarea debajo">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    '</button>' +
    (tieneAsignaciones ? "" :
      '<button class="tarea-fab-btn tarea-fab-delete" aria-label="Eliminar tarea">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>');

  document.body.appendChild(fabContainer);

  // Event listeners de FABs
  fabContainer.querySelector(".tarea-fab-edit").addEventListener("click", function () {
    if (filaSeleccionadaIdx !== null) {
      db.cortes.get(corte.id).then(function (corteActualizado) {
        if (corteActualizado) {
          abrirModalEditarTarea(corteActualizado, filaSeleccionadaIdx, function () {});
        }
      });
    }
  });

  fabContainer.querySelector(".tarea-fab-add").addEventListener("click", function () {
    if (filaSeleccionadaIdx !== null) {
      abrirModalAgregarTarea(corte, filaSeleccionadaIdx);
    }
  });

  const fabDelete = fabContainer.querySelector(".tarea-fab-delete");
  if (fabDelete) {
    fabDelete.addEventListener("click", function () {
      if (filaSeleccionadaIdx !== null) {
        confirmarEliminarTarea(corte, filaSeleccionadaIdx);
      }
    });
  }

  fabContainer.classList.remove("visible");
  requestAnimationFrame(function () {
    fabContainer.classList.add("visible");
  });
}

function ocultarFABs() {
  const fabContainer = document.getElementById(EDIT_FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarFABsTimeout = setTimeout(function () {
    const contenedor = document.getElementById(EDIT_FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarFABsTimeout = null;
  }, 300);
}

// ============================================================
// MODAL EDITAR TAREA
// ============================================================

function abrirModalEditarTarea(corte, idx, onDataChange) {
  const tareas = corte.tareas || [];
  if (idx >= tareas.length) return;
  const tarea = tareas[idx];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-editar-tarea-titulo");

  overlay.innerHTML =
    '<div class="modal modal--sm">' +
    '<div class="modal__header">' +
    '<h3 id="modal-editar-tarea-titulo" class="modal__title">Editar Tarea</h3>' +
    '</div>' +
    '<div class="modal__body">' +
    '<form id="form-editar-tarea-modal" autocomplete="off">' +
    '<div class="form-group">' +
    '<label for="input-editar-tarea-nombre" class="form-label">Nombre de la tarea</label>' +
    '<input type="text" id="input-editar-tarea-nombre" class="form-input" value="' + escaparHTML(tarea.nombre || "") + '" maxlength="60" required autocomplete="off" />' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="input-editar-tarea-precio" class="form-label">Precio (ctv)</label>' +
    '<input type="number" id="input-editar-tarea-precio" class="form-input" value="' + (tarea.precioUnitario || 0) + '" min="0" max="9999" step="1" autocomplete="off" />' +
    '</div>' +
    '</form>' +
    '</div>' +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--primary modal-guardar">Guardar</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const inputNombre = overlay.querySelector("#input-editar-tarea-nombre");
  const inputPrecio = overlay.querySelector("#input-editar-tarea-precio");

  requestAnimationFrame(function () { inputNombre.focus(); });

  inputNombre.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); inputPrecio.focus(); }
  });
  inputPrecio.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); overlay.querySelector(".modal-guardar").click(); }
  });

  const cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  const guardar = async function () {
    const nuevoNombre = inputNombre.value.trim();
    const nuevoPrecio = parseInt(inputPrecio.value) || 0;

    if (!nuevoNombre) {
      mostrarToast("El nombre no puede estar vacio", "warning");
      inputNombre.focus();
      return;
    }

    const tareasActualizadas = (corte.tareas || []).map(function (t, i) {
      if (i === idx) {
        return Object.assign({}, t, { nombre: nuevoNombre, precioUnitario: nuevoPrecio });
      }
      return t;
    });

    try {
      await db.cortes.update(corte.id, { tareas: tareasActualizadas });
      cerrar();
      mostrarToast("Tarea actualizada", "success");
      if (onDataChange) await onDataChange();
    } catch (err) {
      console.error("Error al editar tarea:", err);
      mostrarToast("Error al editar", "error");
    }
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", guardar);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
  });

  const form = overlay.querySelector("#form-editar-tarea-modal");
  form.addEventListener("submit", function (e) { e.preventDefault(); guardar(); });

  const escHandler = function (e) {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ============================================================
// MODAL AGREGAR TAREA (debajo de la seleccionada)
// ============================================================

function abrirModalAgregarTarea(corte, idx) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-agregar-tarea-titulo");

  overlay.innerHTML =
    '<div class="modal modal--sm">' +
    '<div class="modal__header">' +
    '<h3 id="modal-agregar-tarea-titulo" class="modal__title">Agregar Tarea</h3>' +
    '</div>' +
    '<div class="modal__body">' +
    '<form id="form-agregar-tarea-modal" autocomplete="off">' +
    '<div class="form-group">' +
    '<label for="input-agregar-tarea-nombre" class="form-label">Nombre de la tarea</label>' +
    '<input type="text" id="input-agregar-tarea-nombre" class="form-input" placeholder="Ej: Costura, Bordado" maxlength="60" required autocomplete="off" />' +
    '<p id="error-agregar-tarea-nombre" class="form-error" hidden></p>' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="input-agregar-tarea-precio" class="form-label">Precio (ctv)</label>' +
    '<input type="number" id="input-agregar-tarea-precio" class="form-input" placeholder="0" min="0" max="9999" step="1" autocomplete="off" />' +
    '<p id="error-agregar-tarea-precio" class="form-error" hidden></p>' +
    '</div>' +
    '</form>' +
    '</div>' +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--primary modal-guardar">Agregar</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const inputNombre = overlay.querySelector("#input-agregar-tarea-nombre");
  const inputPrecio = overlay.querySelector("#input-agregar-tarea-precio");
  const errorNombre = overlay.querySelector("#error-agregar-tarea-nombre");
  const errorPrecio = overlay.querySelector("#error-agregar-tarea-precio");

  requestAnimationFrame(function () { inputNombre.focus(); });

  inputNombre.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); inputPrecio.focus(); }
  });
  inputPrecio.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); overlay.querySelector(".modal-guardar").click(); }
  });

  const cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  const agregar = async function () {
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

    const duplicado = (corte.tareas || []).some(function (t) {
      return (t.nombre || "").trim().toLowerCase() === nombre.toLowerCase();
    });
    if (duplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    const cantidadPrendas = corte.tallas.reduce(function (s, t) { return s + t.cantidad; }, 0);
    const nuevoId = ((corte.tareas || []).length > 0 ? Math.max.apply(null, corte.tareas.map(function (t) { return t.id || 0; })) : 0) + 1;
    const nuevasTareas = (corte.tareas || []).slice();
    nuevasTareas.splice(idx + 1, 0, {
      id: nuevoId,
      nombre: nombre,
      precioUnitario: precio,
      unidadesTotales: cantidadPrendas,
      asignaciones: []
    });

    try {
      await db.cortes.update(corte.id, { tareas: nuevasTareas });
      cerrar();
      mostrarToast("Tarea agregada", "success");
      if (onDataChangeRef) await onDataChangeRef();
    } catch (err) {
      console.error("Error al agregar tarea:", err);
      mostrarToast("Error al agregar", "error");
    }
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", agregar);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
  });

  const form = overlay.querySelector("#form-agregar-tarea-modal");
  form.addEventListener("submit", function (e) { e.preventDefault(); agregar(); });

  const escHandler = function (e) {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ============================================================
// ELIMINAR TAREA - Con confirmacion, solo si no tiene asignaciones
// ============================================================

function confirmarEliminarTarea(corte, idx) {
  const tarea = (corte.tareas || [])[idx];
  if (!tarea) return;

  if (tarea.asignaciones && tarea.asignaciones.length > 0) {
    mostrarToast("No se puede eliminar: la tarea tiene asignaciones", "warning");
    return;
  }

  mostrarModalConfirmar(
    "Eliminar Tarea",
    "Estas seguro de eliminar la tarea \"" + (tarea.nombre || "Sin nombre") + "\"? Esta accion no se puede deshacer.",
    "danger",
    async function () {
      try {
        const tareasActualizadas = (corte.tareas || []).filter(function (_, i) { return i !== idx; });
        await db.cortes.update(corte.id, { tareas: tareasActualizadas });
        deseleccionarFila();
        mostrarToast("Tarea eliminada", "success");
        if (onDataChangeRef) await onDataChangeRef();
      } catch (err) {
        console.error("Error al eliminar tarea:", err);
        mostrarToast("Error al eliminar", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

// ============================================================
// ACTUALIZAR PRENDA - Sincroniza tareas no asignadas al template
// Filtra tareas sin asignaciones y las guarda como las tareas
// de la prenda base, manteniendo un historial util.
// ============================================================

function confirmarActualizarPrenda(corte, prenda, onDataChange) {
  const tareasNoAsignadas = (corte.tareas || []).filter(function (t) {
    return !t.asignaciones || t.asignaciones.length === 0;
  }).map(function (t) {
    return { nombre: t.nombre, precioUnitario: t.precioUnitario };
  });

  // Combinar con tareas que tenian asignaciones (mantener ambas en la prenda)
  const tareasAsignadas = (corte.tareas || []).filter(function (t) {
    return t.asignaciones && t.asignaciones.length > 0;
  }).map(function (t) {
    return { nombre: t.nombre, precioUnitario: t.precioUnitario };
  });

  // Mantener las tareas asignadas mas las no asignadas (sin duplicados por nombre)
  const tareasFinales = [];
  const nombresAgregados = {};
  tareasAsignadas.concat(tareasNoAsignadas).forEach(function (t) {
    const clave = t.nombre.trim().toLowerCase();
    if (!nombresAgregados[clave]) {
      nombresAgregados[clave] = true;
      tareasFinales.push({ nombre: t.nombre.trim(), precioUnitario: t.precioUnitario });
    }
  });

  mostrarModalConfirmar(
    "Actualizar Prenda",
    "Se actualizara la prenda \"" + (prenda.nombre || "") + "\" con " + tareasFinales.length + " tareas del corte. Las tareas existentes en la prenda seran reemplazadas.",
    "info",
    async function () {
      try {
        await db.prendas.update(corte.prendaId, { tareas: tareasFinales });
        mostrarToast("Prenda actualizada con " + tareasFinales.length + " tareas", "success");
        if (onDataChange) await onDataChange();
      } catch (err) {
        console.error("Error al actualizar prenda:", err);
        mostrarToast("Error al actualizar la prenda", "error");
      }
    }
  );
}

// ============================================================
// TAB EDITAR - CRUD de tareas del corte
// Permite editar, eliminar y agregar tareas. Incluye filtros
// (Todos / Asignadas / No asignadas), FABs flotantes al
// seleccionar fila, y boton "Actualizar Prenda" que sincroniza
// las tareas no asignadas de vuelta al template de la prenda.
// Solo se pueden eliminar tareas sin asignaciones.
// Trabaja con corte.componentes en lugar de corte.tareas.
// Presenta componentes en cards colapsables.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatCtv, formatCostoTotal, COMPONENTE_DEFAULT } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "../shared.js";
import { getTallasDisponiblesParaTarea, abrirModalAsignarTarea, confirmarEliminarAsignaciones } from "./asignacion-compartida.js";

// ============================================================
// CONSTANTES DEL MODULO
// ============================================================

/** ID del contenedor de FABs para este tab */
const EDIT_FAB_CONTAINER_ID = "at-editar-fab-container";

/** Indice de la fila de tarea seleccionada: {componenteIdx, tareaIdx} */
let filaSeleccionadaIdx = null;

/** Timeout para ocultar FABs con animacion */
let ocultarFABsTimeout = null;

/** Filtro activo: "todas" | "asignadas" | "parcialmente" | "no-asignadas" */
let filtroActual = "todas";

/** Lista de nombres de componentes del corte */
let componentesData = [];

/** Filtro de componente activo ("__todas" o nombre de componente) */
let componenteFiltroActivo = "__todas";

/** ID del ultimo corte renderizado para saber si cambio */
let ultimoCorteIdEditar = null;

/** Referencia a onDataChange para FABs y modales que no lo reciben directamente */
let onDataChangeRef = null;

/** Mapa trabajadorId -> nombre para lookups O(1) */
let trabajadoresMapRef = null;

// ============================================================
// HELPERS DE DATOS
// ============================================================

/** Obtiene array plano de todas las tareas con su metadata de componente */
function getTodasLasTareasConMeta(corte) {
  var result = [];
  (corte.componentes || []).forEach(function (comp, compIdx) {
    (comp.tareas || []).forEach(function (t, tareaIdx) {
      result.push({ tarea: t, componenteIdx: compIdx, tareaIdx: tareaIdx, componenteNombre: comp.nombre });
    });
  });
  return result;
}

/** Obtiene una tarea especifica por indices de componente/tarea */
function getTarea(corte, compIdx, tareaIdx) {
  var comp = (corte.componentes || [])[compIdx];
  return comp ? (comp.tareas || [])[tareaIdx] : null;
}

/** Calcula el costo total de todas las tareas de todos los componentes */
function calcularCostoTotal(corte) {
  var total = 0;
  (corte.componentes || []).forEach(function (comp) {
    (comp.tareas || []).forEach(function (t) {
      total += t.precioUnitario || 0;
    });
  });
  return total;
}

/** Obtiene el siguiente ID de tarea global */
function getNuevoId(corte) {
  var maxId = 0;
  (corte.componentes || []).forEach(function (comp) {
    (comp.tareas || []).forEach(function (t) {
      if (t.id > maxId) maxId = t.id;
    });
  });
  return maxId + 1;
}

/** Crea un clon profundo de los componentes para mutaciones */
function clonarComponentes(corte) {
  return (corte.componentes || []).map(function (comp) {
    return {
      nombre: comp.nombre,
      tareas: (comp.tareas || []).map(function (t) {
        return {
          id: t.id,
          nombre: t.nombre,
          precioUnitario: t.precioUnitario,
          unidadesTotales: t.unidadesTotales,
          asignaciones: (t.asignaciones || []).map(function (a) {
            return { trabajadorId: a.trabajadorId, cantidad: a.cantidad, talla: a.talla, fecha: a.fecha };
          })
        };
      })
    };
  });
}

// ============================================================
// HELPERS DE FILTRO POR COMPONENTE
// ============================================================

/** Renderiza los chips de filtro de componente */
function mostrarFiltroComponentesEditar() {
  var container = document.getElementById("editar-componente-filter-chips");
  if (!container) return;
  var comps = componentesData.length > 0 ? componentesData : [COMPONENTE_DEFAULT];
  var html = '<button class="filter-chip' + (componenteFiltroActivo === "__todas" ? " active" : "") + '" data-componente="__todas">Todas</button>';
  comps.forEach(function (c) {
    html += '<button class="filter-chip' + (componenteFiltroActivo === c ? " active" : "") + '" data-componente="' + escaparHTML(c) + '">' + escaparHTML(c) + '</button>';
  });
  container.innerHTML = html;
}

/** Filtra las tareas con meta por componente activo */
function aplicarFiltroComponenteEditar(tareasConMeta) {
  if (componenteFiltroActivo === "__todas") return tareasConMeta;
  return tareasConMeta.filter(function (item) {
    return item.componenteNombre === componenteFiltroActivo;
  });
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabEditar(corte, container, opciones) {
  const { prenda, onDataChange, trabajadoresMap } = opciones;
  onDataChangeRef = onDataChange;
  trabajadoresMapRef = trabajadoresMap || {};

  // Limpiar FABs del estado anterior
  document.getElementById(EDIT_FAB_CONTAINER_ID)?.remove();
  filaSeleccionadaIdx = null;
  filtroActual = "todas";
  componentesData = (corte.componentes || []).map(function (c) { return c.nombre; });
  if (corte.id !== ultimoCorteIdEditar) {
    componenteFiltroActivo = "__todas";
    ultimoCorteIdEditar = corte.id;
  }

  var costoUnitarioCtv = calcularCostoTotal(corte);
  var tienePrenda = !!(prenda && corte.prendaId);

  var comps = componentesData.length > 0 ? componentesData : [COMPONENTE_DEFAULT];
  var componenteChipsHTML = '<button class="filter-chip' + (componenteFiltroActivo === "__todas" ? " active" : "") + '" data-componente="__todas">Todas</button>';
  comps.forEach(function (c) {
    var activo = componenteFiltroActivo === c ? " active" : "";
    componenteChipsHTML += '<button class="filter-chip' + activo + '" data-componente="' + escaparHTML(c) + '">' + escaparHTML(c) + '</button>';
  });

  container.innerHTML =
    '<section class="at-editar">' +

    // Filtros por estado
    '<div class="at-editar__filtros">' +
    '<div class="filter-chips" id="filter-chips-editar">' +
    '<button class="filter-chip active" data-filtro="todas">Todas</button>' +
    '<button class="filter-chip" data-filtro="asignadas">Completas</button>' +
    '<button class="filter-chip" data-filtro="parcialmente">Parcial</button>' +
    '<button class="filter-chip" data-filtro="no-asignadas">Sin asignar</button>' +
    '</div>' +
    '</div>' +

    // Input para agregar componente nuevo + chips de filtro de componente
    '<div class="form-group">' +
    '<div class="componentes-section-header">' +
    '<span class="section-title">Componentes</span>' +
    '<span class="componentes-hint">Agrega componentes o edita las tareas existentes.</span>' +
    '</div>' +
    '<div class="componentes-input-row">' +
    '<input type="text" id="input-editar-componente" class="form-input" placeholder="Ej: Delanteros" maxlength="30" autocomplete="off" />' +
    '<button type="button" class="btn btn--outline btn--sm" id="btn-editar-agregar-componente">Agregar</button>' +
    '</div>' +
    '<p id="error-editar-componente" class="form-error" hidden></p>' +
    '<div class="filter-chips" id="editar-componente-filter-chips">' + componenteChipsHTML + '</div>' +
    '</div>' +

    // Cards de componentes con tareas
    '<div id="editar-cards-container">' +
    renderComponentesCardsEditar(corte, filtroActual) +
    '</div>' +

    // Costo por prenda al final
    '<div class="at-editar__costo-prenda">Costo por prenda: <strong id="at-editar-costo-total">' + formatCostoTotal(costoUnitarioCtv) + '</strong></div>' +

    // Boton Actualizar Prenda (solo si el corte tiene prenda asociada)
    (tienePrenda
      ? '<div class="at-editar__acciones">' +
        '<button class="btn btn--secondary btn--sm" id="btn-actualizar-prenda">Actualizar Prenda</button>' +
        '</div>'
      : "") +

    '</section>';

  // ============================================================
  // EVENT LISTENERS
  // ============================================================

  // Filtros por estado de asignacion
  var filterChips = document.getElementById("filter-chips-editar");
  filterChips.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    filtroActual = chip.dataset.filtro;
    filterChips.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");
    deseleccionarFila();
    refrescarCards(corte);
  });

  // Filtros por componente
  var componenteFilterChips = document.getElementById("editar-componente-filter-chips");
  componenteFilterChips.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    componenteFiltroActivo = chip.dataset.componente;
    componenteFilterChips.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");
    deseleccionarFila();
    refrescarCards(corte);
  });

  // Input de componente: agregar componente nuevo
  var btnAgregarComponente = document.getElementById("btn-editar-agregar-componente");
  if (btnAgregarComponente) {
    btnAgregarComponente.addEventListener("click", function () {
      agregarComponenteEditar(corte);
    });

    document.getElementById("input-editar-componente").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        document.getElementById("btn-editar-agregar-componente").click();
      }
    });
  }

  // Delegacion de clicks en las cards de componentes
  var cardsContainer = document.getElementById("editar-cards-container");
  if (cardsContainer) {
    cardsContainer.addEventListener("click", function (e) {
      // Toggle colapsar card
      var header = e.target.closest(".componente-card__header");
      if (header && !e.target.closest("button")) {
        var card = header.closest(".componente-card");
        if (card) card.classList.toggle("componente-card--collapsed");
        return;
      }

      // Boton agregar tarea inline en card
      var addBtn = e.target.closest(".componente-add-btn");
      if (addBtn) {
        var card = addBtn.closest(".componente-card");
        if (!card) return;
        var compIdx = parseInt(card.dataset.componenteIdx);
        var inputNombre = card.querySelector(".componente-add-nombre");
        var inputPrecio = card.querySelector(".componente-add-precio");
        agregarTareaCardInline(corte, compIdx, inputNombre, inputPrecio);
        return;
      }

      // Click en fila de tarea (toggle detalle + seleccion)
      var row = e.target.closest(".tarea-tabla-row");
      if (row && !e.target.closest("button")) {
        var compIdx = parseInt(row.dataset.componente);
        var tareaIdx = parseInt(row.dataset.tarea);
        if (row.classList.contains("expanded")) {
          deseleccionarFila();
        } else {
          // Colapsar otras filas expandidas
          var expandedRows = row.parentNode.querySelectorAll(".tarea-tabla-row.expanded");
          for (var i = 0; i < expandedRows.length; i++) {
            expandedRows[i].classList.remove("expanded");
          }
          seleccionarFila(corte, compIdx, tareaIdx);
        }
        return;
      }

      // Botones de accion en fila de tarea
      if (e.target.closest(".btn-editar-tarea-row")) {
        var r = e.target.closest(".tarea-tabla-row");
        abrirModalEditarTarea(corte, parseInt(r.dataset.componente), parseInt(r.dataset.tarea), onDataChange);
        return;
      }
      if (e.target.closest(".btn-agregar-debajo-tarea-row")) {
        var r2 = e.target.closest(".tarea-tabla-row");
        abrirModalAgregarTarea(corte, parseInt(r2.dataset.componente), parseInt(r2.dataset.tarea));
        return;
      }
      if (e.target.closest(".btn-eliminar-tarea-row")) {
        var r3 = e.target.closest(".tarea-tabla-row");
        confirmarEliminarTarea(corte, parseInt(r3.dataset.componente), parseInt(r3.dataset.tarea), onDataChange);
        return;
      }

      // Boton eliminar componente (solo visible en componentes vacios)
      if (e.target.closest(".btn-eliminar-componente-card")) {
        var btnComp = e.target.closest(".btn-eliminar-componente-card");
        var compIdxDel = parseInt(btnComp.dataset.componente);
        confirmarEliminarComponente(corte, compIdxDel);
        return;
      }
    });

    // Keydown delegation para inputs inline de agregar tarea
    cardsContainer.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.classList.contains("componente-add-nombre")) {
        e.preventDefault();
        var card = e.target.closest(".componente-card");
        if (card) {
          var precioInput = card.querySelector(".componente-add-precio");
          if (precioInput) precioInput.focus();
        }
      } else if (e.key === "Enter" && e.target.classList.contains("componente-add-precio")) {
        e.preventDefault();
        var card = e.target.closest(".componente-card");
        if (card) {
          var addBtn = card.querySelector(".componente-add-btn");
          if (addBtn) addBtn.click();
        }
      }
    });
  }

  // Boton Actualizar Prenda
  if (tienePrenda) {
    document.getElementById("btn-actualizar-prenda").addEventListener("click", function () {
      confirmarActualizarPrenda(corte, prenda, onDataChange);
    });
  }

  // Cerrar FABs al hacer click fuera
  document.addEventListener("click", function handler(e) {
    if (!e.target.closest(".tarea-tabla-row") && !e.target.closest(".tarea-fab-btn")) {
      deseleccionarFila();
    }
  });
}

// ============================================================
// RENDER CARDS DE COMPONENTES CON TAREAS
// Agrupa las tareas por componente en cards colapsables.
// Cada card contiene una tabla de tareas y una fila inline
// para agregar nuevas tareas a ese componente.
// ============================================================

function renderComponentesCardsEditar(corte, filtro) {
  var componentes = corte.componentes || [];

  if (componentes.length === 0) {
    return estadoVacioHTML("Sin componentes", "Agrega componentes usando el campo de arriba");
  }

  var html = '';

  for (var ci = 0; ci < componentes.length; ci++) {
    var comp = componentes[ci];
    var nombreComp = comp.nombre;

    // Aplicar filtro por componente activo
    if (componenteFiltroActivo !== "__todas" && nombreComp !== componenteFiltroActivo) {
      continue;
    }

    var tareasComp = (comp.tareas || []).map(function (t, tareaIdx) {
      return { tarea: t, tareaIdx: tareaIdx };
    });

    // Aplicar filtro por estado de asignacion
    var tareasFiltradas = tareasComp;
    if (filtro === "asignadas") {
      tareasFiltradas = tareasComp.filter(function (item) {
        var totalAsignado = (item.tarea.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
        return totalAsignado > 0 && totalAsignado >= item.tarea.unidadesTotales;
      });
    } else if (filtro === "parcialmente") {
      tareasFiltradas = tareasComp.filter(function (item) {
        var totalAsignado = (item.tarea.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
        return totalAsignado > 0 && totalAsignado < item.tarea.unidadesTotales;
      });
    } else if (filtro === "no-asignadas") {
      tareasFiltradas = tareasComp.filter(function (item) {
        var totalAsignado = (item.tarea.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
        return totalAsignado === 0;
      });
    }

    var numTareas = tareasFiltradas.length;
    var subtotal = tareasFiltradas.reduce(function (s, item) { return s + (item.tarea.precioUnitario || 0); }, 0);

    html += '<div class="componente-card" data-componente-idx="' + ci + '">';
    html += '<div class="componente-card__header" role="button" tabindex="0" aria-expanded="true">';
    html += '<svg class="componente-card__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    html += '<span class="componente-card__title">' + escaparHTML(nombreComp) + '</span>';
    html += '<span class="componente-card__count">' + numTareas + ' tarea' + (numTareas !== 1 ? 's' : '') + '</span>';
    html += '<span class="componente-card__subtotal">' + formatCostoTotal(subtotal) + '</span>';
    if ((comp.tareas || []).length === 0) {
      html += '<button type="button" class="btn btn--ghost btn--sm btn-eliminar-componente-card" data-componente="' + ci + '" aria-label="Eliminar componente">';
      html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      html += '</button>';
    }
    html += '</div>';

    html += '<div class="componente-card__body">';

    if (numTareas > 0) {
      html += '<div class="tareas-tabla">';
      html += '<div class="tareas-tabla-header">';
      html += '<span class="tareas-tabla-header__nombre">Tarea</span>';
      html += '<span class="tareas-tabla-header__precio">Precio (ctv)</span>';
      html += '<span class="tareas-tabla-header__acciones"></span>';
      html += '</div>';

      tareasFiltradas.forEach(function (item) {
        var t = item.tarea;
        var tareaIdx = item.tareaIdx;
        var nombre = escaparHTML(t.nombre || "");
        var precio = t.precioUnitario || 0;
        var totalAsignado = (t.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
        var unidadesTotales = t.unidadesTotales || 0;
        var porcentaje = unidadesTotales > 0 ? Math.min(100, (totalAsignado / unidadesTotales) * 100) : 0;
        var estadoBarra = totalAsignado >= unidadesTotales ? "completa" : totalAsignado > 0 ? "parcial" : "vacia";

        html += '<div class="tarea-tabla-row" data-componente="' + ci + '" data-tarea="' + tareaIdx + '" tabindex="0">';
        html += '<div class="tarea-tabla-nombre">';
        html += '<span class="tarea-nombre">' + (nombre || "<em>Sin nombre</em>") + '</span>';
        html += '<div class="tarea-barra-container">';
        html += '<div class="tarea-barra tarea-barra--' + estadoBarra + '" style="width:' + porcentaje + '%;"></div>';
        html += '</div>';
        html += '<span class="tarea-barra-texto">' + totalAsignado + ' / ' + unidadesTotales + ' unidades</span>';
        html += '</div>';
        html += '<span class="tarea-tabla-precio">' + formatCtv(precio) + '</span>';
        html += '<div class="tarea-tabla-acciones">';
        html += '<button type="button" class="btn btn--ghost btn--sm btn-editar-tarea-row" data-componente="' + ci + '" data-tarea="' + tareaIdx + '" aria-label="Editar tarea">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        html += '</button>';
        html += '<button type="button" class="btn btn--ghost btn--sm btn-agregar-debajo-tarea-row" data-componente="' + ci + '" data-tarea="' + tareaIdx + '" aria-label="Agregar tarea debajo">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        html += '</button>';
        html += '<button type="button" class="btn btn--ghost btn--sm btn-eliminar-tarea-row" data-componente="' + ci + '" data-tarea="' + tareaIdx + '" aria-label="Eliminar tarea">';
        html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        html += '</button>';
        html += '</div>';
        html += '</div>';

        // Detalle colapsable de trabajadores asignados
        html += '<div class="tarea-tabla-detail">';
        var asigs = t.asignaciones || [];
        if (asigs.length > 0) {
          // Agrupar por trabajador
          var grouped = {};
          asigs.forEach(function (a) {
            var tid = a.trabajadorId;
            if (!grouped[tid]) {
              grouped[tid] = { tallas: [], totalCtv: 0 };
            }
            grouped[tid].tallas.push(a.talla || "Única");
            grouped[tid].totalCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
          });
          html += '<ul class="tarea-detail-list">';
          Object.keys(grouped).forEach(function (tidStr) {
            var g = grouped[tidStr];
            var tid = parseInt(tidStr);
            var nombreTrab = (trabajadoresMapRef && trabajadoresMapRef[tid]) || ("#" + tid);
            var tallasStr = g.tallas.join(", ");
            var totalBs = (g.totalCtv / 100).toFixed(2);
            html += '<li class="tarea-detail-item">';
            html += '<span class="tarea-detail-worker">' + escaparHTML(nombreTrab) + ':</span>';
            html += '<span class="tarea-detail-tallas">' + escaparHTML(tallasStr) + '.</span>';
            html += '<span class="tarea-detail-total">Total: ' + totalBs + ' Bs</span>';
            html += "</li>";
          });
          html += "</ul>";
        } else {
          html += '<p class="form-hint" style="margin:0;">Sin trabajadores asignados</p>';
        }
        html += "</div>";
      });

      html += '</div>';
    } else {
      html += '<p class="form-hint" style="padding:var(--space-3) var(--space-3);text-align:center;margin:0;border-bottom:1px solid var(--color-divider);">';
      html += filtro !== "todas" ? "Sin tareas con este filtro" : "Sin tareas en este componente";
      html += '</p>';
    }

    // Fila inline para agregar tarea a este componente
    html += '<div class="componente-card__add-row">';
    html += '<input type="text" class="form-input componente-add-nombre" placeholder="Nueva tarea..." maxlength="60" autocomplete="off" />';
    html += '<div class="input-precio-ctv-wrapper">';
    html += '<input type="number" class="form-input componente-add-precio" placeholder="0" min="0" max="9999" step="1" autocomplete="off" />';
    html += '<span class="input-precio-ctv-sufijo">ctv</span>';
    html += '</div>';
    html += '<button type="button" class="btn btn--outline btn--sm componente-add-btn" aria-label="Agregar tarea">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    html += '</button>';
    html += '</div>';

    html += '</div>'; // body
    html += '</div>'; // card
  }

  if (!html) {
    return estadoVacioHTML("Sin resultados", "No hay componentes que coincidan con el filtro");
  }

  return html;
}

// ============================================================
// REFRESCAR CARDS tras una mutacion
// ============================================================

function refrescarCards(corte) {
  var container = document.getElementById("editar-cards-container");
  if (!container) return;

  var rowSeleccionada = container.querySelector(".tarea-tabla-row.selected");
  var compIdxSel = -1;
  var tareaIdxSel = -1;
  if (rowSeleccionada) {
    compIdxSel = parseInt(rowSeleccionada.dataset.componente);
    tareaIdxSel = parseInt(rowSeleccionada.dataset.tarea);
  }

  container.innerHTML = renderComponentesCardsEditar(corte, filtroActual);

  // Re-seleccionar fila si aun existe
  if (compIdxSel >= 0 && tareaIdxSel >= 0) {
    var t = getTarea(corte, compIdxSel, tareaIdxSel);
    if (t) {
      var nuevaRow = container.querySelector('.tarea-tabla-row[data-componente="' + compIdxSel + '"][data-tarea="' + tareaIdxSel + '"]');
      if (nuevaRow) {
        nuevaRow.classList.add("selected");
        nuevaRow.classList.add("expanded");
        filaSeleccionadaIdx = { componenteIdx: compIdxSel, tareaIdx: tareaIdxSel };
        mostrarFABs(corte, compIdxSel, tareaIdxSel);
      } else {
        deseleccionarFila();
      }
    } else {
      deseleccionarFila();
    }
  }

  // Actualizar costo por prenda
  var costoLabel = document.getElementById("at-editar-costo-total");
  if (costoLabel) {
    costoLabel.textContent = formatCostoTotal(calcularCostoTotal(corte));
  }

  // Refrescar chips de componente
  mostrarFiltroComponentesEditar();
}

// ============================================================
// AGREGAR COMPONENTE NUEVO desde el input superior
// ============================================================

async function agregarComponenteEditar(corte) {
  var input = document.getElementById("input-editar-componente");
  var errorEl = document.getElementById("error-editar-componente");
  if (!input || !errorEl) return;

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
  var duplicado = componentesData.some(function (c) { return c.toLowerCase() === nombre.toLowerCase(); });
  if (duplicado) {
    errorEl.textContent = "Ya existe un componente con ese nombre";
    errorEl.hidden = false;
    input.classList.add("form-input--error");
    input.focus();
    return;
  }

  var componentesClon = clonarComponentes(corte);
  componentesClon.push({ nombre: nombre, tareas: [] });

  try {
    await db.cortes.update(corte.id, { componentes: componentesClon });
    input.value = "";
    mostrarToast("Componente creado", "success");
    if (onDataChangeRef) await onDataChangeRef();
  } catch (err) {
    console.error("Error al crear componente:", err);
    mostrarToast("Error al crear componente", "error");
  }
}

// ============================================================
// AGREGAR TAREA INLINE desde la fila de agregar dentro de un card
// ============================================================

async function agregarTareaCardInline(corte, compIdx, inputNombreEl, inputPrecioEl) {
  if (!inputNombreEl || !inputPrecioEl) return;

  var nombre = inputNombreEl.value.trim();
  var precio = parseInt(inputPrecioEl.value) || 0;

  inputNombreEl.classList.remove("form-input--error");
  inputPrecioEl.classList.remove("form-input--error");

  if (!nombre) {
    inputNombreEl.classList.add("form-input--error");
    inputNombreEl.focus();
    return;
  }
  if (precio < 0) {
    inputPrecioEl.classList.add("form-input--error");
    inputPrecioEl.focus();
    return;
  }

  // Verificar nombre duplicado en todos los componentes
  var duplicado = false;
  (corte.componentes || []).forEach(function (comp) {
    (comp.tareas || []).forEach(function (t) {
      if ((t.nombre || "").trim().toLowerCase() === nombre.toLowerCase()) {
        duplicado = true;
      }
    });
  });
  if (duplicado) {
    inputNombreEl.classList.add("form-input--error");
    inputNombreEl.focus();
    return;
  }

  var componentesClon = clonarComponentes(corte);

  // Verificar que el componente exista en el clon
  if (compIdx >= componentesClon.length) return;

  var cantidadPrendas = corte.tallas ? corte.tallas.reduce(function (s, t) { return s + t.cantidad; }, 0) : 0;
  var nuevoId = getNuevoId(corte);
  var nuevaTarea = {
    id: nuevoId,
    nombre: nombre,
    precioUnitario: precio,
    unidadesTotales: cantidadPrendas,
    asignaciones: []
  };

  componentesClon[compIdx].tareas.push(nuevaTarea);

  try {
    await db.cortes.update(corte.id, { componentes: componentesClon });
    inputNombreEl.value = "";
    inputPrecioEl.value = "";
    mostrarToast("Tarea agregada", "success");
    if (onDataChangeRef) await onDataChangeRef();
  } catch (err) {
    console.error("Error al agregar tarea:", err);
    mostrarToast("Error al agregar tarea", "error");
  }
}

// ============================================================
// FABs - Mostrar / ocultar acciones flotantes al seleccionar fila
// ============================================================

function seleccionarFila(corte, compIdx, tareaIdx) {
  deseleccionarFila();
  filaSeleccionadaIdx = { componenteIdx: compIdx, tareaIdx: tareaIdx };

  var row = document.querySelector('.tarea-tabla-row[data-componente="' + compIdx + '"][data-tarea="' + tareaIdx + '"]');
  if (row) {
    row.classList.add("selected");
    row.classList.add("expanded");
  }

  mostrarFABs(corte, compIdx, tareaIdx);
}

function deseleccionarFila() {
  var row = document.querySelector(".tarea-tabla-row.selected");
  if (row) row.classList.remove("selected");
  // Colapsar detalle de todas las filas
  var expandedRows = document.querySelectorAll(".tarea-tabla-row.expanded");
  for (var i = 0; i < expandedRows.length; i++) {
    expandedRows[i].classList.remove("expanded");
  }
  filaSeleccionadaIdx = null;
  ocultarFABs();
}

function mostrarFABs(corte, compIdx, tareaIdx) {
  if (ocultarFABsTimeout) {
    clearTimeout(ocultarFABsTimeout);
    ocultarFABsTimeout = null;
  }

  var tarea = getTarea(corte, compIdx, tareaIdx);
  if (!tarea) return;

  var totalAsignado = (tarea.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
  var unidadesTotales = tarea.unidadesTotales || 0;
  var tieneAsignaciones = totalAsignado > 0;
  var estaCompleta = totalAsignado >= unidadesTotales;

  var fabContainer = document.getElementById(EDIT_FAB_CONTAINER_ID);
  if (fabContainer) fabContainer.remove();

  fabContainer = document.createElement("div");
  fabContainer.id = EDIT_FAB_CONTAINER_ID;
  fabContainer.className = "tareas-fab-container";

  fabContainer.innerHTML =
    '<button class="tarea-fab-btn tarea-fab-edit" aria-label="Editar tarea">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
    '</button>' +
    (filtroActual === "todas"
      ? '<button class="tarea-fab-btn tarea-fab-add" aria-label="Agregar tarea debajo">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        '</button>'
      : "") +
    (!estaCompleta
      ? '<button class="tarea-fab-btn tarea-fab-assign" aria-label="Asignar tarea">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
        '</button>'
      : "") +
    (tieneAsignaciones
      ? '<button class="tarea-fab-btn tarea-fab-clear-assign" aria-label="Eliminar asignaciones">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' +
        '</button>'
      : "") +
    (!tieneAsignaciones
      ? '<button class="tarea-fab-btn tarea-fab-delete" aria-label="Eliminar tarea">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>'
      : "");

  document.body.appendChild(fabContainer);

  // Event listeners de FABs
  fabContainer.querySelector(".tarea-fab-edit").addEventListener("click", function () {
    if (filaSeleccionadaIdx !== null) {
      db.cortes.get(corte.id).then(function (corteActualizado) {
        if (corteActualizado) {
          abrirModalEditarTarea(corteActualizado, filaSeleccionadaIdx.componenteIdx, filaSeleccionadaIdx.tareaIdx, onDataChangeRef);
        }
      });
    }
  });

  var fabAdd = fabContainer.querySelector(".tarea-fab-add");
  if (fabAdd) {
    fabAdd.addEventListener("click", function () {
      if (filaSeleccionadaIdx !== null) {
        abrirModalAgregarTarea(corte, filaSeleccionadaIdx.componenteIdx, filaSeleccionadaIdx.tareaIdx);
      }
    });
  }

  var fabAssign = fabContainer.querySelector(".tarea-fab-assign");
  if (fabAssign) {
    fabAssign.addEventListener("click", function () {
      if (filaSeleccionadaIdx !== null) {
        abrirModalAsignarTarea(corte, filaSeleccionadaIdx.componenteIdx, filaSeleccionadaIdx.tareaIdx, onDataChangeRef, trabajadoresMapRef);
      }
    });
  }

  var fabClearAssign = fabContainer.querySelector(".tarea-fab-clear-assign");
  if (fabClearAssign) {
    fabClearAssign.addEventListener("click", function () {
      if (filaSeleccionadaIdx !== null) {
        confirmarEliminarAsignaciones(corte, filaSeleccionadaIdx.componenteIdx, filaSeleccionadaIdx.tareaIdx, onDataChangeRef);
      }
    });
  }

  var fabDelete = fabContainer.querySelector(".tarea-fab-delete");
  if (fabDelete) {
    fabDelete.addEventListener("click", function () {
      if (filaSeleccionadaIdx !== null) {
        confirmarEliminarTarea(corte, filaSeleccionadaIdx.componenteIdx, filaSeleccionadaIdx.tareaIdx, onDataChangeRef);
      }
    });
  }

  fabContainer.classList.remove("visible");
  requestAnimationFrame(function () {
    fabContainer.classList.add("visible");
  });
}

function ocultarFABs() {
  var fabContainer = document.getElementById(EDIT_FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarFABsTimeout = setTimeout(function () {
    var contenedor = document.getElementById(EDIT_FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarFABsTimeout = null;
  }, 300);
}

// ============================================================
// MODAL EDITAR TAREA
// ============================================================

function abrirModalEditarTarea(corte, compIdx, tareaIdx, onDataChange) {
  var tarea = getTarea(corte, compIdx, tareaIdx);
  if (!tarea) return;

  var overlay = document.createElement("div");
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
    '<input type="number" id="input-editar-tarea-precio" class="form-input" value="' + (tarea.precioUnitario || "") + '" min="0" max="9999" step="1" autocomplete="off" />' +
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

  var inputNombre = overlay.querySelector("#input-editar-tarea-nombre");
  var inputPrecio = overlay.querySelector("#input-editar-tarea-precio");

  requestAnimationFrame(function () { inputNombre.focus(); });

  inputNombre.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); inputPrecio.focus(); }
  });
  inputPrecio.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); overlay.querySelector(".modal-guardar").click(); }
  });

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var guardar = async function () {
    var nuevoNombre = inputNombre.value.trim();
    var nuevoPrecio = parseInt(inputPrecio.value) || 0;

    if (!nuevoNombre) {
      mostrarToast("El nombre no puede estar vacio", "warning");
      inputNombre.focus();
      return;
    }

    var componentesClon = clonarComponentes(corte);
    Object.assign(componentesClon[compIdx].tareas[tareaIdx], { nombre: nuevoNombre, precioUnitario: nuevoPrecio });

    // Limpiar componentes vacios
    var compsFiltrados = componentesClon.filter(function (c) { return c.tareas && c.tareas.length > 0; });

    try {
      await db.cortes.update(corte.id, { componentes: compsFiltrados });
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

  var form = overlay.querySelector("#form-editar-tarea-modal");
  form.addEventListener("submit", function (e) { e.preventDefault(); guardar(); });

  var escHandler = function (e) {
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

function abrirModalAgregarTarea(corte, compIdx, tareaIdx) {
  var overlay = document.createElement("div");
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

  var inputNombre = overlay.querySelector("#input-agregar-tarea-nombre");
  var inputPrecio = overlay.querySelector("#input-agregar-tarea-precio");
  var errorNombre = overlay.querySelector("#error-agregar-tarea-nombre");
  var errorPrecio = overlay.querySelector("#error-agregar-tarea-precio");

  requestAnimationFrame(function () { inputNombre.focus(); });

  inputNombre.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); inputPrecio.focus(); }
  });
  inputPrecio.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); overlay.querySelector(".modal-guardar").click(); }
  });

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var agregar = async function () {
    var nombre = inputNombre.value.trim();
    var precio = parseInt(inputPrecio.value) || 0;

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

    var duplicado = false;
    (corte.componentes || []).forEach(function (comp) {
      (comp.tareas || []).forEach(function (t) {
        if ((t.nombre || "").trim().toLowerCase() === nombre.toLowerCase()) {
          duplicado = true;
        }
      });
    });
    if (duplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    var cantidadPrendas = corte.tallas ? corte.tallas.reduce(function (s, t) { return s + t.cantidad; }, 0) : 0;
    var nuevoId = getNuevoId(corte);
    var nuevaTarea = {
      id: nuevoId,
      nombre: nombre,
      precioUnitario: precio,
      unidadesTotales: cantidadPrendas,
      asignaciones: []
    };

    var componentesClon = clonarComponentes(corte);
    componentesClon[compIdx].tareas.splice(tareaIdx + 1, 0, nuevaTarea);

    try {
      await db.cortes.update(corte.id, { componentes: componentesClon });
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

  var form = overlay.querySelector("#form-agregar-tarea-modal");
  form.addEventListener("submit", function (e) { e.preventDefault(); agregar(); });

  var escHandler = function (e) {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ============================================================
// ELIMINAR TAREA - Con confirmacion, solo si no tiene asignaciones
// Elimina del componente especifico. Si el componente queda vacio
// se elimina tambien.
// ============================================================

function confirmarEliminarTarea(corte, compIdx, tareaIdx, onDataChange) {
  var tarea = getTarea(corte, compIdx, tareaIdx);
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
        var componentesClon = clonarComponentes(corte);
        componentesClon[compIdx].tareas.splice(tareaIdx, 1);
        // Limpiar componentes que quedaron sin tareas
        var compsFiltrados = componentesClon.filter(function (c) { return c.tareas && c.tareas.length > 0; });
        await db.cortes.update(corte.id, { componentes: compsFiltrados });
        deseleccionarFila();
        mostrarToast("Tarea eliminada", "success");
        if (onDataChange || onDataChangeRef) await (onDataChange || onDataChangeRef)();
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
// ELIMINAR COMPONENTE (solo si esta vacio)
// ============================================================

function confirmarEliminarComponente(corte, compIdx) {
  var comp = (corte.componentes || [])[compIdx];
  if (!comp) return;

  var nombreComp = comp.nombre || COMPONENTE_DEFAULT;

  mostrarModalConfirmar(
    "Eliminar Componente",
    'Estas seguro de eliminar el componente "' + nombreComp + '"? Esta accion no se puede deshacer.',
    "danger",
    async function () {
      try {
        var componentesClon = clonarComponentes(corte);
        componentesClon.splice(compIdx, 1);
        await db.cortes.update(corte.id, { componentes: componentesClon });
        deseleccionarFila();
        mostrarToast("Componente eliminado", "success");
        if (onDataChangeRef) await onDataChangeRef();
      } catch (err) {
        console.error("Error al eliminar componente:", err);
        mostrarToast("Error al eliminar componente", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

// ============================================================
// ACTUALIZAR PRENDA - Sincroniza tareas al template de la prenda
// Recorre todos los componentes y preserva la estructura.
// Las tareas asignadas se mantienen, las no asignadas se copian.
// ============================================================

function confirmarActualizarPrenda(corte, prenda, onDataChange) {
  var comps = corte.componentes || [];
  var totalTareas = 0;
  comps.forEach(function (comp) {
    totalTareas += (comp.tareas || []).length;
  });

  // Mantener la estructura de componentes completa
  var prendaComponentes = comps.map(function (comp) {
    var tareasFinales = [];
    (comp.tareas || []).forEach(function (t) {
      tareasFinales.push({ nombre: t.nombre.trim(), precioUnitario: t.precioUnitario });
    });
    return { nombre: comp.nombre, tareas: tareasFinales };
  }).filter(function (comp) {
    return comp.tareas.length > 0;
  });

  mostrarModalConfirmar(
    "Actualizar Prenda",
    "Se actualizara la prenda \"" + (prenda.nombre || "") + "\" con " + totalTareas + " tareas de " + prendaComponentes.length + " componentes. Las tareas existentes en la prenda seran reemplazadas.",
    "info",
    async function () {
      try {
        await db.prendas.update(corte.prendaId, { componentes: prendaComponentes });
        mostrarToast("Prenda actualizada con " + totalTareas + " tareas", "success");
        if (onDataChange) await onDataChange();
      } catch (err) {
        console.error("Error al actualizar prenda:", err);
        mostrarToast("Error al actualizar la prenda", "error");
      }
    }
  );
}

// ============================================================
// TAB CORTE - Vista de tareas agrupadas por componente en cards
// Muestra cada componente como una card colapsable con sus tareas,
// precio, total asignado, y lista de trabajadores participantes.
// En cortes activos: botones Asignar Tareas y Finalizar Corte.
// En cortes terminados: badge "CORTE FINALIZADO".
// Soporta seleccion de fila con FABs para Asignar y Eliminar Asignaciones.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatCtv, formatCostoTotal, COMPONENTE_DEFAULT } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast } from "../shared.js";
import { abrirModalAsignarTarea, confirmarEliminarAsignaciones } from "./asignacion-compartida.js";

// ============================================================
// CONSTANTES DEL MODULO
// ============================================================

/** ID del contenedor de FABs para este tab */
const CORTE_FAB_CONTAINER_ID = "at-corte-fab-container";

/** Indices de la fila seleccionada: { componenteIdx, tareaIdx } */
let filaCorteSeleccionada = null;

/** Timeout para ocultar FABs con animacion */
let ocultarCorteFABsTimeout = null;

/** Referencia a onDataChange para FABs que no lo reciben directamente */
let onDataChangeCorteRef = null;

/** Mapa trabajadorId -> nombre para delegar a modales */
let trabajadoresMapCorteRef = null;

let componentesCorteData = [];
let componenteCorteFiltroActivo = "__todas";

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabCorte(corte, container, opciones, mantenerFiltro) {
  const { trabajadoresMap, onCambiarTab, onFinalizar, onDataChange } = opciones;

  onDataChangeCorteRef = onDataChange || null;
  trabajadoresMapCorteRef = trabajadoresMap || {};

  // Limpiar FABs del estado anterior
  document.getElementById(CORTE_FAB_CONTAINER_ID)?.remove();
  filaCorteSeleccionada = null;
  componentesCorteData = (corte.componentes || []).map(function (c) { return c.nombre; });
  if (!mantenerFiltro) componenteCorteFiltroActivo = "__todas";

  const esTerminado = corte.estado === "terminado";
  const progreso = calcularProgreso(corte);

  // Construir chips de componente
  var compsCorte = componentesCorteData.length > 0 ? componentesCorteData : [COMPONENTE_DEFAULT];
  var componenteChipsHTML = '<button class="filter-chip' + (componenteCorteFiltroActivo === "__todas" ? " active" : "") + '" data-componente="__todas">Todas</button>';
  compsCorte.forEach(function (c) {
    var activo = componenteCorteFiltroActivo === c ? " active" : "";
    componenteChipsHTML += '<button class="filter-chip' + activo + '" data-componente="' + escaparHTML(c) + '">' + escaparHTML(c) + '</button>';
  });

  // Tallas del corte
  let tallasHTML = "";
  if (corte.tallas && corte.tallas.length > 0) {
    tallasHTML = corte.tallas
      .map(function (t) {
        return (
          '<span class="talla-badge" style="animation-delay:0ms">' +
          '<span class="talla-badge__nombre">' +
          escaparHTML(t.talla) +
          "</span>" +
          '<span class="talla-badge__cantidad">x' +
          t.cantidad +
          "</span>" +
          "</span>"
        );
      })
      .join("");
  }

  // Badge de estado
  let estadoBadgeHTML;
  if (esTerminado) {
    estadoBadgeHTML =
      '<div class="at-corte__estado-badge at-corte__estado-badge--terminado">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
      "CORTE FINALIZADO</div>";
  } else {
    estadoBadgeHTML =
      '<div class="at-corte__estado-badge">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
      "En progreso</div>";
  }

  container.innerHTML =
    '<section class="at-corte">' +
    // Badge de estado
    estadoBadgeHTML +
    // Barra de progreso
    '<div class="at-resumen__progreso">' +
    '<div class="progress-bar">' +
    '<div class="progress-bar__fill' +
    (esTerminado ? " progress-bar__fill--completo" : "") +
    '" style="width:' +
    progreso +
    '%"></div>' +
    "</div>" +
    '<span class="at-resumen__progreso-label">' +
    progreso +
    "% completado</span>" +
    "</div>" +
    // Tallas
    (tallasHTML
      ? '<div class="at-corte__tallas">' + tallasHTML + "</div>"
      : "") +
    // Filtro por componente
    '<div class="filter-chips" id="corte-componente-filter-chips">' + componenteChipsHTML + '</div>' +
    // Cards de componentes con tareas
    '<div id="at-corte-cards-container">' +
    renderComponentesCardsCorte(corte) +
    '</div>' +
    // Botones de accion (solo en cortes activos)
    (esTerminado
      ? ""
      : '<div class="at-corte__acciones">' +
        '<button class="btn btn--primary" id="btn-ir-asignar">Asignar Tareas</button>' +
        '<button class="btn btn--success" id="btn-finalizar-corte-corte">Finalizar Corte</button>' +
        "</div>") +
    "</section>";

  // Event listeners para botones (solo si el corte esta activo)
  if (!esTerminado) {
    const btnAsignar = document.getElementById("btn-ir-asignar");
    if (btnAsignar) {
      btnAsignar.addEventListener("click", function () {
        if (onCambiarTab) onCambiarTab("asignar");
      });
    }

    const btnFinalizar = document.getElementById("btn-finalizar-corte-corte");
    if (btnFinalizar) {
      btnFinalizar.addEventListener("click", function () {
        var overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "modal-finalizar-titulo");

        overlay.innerHTML =
          '<div class="modal modal--sm modal-edit">' +
          '<div class="modal__header">' +
          '<h3 id="modal-finalizar-titulo" class="modal__title">Finalizar Corte</h3>' +
          '</div>' +
          '<div class="modal__body">' +
          '<p>Al finalizar el corte se marcara como terminado y no se podran agregar mas asignaciones.</p>' +
          '</div>' +
          '<div class="modal__footer">' +
          '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
          '<button class="btn btn--success modal-confirmar">Finalizar Corte</button>' +
          '</div>' +
          '</div>';

        document.body.appendChild(overlay);
        document.body.style.overflow = "hidden";

        var cerrar = function () {
          overlay.classList.add("closing");
          setTimeout(function () {
            overlay.remove();
            document.body.style.overflow = "auto";
          }, 250);
        };

        var confirmar = async function () {
          try {
            await db.cortes.update(corte.id, {
              estado: "terminado",
              fechaFinalizacion: new Date().toISOString(),
            });
            mostrarToast("Corte finalizado", "success");
            if (onFinalizar) await onFinalizar();
          } catch (err) {
            console.error("Error al finalizar corte:", err);
            mostrarToast("Error al finalizar", "error");
          }
          cerrar();
        };

        overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
        overlay.querySelector(".modal-confirmar").addEventListener("click", confirmar);
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
      });
    }
  }

  // ============================================================
  // SELECCION DE FILA + FABs
  // ============================================================

  const cardsContainer = document.getElementById("at-corte-cards-container");
  if (cardsContainer) {
    cardsContainer.addEventListener("click", function (e) {
      // Toggle colapsar card
      var header = e.target.closest(".componente-card__header");
      if (header && !e.target.closest("button")) {
        var card = header.closest(".componente-card");
        if (card) card.classList.toggle("componente-card--collapsed");
        return;
      }

      // Click en fila de tarea (seleccion)
      var row = e.target.closest(".at-corte-task-row");
      if (row && !e.target.closest("button")) {
        var compIdx = parseInt(row.dataset.componente, 10);
        var tareaIdx = parseInt(row.dataset.tarea, 10);
        seleccionarFilaCorte(corte, compIdx, tareaIdx);
        return;
      }
    });
  }

  // Click fuera para deseleccionar
  document.addEventListener("click", function handler(e) {
    if (!e.target.closest(".at-corte-task-row") && !e.target.closest("#" + CORTE_FAB_CONTAINER_ID)) {
      deseleccionarFilaCorte();
    }
  });

  // Filtro por componente
  var componenteFilterChips = document.getElementById("corte-componente-filter-chips");
  if (componenteFilterChips) {
    componenteFilterChips.addEventListener("click", function (e) {
      var chip = e.target.closest(".filter-chip");
      if (!chip) return;
      componenteCorteFiltroActivo = chip.dataset.componente;
      componenteFilterChips.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      renderTabCorte(corte, container, opciones, true);
    });
  }
}

// ============================================================
// RENDER CARDS DE COMPONENTES (solo lectura)
// Cada card muestra sus tareas con tallas y trabajadores asignados.
// ============================================================

function renderComponentesCardsCorte(corte) {
  var componentes = corte.componentes || [];

  if (componentes.length === 0) {
    return '<div class="at-corte-tabla__row" style="color:var(--color-text-muted);text-align:center;padding:var(--space-6);">Sin tareas registradas</div>';
  }

  var html = "";
  componentes.forEach(function (comp, compIdx) {
    // Filtro por componente
    if (componenteCorteFiltroActivo !== "__todas" && comp.nombre !== componenteCorteFiltroActivo) return;

    var tareas = comp.tareas || [];
    var numTareas = tareas.length;

    // Calcular subtotal del componente
    var subtotal = 0;
    tareas.forEach(function (t) {
      subtotal += (t.precioUnitario || 0);
    });

    html += '<div class="componente-card" data-componente-idx="' + compIdx + '">';
    html += '<div class="componente-card__header" role="button" tabindex="0" aria-expanded="true">';
    html += '<svg class="componente-card__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    html += '<span class="componente-card__title">' + escaparHTML(comp.nombre || COMPONENTE_DEFAULT) + '</span>';
    html += '<span class="componente-card__count">' + numTareas + ' tarea' + (numTareas !== 1 ? 's' : '') + '</span>';
    html += '<span class="componente-card__subtotal">' + formatCostoTotal(subtotal) + '</span>';
    html += '</div>';

    html += '<div class="componente-card__body">';

    if (numTareas === 0) {
      html += '<p class="form-hint" style="padding:var(--space-3);text-align:center;margin:0;">Sin tareas en este componente</p>';
    } else {
      tareas.forEach(function (tarea, tareaIdx) {
        html += renderTareaCorteRow(corte, tarea, compIdx, tareaIdx);
      });
    }

    html += '</div>'; // body
    html += '</div>'; // card
  });

  return html;
}

// ============================================================
// RENDER FILA DE TAREA DENTRO DE CARD (solo lectura)
// Muestra tarea con precio, tallas asignadas y trabajadores.
// ============================================================

function renderTareaCorteRow(corte, tarea, compIdx, tareaIdx) {
  var nombre = escaparHTML(tarea.nombre || "Sin nombre");
  var precio = tarea.precioUnitario || 0;
  var asignaciones = tarea.asignaciones || [];
  var totalAsignado = asignaciones.reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
  var unidadesTotales = tarea.unidadesTotales || 0;

  var html = '<div class="at-corte-task-row" data-componente="' + compIdx + '" data-tarea="' + tareaIdx + '" tabindex="0">';

  // Header de la tarea: nombre + precio
  html += '<div class="at-corte-task-header">';
  html += '<span>' + nombre + '</span>';
  html += '<span class="at-corte-task-header__count">' + totalAsignado + '/' + unidadesTotales + ' uds</span>';
  html += '<span class="at-corte-task-header__precio">' + formatCtv(precio) + '</span>';
  html += '</div>';

  // Lista de asignaciones
  html += '<div class="at-corte-assignments">';
  if (asignaciones.length > 0) {
    asignaciones.forEach(function (a) {
      var totalCorte = (
        (corte.tallas || []).find(function (ct) { return ct.talla === a.talla; }) || {}
      ).cantidad || 0;
      var nombreTrab = escaparHTML(
        trabajadoresMapCorteRef[a.trabajadorId] || "Trab. " + a.trabajadorId
      );

      html += '<div class="at-corte-assignment-line">';
      html += '<span><span class="at-corte-assignment-talla">' + escaparHTML(a.talla || "-") + '</span> ' + nombreTrab + '</span>';
      html += '<span class="at-corte-assignment-cantidad">' + (a.cantidad || 0) + '/' + totalCorte + '</span>';
      html += '</div>';
    });
  } else {
    html += '<div class="at-corte-assignment-line at-corte-assignment-line--empty">Sin asignar</div>';
  }
  html += '</div>'; // assignments

  html += '</div>'; // task-row
  return html;
}

// ============================================================
// SELECCION DE FILA
// ============================================================

function seleccionarFilaCorte(corte, compIdx, tareaIdx) {
  deseleccionarFilaCorte();
  filaCorteSeleccionada = { componenteIdx: compIdx, tareaIdx: tareaIdx };

  const row = document.querySelector('.at-corte-task-row[data-componente="' + compIdx + '"][data-tarea="' + tareaIdx + '"]');
  if (row) row.classList.add("selected");

  mostrarFABsCorte(corte, compIdx, tareaIdx);
}

function deseleccionarFilaCorte() {
  const row = document.querySelector(".at-corte-task-row.selected");
  if (row) row.classList.remove("selected");
  filaCorteSeleccionada = null;
  ocultarFABsCorte();
}

// ============================================================
// FABs - Mostrar / ocultar acciones flotantes
// ============================================================

function mostrarFABsCorte(corte, compIdx, tareaIdx) {
  if (ocultarCorteFABsTimeout) {
    clearTimeout(ocultarCorteFABsTimeout);
    ocultarCorteFABsTimeout = null;
  }

  // Solo en cortes activos
  if (corte.estado === "terminado") return;

  const comp = (corte.componentes || [])[compIdx];
  if (!comp) return;
  const tarea = (comp.tareas || [])[tareaIdx];
  if (!tarea) return;

  const totalAsignado = (tarea.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
  const unidadesTotales = tarea.unidadesTotales || 0;
  const tieneAsignaciones = totalAsignado > 0;
  const estaCompleta = totalAsignado >= unidadesTotales;

  let fabContainer = document.getElementById(CORTE_FAB_CONTAINER_ID);
  if (fabContainer) fabContainer.remove();

  fabContainer = document.createElement("div");
  fabContainer.id = CORTE_FAB_CONTAINER_ID;
  fabContainer.className = "tareas-fab-container";

  fabContainer.innerHTML =
    (!estaCompleta
      ? '<button class="tarea-fab-btn tarea-fab-assign" aria-label="Asignar tarea">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
        '</button>'
      : "") +
    (tieneAsignaciones
      ? '<button class="tarea-fab-btn tarea-fab-clear-assign" aria-label="Eliminar asignaciones">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>' +
        '</button>'
      : "");

  // Si no hay botones que mostrar, no agregar FAB
  if (!fabContainer.innerHTML.trim()) return;

  document.body.appendChild(fabContainer);

  // Event listeners de FABs
  const fabAssign = fabContainer.querySelector(".tarea-fab-assign");
  if (fabAssign) {
    fabAssign.addEventListener("click", function () {
      if (filaCorteSeleccionada) {
        abrirModalAsignarTarea(corte, filaCorteSeleccionada.componenteIdx, filaCorteSeleccionada.tareaIdx, onDataChangeCorteRef, trabajadoresMapCorteRef);
      }
    });
  }

  const fabClearAssign = fabContainer.querySelector(".tarea-fab-clear-assign");
  if (fabClearAssign) {
    fabClearAssign.addEventListener("click", function () {
      if (filaCorteSeleccionada) {
        confirmarEliminarAsignaciones(corte, filaCorteSeleccionada.componenteIdx, filaCorteSeleccionada.tareaIdx, onDataChangeCorteRef);
      }
    });
  }

  fabContainer.classList.remove("visible");
  requestAnimationFrame(function () {
    fabContainer.classList.add("visible");
  });
}

function ocultarFABsCorte() {
  const fabContainer = document.getElementById(CORTE_FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarCorteFABsTimeout = setTimeout(function () {
    const contenedor = document.getElementById(CORTE_FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarCorteFABsTimeout = null;
  }, 300);
}

// ============================================================
// CALCULO DE PROGRESO
// ============================================================

function calcularProgreso(corte) {
  if (corte.estado === "terminado") return 100;
  var componentes = corte.componentes || [];
  if (componentes.length === 0) return 0;
  let total = 0;
  let completado = 0;
  componentes.forEach(function (comp) {
    (comp.tareas || []).forEach(function (t) {
      total += t.unidadesTotales || 0;
      if (t.asignaciones) {
        t.asignaciones.forEach(function (a) {
          completado += a.cantidad || 0;
        });
      }
    });
  });
  if (total === 0) return 0;
  return Math.round((completado / total) * 100);
}

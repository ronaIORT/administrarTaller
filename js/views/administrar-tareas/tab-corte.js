// ============================================================
// TAB CORTE - Vista tabular de tareas con trabajadores
// Muestra cada tarea con su precio, total asignado, y lista de
// trabajadores que participan con sus tallas.
// En cortes activos: botones Asignar Tareas y Finalizar Corte.
// En cortes terminados: badge "CORTE FINALIZADO".
// Soporta seleccion de fila con FABs para Asignar y Eliminar Asignaciones.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatCtv } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast } from "../shared.js";
import { abrirModalAsignarTarea, confirmarEliminarAsignaciones } from "./asignacion-compartida.js";

// ============================================================
// CONSTANTES DEL MODULO
// ============================================================

/** ID del contenedor de FABs para este tab */
const CORTE_FAB_CONTAINER_ID = "at-corte-fab-container";

/** Indice de la fila de tarea seleccionada */
let filaCorteSeleccionadaIdx = null;

/** Timeout para ocultar FABs con animacion */
let ocultarCorteFABsTimeout = null;

/** Referencia a onDataChange para FABs que no lo reciben directamente */
let onDataChangeCorteRef = null;

/** Mapa trabajadorId -> nombre para delegar a modales */
let trabajadoresMapCorteRef = null;

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabCorte(corte, container, opciones) {
  const { trabajadoresMap, onCambiarTab, onFinalizar, onDataChange } = opciones;

  onDataChangeCorteRef = onDataChange || null;
  trabajadoresMapCorteRef = trabajadoresMap || {};

  // Limpiar FABs del estado anterior
  document.getElementById(CORTE_FAB_CONTAINER_ID)?.remove();
  filaCorteSeleccionadaIdx = null;

  const esTerminado = corte.estado === "terminado";
  const progreso = calcularProgreso(corte);

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

  // Construir filas de la tabla
  let filasHTML = "";
  if (corte.tareas && corte.tareas.length > 0) {
    filasHTML = corte.tareas
      .map(function (tarea, idx) {
        const lineasPares = (tarea.asignaciones || []).map(function (a) {
          const totalCorte =
            (
              (corte.tallas || []).find(function (ct) {
                return ct.talla === a.talla;
              }) || {}
            ).cantidad || 0;
          const nombreTrab = escaparHTML(
            trabajadoresMap[a.trabajadorId] || "Trab. " + a.trabajadorId,
          );

          return {
            talla:
              '<span class="at-corte-tabla__linea">' +
              escaparHTML(a.talla || "-") +
              " || " +
              (a.cantidad || 0) +
              "/" +
              totalCorte +
              "</span>",
            trabajador:
              '<span class="at-corte-tabla__linea">' + nombreTrab + "</span>",
          };
        });

        const tallasHTML =
          lineasPares.length > 0
            ? lineasPares
                .map(function (p) {
                  return p.talla;
                })
                .join("")
            : '<span class="at-corte-tabla__linea" style="color:var(--color-text-muted);">Sin asignar</span>';

        const trabajadoresHTML =
          lineasPares.length > 0
            ? lineasPares
                .map(function (p) {
                  return p.trabajador;
                })
                .join("")
            : '<span class="at-corte-tabla__linea" style="color:var(--color-text-muted);">Sin asignar</span>';

        return (
          '<div class="at-corte-tabla__row" data-idx="' + idx + '">' +
          '<div class="at-corte-tabla__tarea">' +
          "<span>" +
          escaparHTML(tarea.nombre || "Sin nombre") +
          "</span>" +
          '<span class="at-corte-tabla__precio">' +
          formatCtv(tarea.precioUnitario || 0) +
          "</span>" +
          "</div>" +
          '<div class="at-corte-tabla__tallas">' +
          tallasHTML +
          "</div>" +
          '<div class="at-corte-tabla__trabajadores">' +
          trabajadoresHTML +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  // Badge de estado en la seccion de corte
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
    // Tabla de tareas
    '<div class="at-corte-tabla">' +
    '<div class="at-corte-tabla__header">' +
    "<span>Tarea</span>" +
    "<span>Tallas</span>" +
    "<span>Trabajadores</span>" +
    "</div>" +
    '<div id="at-corte-tabla-body">' +
    (filasHTML ||
      '<div class="at-corte-tabla__row" style="color:var(--color-text-muted);grid-template-columns:1fr;">Sin tareas registradas</div>') +
    "</div>" +
    "</div>" +
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

  const tablaBody = document.getElementById("at-corte-tabla-body");
  if (tablaBody) {
    tablaBody.addEventListener("click", function (e) {
      const row = e.target.closest(".at-corte-tabla__row");
      if (!row || !row.dataset.idx) return;
      const idx = parseInt(row.dataset.idx, 10);
      seleccionarFilaCorte(corte, idx);
    });
  }

  // Click fuera para deseleccionar
  document.addEventListener("click", function handler(e) {
    if (!e.target.closest(".at-corte-tabla__row") && !e.target.closest("#" + CORTE_FAB_CONTAINER_ID)) {
      deseleccionarFilaCorte();
    }
  });
}

// ============================================================
// SELECCION DE FILA
// ============================================================

function seleccionarFilaCorte(corte, idx) {
  deseleccionarFilaCorte();
  filaCorteSeleccionadaIdx = idx;

  const row = document.querySelector('.at-corte-tabla__row[data-idx="' + idx + '"]');
  if (row) row.classList.add("selected");

  mostrarFABsCorte(corte, idx);
}

function deseleccionarFilaCorte() {
  const row = document.querySelector(".at-corte-tabla__row.selected");
  if (row) row.classList.remove("selected");
  filaCorteSeleccionadaIdx = null;
  ocultarFABsCorte();
}

// ============================================================
// FABs - Mostrar / ocultar acciones flotantes
// ============================================================

function mostrarFABsCorte(corte, idx) {
  if (ocultarCorteFABsTimeout) {
    clearTimeout(ocultarCorteFABsTimeout);
    ocultarCorteFABsTimeout = null;
  }

  // Solo en cortes activos
  if (corte.estado === "terminado") return;

  const tarea = (corte.tareas || [])[idx];
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
      if (filaCorteSeleccionadaIdx !== null) {
        abrirModalAsignarTarea(corte, filaCorteSeleccionadaIdx, onDataChangeCorteRef, trabajadoresMapCorteRef);
      }
    });
  }

  const fabClearAssign = fabContainer.querySelector(".tarea-fab-clear-assign");
  if (fabClearAssign) {
    fabClearAssign.addEventListener("click", function () {
      if (filaCorteSeleccionadaIdx !== null) {
        confirmarEliminarAsignaciones(corte, filaCorteSeleccionadaIdx, onDataChangeCorteRef);
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
  if (!corte.tareas || corte.tareas.length === 0) return 0;
  let total = 0;
  let completado = 0;
  corte.tareas.forEach(function (t) {
    total += t.unidadesTotales || 0;
    if (t.asignaciones) {
      t.asignaciones.forEach(function (a) {
        completado += a.cantidad || 0;
      });
    }
  });
  if (total === 0) return 0;
  return Math.round((completado / total) * 100);
}

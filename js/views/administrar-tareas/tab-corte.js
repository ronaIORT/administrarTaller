// ============================================================
// TAB CORTE - Vista tabular de tareas con trabajadores
// Muestra cada tarea con su precio, total asignado, y lista de
// trabajadores que participan con sus tallas.
// En cortes activos: botones Asignar Tareas y Finalizar Corte.
// En cortes terminados: badge "CORTE FINALIZADO".
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs, formatCtv } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast } from "../shared.js";

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabCorte(corte, container, opciones) {
  const { trabajadoresMap, onCambiarTab, onFinalizar } = opciones;

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
      .map(function (tarea) {
        // Construir pares alineados Talla-Trabajador
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
          '<div class="at-corte-tabla__row">' +
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
    (filasHTML ||
      '<div class="at-corte-tabla__row" style="color:var(--color-text-muted);grid-template-columns:1fr;">Sin tareas registradas</div>') +
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

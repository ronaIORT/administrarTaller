// ============================================================
// ASIGNACION COMPARTIDA - Funciones reutilizadas por varios tabs
// Contiene la logica de asignacion y eliminacion de asignaciones
// para evitar duplicacion entre tab-editar.js y tab-corte.js.
// Las tareas se direccionan con doble indice {componenteIdx, tareaIdx}.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBsCtv } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast } from "../shared.js";

// ============================================================
// HELPERS DE DISPONIBILIDAD
// ============================================================

/**
 * Calcula las unidades disponibles por talla para una tarea.
 * Resta del total del corte todas las asignaciones existentes.
 * @param {Object} corte - Corte con array tallas[]
 * @param {Object} tarea - Tarea con array asignaciones[]
 * @returns {Object} - Mapa { nombreTalla: cantidadDisponible }
 */
export function getTallasDisponiblesParaTarea(corte, tarea) {
  var asignadas = {};
  (tarea.asignaciones || []).forEach(function (a) {
    if (a.talla) {
      asignadas[a.talla] = (asignadas[a.talla] || 0) + (a.cantidad || 0);
    }
  });
  var disponibles = {};
  (corte.tallas || []).forEach(function (t) {
    disponibles[t.talla] = Math.max(0, t.cantidad - (asignadas[t.talla] || 0));
  });
  return disponibles;
}

// ============================================================
// MODAL ASIGNAR TAREA
// ============================================================

/**
 * Abre un modal para asignar un trabajador a una tarea especifica.
 * Muestra select de trabajador, precio editable, y grid de tallas
 * con toggle (0/max) para asignar cantidades por talla.
 * @param {Object} corte - Corte actual
 * @param {number} componenteIdx - Indice del componente en corte.componentes
 * @param {number} tareaIdx - Indice de la tarea dentro del componente
 * @param {Function} onDataChange - Callback tras guardar
 * @param {Object} trabajadoresMap - Mapa id -> nombre de trabajadores
 */
export function abrirModalAsignarTarea(corte, componenteIdx, tareaIdx, onDataChange, trabajadoresMap) {
  var comp = (corte.componentes || [])[componenteIdx];
  var tarea = comp ? (comp.tareas || [])[tareaIdx] : null;
  if (!tarea) return;

  var tieneTallas = corte.tallas && corte.tallas.length > 0;
  var disponibles = tieneTallas ? getTallasDisponiblesParaTarea(corte, tarea) : {};

  if (tieneTallas) {
    var algunaDisponible = Object.keys(disponibles).some(function (t) {
      return disponibles[t] > 0;
    });
    if (!algunaDisponible) {
      mostrarToast("No hay tallas disponibles para esta tarea", "warning");
      return;
    }
  }

  var opcionesTrabajadores =
    '<option value="">Seleccionar trabajador...</option>' +
    Object.entries(trabajadoresMap)
      .map(function (entry) {
        return '<option value="' + entry[0] + '">' + escaparHTML(entry[1]) + '</option>';
      })
      .join("");

  var tallasHTML = "";
  if (tieneTallas) {
    var tallasVisibles = (corte.tallas || []).filter(function (t) {
      return (disponibles[t.talla] || 0) > 0;
    });
    var sumaDisp = tallasVisibles.reduce(function (s, t) {
      return s + (disponibles[t.talla] || 0);
    }, 0);
    var totalCtv = sumaDisp * (tarea.precioUnitario || 0);

    tallasHTML =
      '<label class="form-label" id="at-compartido-asignar-contador">Tallas: ' +
      tallasVisibles.length + " | Cantidad: " + sumaDisp +
      " | Total: " + formatBsCtv(totalCtv) + "</label>" +
      '<div class="at-asignar__tallas-grid">' +
      tallasVisibles.map(function (t) {
        var nombreEscapado = escaparHTML(t.talla);
        var disp = disponibles[t.talla] || 0;
        return (
          '<div class="at-asignar__talla-fila">' +
          '<button type="button" class="at-asignar__talla-label" data-talla="' + nombreEscapado +
          '" data-max="' + disp + '" title="Click para toggle 0/' + disp + '">' +
          nombreEscapado + "</button>" +
          '<input type="number" id="input-compartido-asignar-talla-' + nombreEscapado.replace(/\s+/g, "-") +
          '" class="form-input at-asignar__talla-input" placeholder="0" min="0" max="' + disp +
          '" step="1" autocomplete="off" value="' + disp + '" />' +
          '<span class="at-asignar__talla-disponible">/' + disp + "</span>" +
          "</div>"
        );
      }).join("") +
      "</div>";
  } else {
    tallasHTML =
      '<div class="form-group">' +
      '<label for="input-compartido-asignar-cantidad-global" class="form-label">Cantidad</label>' +
      '<input type="number" id="input-compartido-asignar-cantidad-global" class="form-input at-asignar__input-global" placeholder="0" min="1" step="1" autocomplete="off" />' +
      "</div>";
  }

  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-compartido-asignar-titulo");

  overlay.innerHTML =
    '<div class="modal modal--sm">' +
    '<div class="modal__header">' +
    '<h3 id="modal-compartido-asignar-titulo" class="modal__title">Asignar: ' + escaparHTML(tarea.nombre || "Sin nombre") + "</h3>" +
    "</div>" +
    '<div class="modal__body">' +
    '<div class="form-group">' +
    '<label for="select-compartido-asignar-trabajador" class="form-label">Trabajador</label>' +
    '<select id="select-compartido-asignar-trabajador" class="form-select">' + opcionesTrabajadores + "</select>" +
    "</div>" +
    '<div class="form-group">' +
    '<label for="input-compartido-asignar-precio" class="form-label">Precio Unitario (centavos)</label>' +
    '<input type="number" id="input-compartido-asignar-precio" class="form-input" value="' + (tarea.precioUnitario || "") + '" min="0" max="9999" step="1" autocomplete="off" />' +
    "</div>" +
    '<div id="compartido-asignar-tallas-container">' + tallasHTML + "</div>" +
    '<p id="error-compartido-asignar" class="form-error" hidden></p>' +
    "</div>" +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--success modal-asignar">Asignar</button>' +
    "</div>" +
    "</div>";

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  var precioInput = overlay.querySelector("#input-compartido-asignar-precio");
  var selectTrabajador = overlay.querySelector("#select-compartido-asignar-trabajador");
  var errorEl = overlay.querySelector("#error-compartido-asignar");

  requestAnimationFrame(function () { selectTrabajador.focus(); });

  function configurarToggleLocal() {
    var labels = overlay.querySelectorAll(".at-asignar__talla-label");
    labels.forEach(function (label) {
      label.addEventListener("click", function () {
        var max = parseInt(label.dataset.max, 10) || 0;
        var tallaNombre = label.dataset.talla;
        var inputId = "input-compartido-asignar-talla-" + tallaNombre.replace(/\s+/g, "-");
        var input = overlay.querySelector("#" + inputId);
        if (!input) return;
        var currentVal = parseInt(input.value, 10) || 0;
        if (currentVal === 0 && max > 0) {
          input.value = max;
          label.classList.add("at-asignar__talla-label--filled");
        } else {
          input.value = 0;
          label.classList.remove("at-asignar__talla-label--filled");
        }
        actualizarContadorLocal();
      });
    });

    var inputs = overlay.querySelectorAll(".at-asignar__talla-input");
    inputs.forEach(function (input) {
      input.addEventListener("input", function () {
        var tallaNombre = this.id.replace("input-compartido-asignar-talla-", "").replace(/-/g, " ");
        var labelBtn = overlay.querySelector('.at-asignar__talla-label[data-talla="' + tallaNombre + '"]');
        if (labelBtn) {
          var val = parseInt(this.value, 10) || 0;
          var max = parseInt(labelBtn.dataset.max, 10) || 0;
          if (val > max && max > 0) {
            mostrarToast("La cantidad excede el maximo disponible (" + max + ")", "warning");
            this.value = 0;
            labelBtn.classList.remove("at-asignar__talla-label--filled");
          } else if (val > 0 && val === max) {
            labelBtn.classList.add("at-asignar__talla-label--filled");
          } else {
            labelBtn.classList.remove("at-asignar__talla-label--filled");
          }
        }
        actualizarContadorLocal();
      });
    });
  }

  function actualizarContadorLocal() {
    var label = overlay.querySelector("#at-compartido-asignar-contador");
    if (!label) return;
    var inputs = overlay.querySelectorAll(".at-asignar__talla-input");
    var numTallas = 0;
    var suma = 0;
    inputs.forEach(function (input) {
      var val = parseInt(input.value, 10) || 0;
      if (val > 0) { numTallas++; suma += val; }
    });
    var precio = parseInt(precioInput.value, 10) || 0;
    var totalCtv = suma * precio;
    label.textContent = "Tallas: " + numTallas + " | Cantidad: " + suma + " | Total: " + formatBsCtv(totalCtv);
  }

  precioInput.addEventListener("input", actualizarContadorLocal);

  if (tieneTallas) {
    configurarToggleLocal();
  }

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var asignar = async function () {
    var trabajadorId = selectTrabajador.value ? parseInt(selectTrabajador.value, 10) : null;
    var precio = parseInt(precioInput.value, 10) || 0;
    var fecha = new Date().toISOString();

    errorEl.hidden = true;

    if (!trabajadorId) {
      errorEl.textContent = "Selecciona un trabajador";
      errorEl.hidden = false;
      selectTrabajador.focus();
      return;
    }

    var nuevasAsignaciones = [];

    if (tieneTallas) {
      (corte.tallas || []).forEach(function (talla) {
        var inputId = "input-compartido-asignar-talla-" + talla.talla.replace(/\s+/g, "-");
        var input = overlay.querySelector("#" + inputId);
        var cantidad = input ? parseInt(input.value, 10) || 0 : 0;
        if (cantidad > 0) {
          nuevasAsignaciones.push({
            trabajadorId: trabajadorId,
            cantidad: cantidad,
            talla: talla.talla,
            fecha: fecha,
          });
        }
      });
      if (nuevasAsignaciones.length === 0) {
        errorEl.textContent = "Ingresa al menos una cantidad por talla";
        errorEl.hidden = false;
        return;
      }
    } else {
      var inputCantidad = overlay.querySelector("#input-compartido-asignar-cantidad-global");
      var cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) || 0 : 0;
      if (!cantidad || cantidad < 1) {
        errorEl.textContent = "Ingresa una cantidad valida";
        errorEl.hidden = false;
        if (inputCantidad) inputCantidad.focus();
        return;
      }
      nuevasAsignaciones = [{
        trabajadorId: trabajadorId,
        cantidad: cantidad,
        talla: null,
        fecha: fecha,
      }];
    }

    try {
      var componentesActualizados = (corte.componentes || []).map(function (comp, ci) {
        if (ci === componenteIdx) {
          return Object.assign({}, comp, {
            tareas: (comp.tareas || []).map(function (t, ti) {
              if (ti === tareaIdx) {
                return Object.assign({}, t, {
                  precioUnitario: precio,
                  asignaciones: (t.asignaciones || []).concat(nuevasAsignaciones),
                });
              }
              return t;
            })
          });
        }
        return comp;
      });
      await db.cortes.update(corte.id, { componentes: componentesActualizados });
      cerrar();
      mostrarToast("Asignacion guardada", "success");
      if (onDataChange) await onDataChange();
    } catch (err) {
      console.error("Error al asignar tarea:", err);
      mostrarToast("Error al guardar", "error");
    }
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-asignar").addEventListener("click", asignar);
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
// ELIMINAR ASIGNACIONES - Limpia todas las asignaciones de una tarea
// ============================================================

/**
 * Confirma y elimina todas las asignaciones de una tarea.
 * @param {Object} corte - Corte actual
 * @param {number} componenteIdx - Indice del componente en corte.componentes
 * @param {number} tareaIdx - Indice de la tarea dentro del componente
 * @param {Function} onDataChange - Callback tras eliminar
 */
export function confirmarEliminarAsignaciones(corte, componenteIdx, tareaIdx, onDataChange) {
  var comp = (corte.componentes || [])[componenteIdx];
  var tarea = comp ? (comp.tareas || [])[tareaIdx] : null;
  if (!tarea) return;

  var totalAsignado = (tarea.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
  if (totalAsignado === 0) {
    mostrarToast("La tarea no tiene asignaciones", "warning");
    return;
  }

  mostrarModalConfirmar(
    "Eliminar Asignaciones",
    "Se eliminaran todas las asignaciones de \"" + (tarea.nombre || "Sin nombre") + "\" (" + totalAsignado + " unidades). Los trabajadores perderan estas asignaciones.",
    "danger",
    async function () {
      try {
        var componentesActualizados = (corte.componentes || []).map(function (comp, ci) {
          if (ci === componenteIdx) {
            return Object.assign({}, comp, {
              tareas: (comp.tareas || []).map(function (t, ti) {
                if (ti === tareaIdx) {
                  return Object.assign({}, t, { asignaciones: [] });
                }
                return t;
              })
            });
          }
          return comp;
        });
        await db.cortes.update(corte.id, { componentes: componentesActualizados });
        mostrarToast("Asignaciones eliminadas", "success");
        if (onDataChange) await onDataChange();
      } catch (err) {
        console.error("Error al eliminar asignaciones:", err);
        mostrarToast("Error al eliminar asignaciones", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

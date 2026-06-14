// ============================================================
// ASIGNACION COMPARTIDA - Funciones reutilizadas por varios tabs
// Contiene la logica de asignacion y eliminacion de asignaciones
// para evitar duplicacion entre tab-editar.js y tab-corte.js.
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
  let asignadas = {};
  (tarea.asignaciones || []).forEach(function (a) {
    if (a.talla) {
      asignadas[a.talla] = (asignadas[a.talla] || 0) + (a.cantidad || 0);
    }
  });
  let disponibles = {};
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
 * @param {number} idx - Indice de la tarea en corte.tareas
 * @param {Function} onDataChange - Callback tras guardar
 * @param {Object} trabajadoresMap - Mapa id -> nombre de trabajadores
 */
export function abrirModalAsignarTarea(corte, idx, onDataChange, trabajadoresMap) {
  const tarea = (corte.tareas || [])[idx];
  if (!tarea) return;

  const tieneTallas = corte.tallas && corte.tallas.length > 0;
  const disponibles = tieneTallas ? getTallasDisponiblesParaTarea(corte, tarea) : {};

  if (tieneTallas) {
    const algunaDisponible = Object.keys(disponibles).some(function (t) {
      return disponibles[t] > 0;
    });
    if (!algunaDisponible) {
      mostrarToast("No hay tallas disponibles para esta tarea", "warning");
      return;
    }
  }

  const opcionesTrabajadores =
    '<option value="">Seleccionar trabajador...</option>' +
    Object.entries(trabajadoresMap)
      .map(function (entry) {
        return '<option value="' + entry[0] + '">' + escaparHTML(entry[1]) + '</option>';
      })
      .join("");

  let tallasHTML = "";
  if (tieneTallas) {
    const tallasVisibles = (corte.tallas || []).filter(function (t) {
      return (disponibles[t.talla] || 0) > 0;
    });
    const sumaDisp = tallasVisibles.reduce(function (s, t) {
      return s + (disponibles[t.talla] || 0);
    }, 0);
    const totalCtv = sumaDisp * (tarea.precioUnitario || 0);

    tallasHTML =
      '<label class="form-label" id="at-compartido-asignar-contador">Tallas: ' +
      tallasVisibles.length + " | Cantidad: " + sumaDisp +
      " | Total: " + formatBsCtv(totalCtv) + "</label>" +
      '<div class="at-asignar__tallas-grid">' +
      tallasVisibles.map(function (t) {
        const nombreEscapado = escaparHTML(t.talla);
        const disp = disponibles[t.talla] || 0;
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

  const overlay = document.createElement("div");
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
    '<input type="number" id="input-compartido-asignar-precio" class="form-input" value="' + (tarea.precioUnitario || 0) + '" min="0" max="9999" step="1" autocomplete="off" />' +
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

  const precioInput = overlay.querySelector("#input-compartido-asignar-precio");
  const selectTrabajador = overlay.querySelector("#select-compartido-asignar-trabajador");
  const errorEl = overlay.querySelector("#error-compartido-asignar");

  requestAnimationFrame(function () { selectTrabajador.focus(); });

  function configurarToggleLocal() {
    const labels = overlay.querySelectorAll(".at-asignar__talla-label");
    labels.forEach(function (label) {
      label.addEventListener("click", function () {
        const max = parseInt(label.dataset.max, 10) || 0;
        const tallaNombre = label.dataset.talla;
        const inputId = "input-compartido-asignar-talla-" + tallaNombre.replace(/\s+/g, "-");
        const input = overlay.querySelector("#" + inputId);
        if (!input) return;
        const currentVal = parseInt(input.value, 10) || 0;
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

    const inputs = overlay.querySelectorAll(".at-asignar__talla-input");
    inputs.forEach(function (input) {
      input.addEventListener("input", function () {
        const tallaNombre = this.id.replace("input-compartido-asignar-talla-", "").replace(/-/g, " ");
        const labelBtn = overlay.querySelector('.at-asignar__talla-label[data-talla="' + tallaNombre + '"]');
        if (labelBtn) {
          const val = parseInt(this.value, 10) || 0;
          const max = parseInt(labelBtn.dataset.max, 10) || 0;
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
    const label = overlay.querySelector("#at-compartido-asignar-contador");
    if (!label) return;
    const inputs = overlay.querySelectorAll(".at-asignar__talla-input");
    let numTallas = 0;
    let suma = 0;
    inputs.forEach(function (input) {
      const val = parseInt(input.value, 10) || 0;
      if (val > 0) { numTallas++; suma += val; }
    });
    const precio = parseInt(precioInput.value, 10) || 0;
    const totalCtv = suma * precio;
    label.textContent = "Tallas: " + numTallas + " | Cantidad: " + suma + " | Total: " + formatBsCtv(totalCtv);
  }

  precioInput.addEventListener("input", actualizarContadorLocal);

  if (tieneTallas) {
    configurarToggleLocal();
  }

  const cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  const asignar = async function () {
    const trabajadorId = selectTrabajador.value ? parseInt(selectTrabajador.value, 10) : null;
    const precio = parseInt(precioInput.value, 10) || 0;
    const fecha = new Date().toISOString();

    errorEl.hidden = true;

    if (!trabajadorId) {
      errorEl.textContent = "Selecciona un trabajador";
      errorEl.hidden = false;
      selectTrabajador.focus();
      return;
    }

    let nuevasAsignaciones = [];

    if (tieneTallas) {
      (corte.tallas || []).forEach(function (talla) {
        const inputId = "input-compartido-asignar-talla-" + talla.talla.replace(/\s+/g, "-");
        const input = overlay.querySelector("#" + inputId);
        const cantidad = input ? parseInt(input.value, 10) || 0 : 0;
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
      const inputCantidad = overlay.querySelector("#input-compartido-asignar-cantidad-global");
      const cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) || 0 : 0;
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
      const tareasActualizadas = (corte.tareas || []).map(function (t, i) {
        if (i === idx) {
          return Object.assign({}, t, {
            precioUnitario: precio,
            asignaciones: (t.asignaciones || []).concat(nuevasAsignaciones),
          });
        }
        return t;
      });
      await db.cortes.update(corte.id, { tareas: tareasActualizadas });
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

  const escHandler = function (e) {
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
 * @param {number} idx - Indice de la tarea en corte.tareas
 * @param {Function} onDataChange - Callback tras eliminar
 */
export function confirmarEliminarAsignaciones(corte, idx, onDataChange) {
  const tarea = (corte.tareas || [])[idx];
  if (!tarea) return;

  const totalAsignado = (tarea.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
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
        const tareasActualizadas = (corte.tareas || []).map(function (t, i) {
          if (i === idx) {
            return Object.assign({}, t, { asignaciones: [] });
          }
          return t;
        });
        await db.cortes.update(corte.id, { tareas: tareasActualizadas });
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

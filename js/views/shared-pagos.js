// ============================================================
// SHARED PAGOS - Modal de pago reutilizable
// Usado por tab-pagos.js (gestion de pagos) y tab-trabajador.js
// (administrar tareas). Valida contra la BD antes de insertar
// para evitar race conditions entre vistas.
// ============================================================

import { db } from "../db.js";
import { escaparHTML, formatBs } from "../utils.js";
import { mostrarToast } from "./shared.js";

// ============================================================
// MODAL DE PAGO - Abre el formulario de registro de pago
// El monto sugerido es el pendiente actual. Valida que el monto
// ingresado no supere el pendiente real (consulta fresca a BD).
// @param {Object} opciones
// @param {number} opciones.corteId
// @param {string} opciones.corteNombre
// @param {number} opciones.trabajadorId
// @param {string} opciones.trabajadorNombre
// @param {number} opciones.pending - Monto pendiente en Bs (decimal)
// @param {Function} [opciones.onDataChange] - Callback tras pago exitoso
// ============================================================

export function abrirModalPagoShared(opciones) {
  const { corteId, corteNombre, trabajadorId, trabajadorNombre, pending, onDataChange } = opciones;
  const sugerencia = pending;
  const maxPago = pending;
  const today = new Date().toISOString().split("T")[0];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "pagos-modal-titulo");

  overlay.innerHTML =
    '<div class="modal">' +
    '<div class="modal__header">' +
    '<h3 id="pagos-modal-titulo" class="modal__title">Registrar Pago</h3>' +
    "</div>" +
    '<div class="modal__body">' +
    '<div class="pagos-modal__info-row">' +
    '<span class="pagos-modal__info-label">Trabajador</span>' +
    '<span class="pagos-modal__info-value">' + escaparHTML(trabajadorNombre) + "</span>" +
    "</div>" +
    '<div class="pagos-modal__corte-tag" title="' + escaparHTML(corteNombre) + '">' +
    "🧵 " + escaparHTML(corteNombre) +
    "</div>" +
    '<div class="pagos-modal__pending-box">' +
    '<div class="pagos-modal__pending-label">Pendiente en este corte</div>' +
    '<div class="pagos-modal__pending-value">' + formatBs(sugerencia) + "</div>" +
    "</div>" +
    '<div class="form-group">' +
    '<label for="pagos-modal-monto" class="form-label">Monto (Bs)</label>' +
    '<input type="number" id="pagos-modal-monto" class="form-input" ' +
    'value="' + (sugerencia > 0 ? sugerencia.toFixed(2) : "") + '" ' +
    'min="0.01" max="' + (maxPago > 0 ? maxPago.toFixed(2) : "0.01") + '" step="0.01" autocomplete="off" />' +
    '<p id="pagos-modal-error-monto" class="form-error" hidden></p>' +
    "</div>" +
    '<div class="form-group">' +
    '<label for="pagos-modal-fecha" class="form-label">Fecha</label>' +
    '<input type="date" id="pagos-modal-fecha" class="form-input" ' +
    'value="' + today + '" />' +
    "</div>" +
    '<div class="form-group">' +
    '<label for="pagos-modal-nota" class="form-label">Nota (opcional)</label>' +
    '<textarea id="pagos-modal-nota" class="form-input" rows="2" ' +
    'placeholder="Ej: Pago parcial, adelanto..." maxlength="200" autocomplete="off"></textarea>' +
    "</div>" +
    "</div>" +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary pagos-modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--primary pagos-modal-submit">Confirmar Pago</button>' +
    "</div>" +
    "</div>";

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  requestAnimationFrame(function () {
    document.getElementById("pagos-modal-monto").focus();
  });

  // Toggle monto al hacer click en el pending box
  overlay.querySelector(".pagos-modal__pending-box").addEventListener("click", function () {
    var inputMonto = document.getElementById("pagos-modal-monto");
    limpiarError();
    if (inputMonto.value) {
      inputMonto.value = "";
    } else {
      inputMonto.value = sugerencia > 0 ? sugerencia.toFixed(2) : "";
    }
    inputMonto.focus();
  });

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var mostrarError = function (msg) {
    var errorEl = document.getElementById("pagos-modal-error-monto");
    var inputMonto = document.getElementById("pagos-modal-monto");
    errorEl.textContent = msg;
    errorEl.hidden = false;
    inputMonto.classList.add("form-input--error");
    inputMonto.focus();
  };

  var limpiarError = function () {
    var errorEl = document.getElementById("pagos-modal-error-monto");
    var inputMonto = document.getElementById("pagos-modal-monto");
    errorEl.hidden = true;
    inputMonto.classList.remove("form-input--error");
  };

  var confirmar = async function () {
    limpiarError();

    var inputMonto = document.getElementById("pagos-modal-monto");
    var inputFecha = document.getElementById("pagos-modal-fecha");
    var inputNota = document.getElementById("pagos-modal-nota");

    var monto = parseFloat(inputMonto.value);
    if (!monto || monto <= 0) {
      mostrarError("Ingresa un monto valido mayor a 0");
      return;
    }

    // Redondear a 2 decimales
    monto = Math.round(monto * 100) / 100;

    // Recalcular pendiente real desde la BD (anti race condition)
    var pendienteReal;
    try {
      pendienteReal = await calcularPendienteActual(corteId, trabajadorId);
    } catch (err) {
      console.error("Error al verificar pendiente:", err);
      mostrarError("No se pudo verificar el pendiente. Intenta de nuevo.");
      return;
    }

    if (monto > pendienteReal) {
      mostrarError("El monto no puede superar el pendiente actual (" + formatBs(pendienteReal) + ")");
      return;
    }

    var fecha = inputFecha.value || new Date().toISOString().split("T")[0];
    var nota = inputNota.value.trim() || null;

    try {
      await db.pagos.add({
        corteId: corteId,
        trabajadorId: trabajadorId,
        monto: monto,
        fecha: fecha,
        nota: nota,
      });
      mostrarToast("Pago registrado: " + formatBs(monto), "success");
      cerrar();
      if (onDataChange) await onDataChange();
    } catch (err) {
      console.error("Error al registrar pago:", err);
      mostrarToast("Error al registrar pago", "error");
    }
  };

  overlay.querySelector(".pagos-modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".pagos-modal-submit").addEventListener("click", confirmar);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
  });

  // Enter en monto navega a fecha, Enter en fecha confirma
  overlay.querySelector("#pagos-modal-monto").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("pagos-modal-fecha").focus();
    }
  });
  overlay.querySelector("#pagos-modal-fecha").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmar();
    }
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
// PENDIENTE ACTUAL - Consulta fresca desde la BD
// Anti race condition: valida justo antes de insertar el pago.
// ============================================================

async function calcularPendienteActual(corteId, trabajadorId) {
  const pagosActuales = await db.pagos
    .where({ corteId: corteId, trabajadorId: trabajadorId })
    .toArray();
  var totalPagado = 0;
  pagosActuales.forEach(function (p) {
    totalPagado += p.monto || 0;
  });

  const corte = await db.cortes.get(corteId);
  if (!corte) return 0;

  var ganadoCtv = 0;
  (corte.tareas || []).forEach(function (t) {
    (t.asignaciones || []).forEach(function (a) {
      if (a.trabajadorId === trabajadorId) {
        ganadoCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
      }
    });
  });

  return Math.max(0, ganadoCtv / 100 - totalPagado);
}

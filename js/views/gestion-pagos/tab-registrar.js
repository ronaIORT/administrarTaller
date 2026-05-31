// ============================================================
// TAB REGISTRAR - Formulario de pago global por trabajador
// Permite registrar un pago que se descuenta del saldo pendiente
// total del trabajador. El pago no se asocia a un corte especifico.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs, bolivianosACentavos, centavosABolivianos } from "../../utils.js";
import { mostrarToast } from "../shared.js";

// ============================================================
// CALCULO DE PENDIENTE - Calcula el saldo pendiente de un trabajador
// ============================================================

function calcularPendiente(trabajadorId, cortes, pagos) {
  var ganadoCtv = 0;

  cortes.forEach(function (corte) {
    if (!corte.tareas) return;
    corte.tareas.forEach(function (tarea) {
      if (!tarea.asignaciones) return;
      tarea.asignaciones.forEach(function (asignacion) {
        if (asignacion.trabajadorId === trabajadorId) {
          ganadoCtv += (asignacion.cantidad || 0) * (tarea.precioUnitario || 0);
        }
      });
    });
  });

  var pagadoCtv = 0;
  pagos.forEach(function (pago) {
    if (pago.trabajadorId === trabajadorId) {
      pagadoCtv += pago.monto || 0;
    }
  });

  return ganadoCtv - pagadoCtv;
}

// ============================================================
// RENDER PRINCIPAL DEL TAB
// ============================================================

export function renderTabRegistrar(pagos, cortes, trabajadoresMap, trabajadoresLista, container, opciones) {
  container.innerHTML = "";

  var trabajadoresOrdenados = trabajadoresLista.slice().sort(function (a, b) {
    return a.nombre.localeCompare(b.nombre);
  });

  if (trabajadoresOrdenados.length === 0) {
    container.innerHTML =
      '<div class="pg-registrar">' +
      '<div class="empty-state">' +
      '<p class="empty-state__text">Sin trabajadores</p>' +
      '<p class="empty-state__subtext">Registra trabajadores primero</p>' +
      '</div>' +
      '</div>';
    return;
  }

  // Trabajador preseleccionado (viene del tab Resumen)
  var preseleccionado = opciones.trabajadorPreseleccionado || null;

  var html =
    '<div class="pg-registrar">' +
    '<form id="pg-registrar-form" class="pg-registrar__form">' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-select-trabajador">Trabajador</label>' +
    '<select id="pg-select-trabajador" class="form-select" required>' +
    '<option value="">Seleccionar trabajador</option>';

  trabajadoresOrdenados.forEach(function (t) {
    var selected = (preseleccionado && t.id === preseleccionado) ? " selected" : "";
    html += '<option value="' + t.id + '"' + selected + '>' + escaparHTML(t.nombre) + '</option>';
  });

  html +=
    '</select>' +
    '</div>' +
    '<div id="pg-saldo-pendiente" class="pg-registrar__saldo" style="display:none;">' +
    '<span class="pg-registrar__saldo-label">Saldo pendiente:</span>' +
    '<span class="pg-registrar__saldo-valor" id="pg-saldo-valor"></span>' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-input-monto">Monto (Bs)</label>' +
    '<input type="number" id="pg-input-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" required />' +
    '<button type="button" id="pg-btn-sugerir" class="btn btn--ghost btn--sm" style="display:none;margin-top:4px;">Sugerir monto pendiente</button>' +
    '<p class="form-error" id="pg-error-monto" style="display:none;"></p>' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-input-fecha">Fecha</label>' +
    '<input type="date" id="pg-input-fecha" class="form-input" required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-input-notas">Notas (opcional)</label>' +
    '<textarea id="pg-input-notas" class="form-input" rows="2" placeholder="Descripcion del pago..."></textarea>' +
    '</div>' +
    '<button type="submit" class="btn btn--success btn--full" id="pg-btn-registrar">Registrar Pago</button>' +
    '</form>' +
    '</div>';

  container.innerHTML = html;

  // Fecha por defecto: hoy
  var inputFecha = document.getElementById("pg-input-fecha");
  var hoy = new Date();
  var fechaStr = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
  inputFecha.value = fechaStr;

  var selectTrabajador = document.getElementById("pg-select-trabajador");
  var inputMonto = document.getElementById("pg-input-monto");
  var errorMonto = document.getElementById("pg-error-monto");
  var saldoPendiente = document.getElementById("pg-saldo-pendiente");
  var saldoValor = document.getElementById("pg-saldo-valor");
  var btnSugerir = document.getElementById("pg-btn-sugerir");

  var pendienteActual = 0;

  // Al seleccionar trabajador, mostrar saldo pendiente
  selectTrabajador.addEventListener("change", function () {
    var trabajadorId = parseInt(selectTrabajador.value);
    if (!trabajadorId) {
      saldoPendiente.style.display = "none";
      btnSugerir.style.display = "none";
      pendienteActual = 0;
      return;
    }

    pendienteActual = calcularPendiente(trabajadorId, cortes, pagos);

    if (pendienteActual > 0) {
      saldoPendiente.style.display = "flex";
      saldoValor.textContent = formatBs(pendienteActual);
      saldoValor.className = "pg-registrar__saldo-valor pg-registrar__saldo-valor--deuda";
      btnSugerir.style.display = "inline-flex";
    } else if (pendienteActual === 0) {
      saldoPendiente.style.display = "flex";
      saldoValor.textContent = "0.00 Bs (Al dia)";
      saldoValor.className = "pg-registrar__saldo-valor pg-registrar__saldo-valor--ok";
      btnSugerir.style.display = "none";
    } else {
      saldoPendiente.style.display = "flex";
      saldoValor.textContent = formatBs(Math.abs(pendienteActual)) + " (A favor)";
      saldoValor.className = "pg-registrar__saldo-valor pg-registrar__saldo-valor--ok";
      btnSugerir.style.display = "none";
    }

    // Limpiar error al cambiar trabajador
    errorMonto.style.display = "none";
    inputMonto.classList.remove("form-input--error");
  });

  // Boton sugerir monto
  btnSugerir.addEventListener("click", function () {
    if (pendienteActual > 0) {
      inputMonto.value = centavosABolivianos(pendienteActual).toFixed(2);
    }
  });

  // Submit del formulario
  var form = document.getElementById("pg-registrar-form");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    var trabajadorId = parseInt(selectTrabajador.value);
    var montoBs = parseFloat(inputMonto.value);
    var fecha = inputFecha.value;
    var notas = document.getElementById("pg-input-notas").value.trim();

    // Validaciones
    if (!trabajadorId) {
      mostrarToast("Selecciona un trabajador", "warning");
      return;
    }

    if (isNaN(montoBs) || montoBs <= 0) {
      errorMonto.textContent = "Ingresa un monto mayor a 0";
      errorMonto.style.display = "block";
      inputMonto.classList.add("form-input--error");
      return;
    }

    var montoCtv = bolivianosACentavos(montoBs);

    // Recalcular pendiente directo desde BD por si cambio
    var pendienteActualizado = calcularPendiente(trabajadorId, cortes, pagos);

    if (pendienteActualizado > 0 && montoCtv > pendienteActualizado) {
      errorMonto.textContent = "El monto excede el saldo pendiente (" + formatBs(pendienteActualizado) + ")";
      errorMonto.style.display = "block";
      inputMonto.classList.add("form-input--error");
      return;
    }

    if (!fecha) {
      mostrarToast("Selecciona una fecha", "warning");
      return;
    }

    var trabajador = trabajadoresMap[trabajadorId];
    var trabajadorNombre = trabajador ? trabajador.nombre : "Desconocido";

    try {
      await db.pagos.add({
        trabajadorId: trabajadorId,
        monto: montoCtv,
        fecha: fecha,
        trabajadorNombre: trabajadorNombre,
        notas: notas,
        corteId: null,
      });

      mostrarToast("Pago registrado correctamente", "success");

      // Limpiar formulario
      form.reset();
      inputFecha.value = fechaStr;
      saldoPendiente.style.display = "none";
      btnSugerir.style.display = "none";
      errorMonto.style.display = "none";
      inputMonto.classList.remove("form-input--error");
      pendienteActual = 0;

      // Notificar al orquestador para recargar datos
      if (opciones.onPagoRegistrado) {
        await opciones.onPagoRegistrado();
      }
    } catch (err) {
      console.error("Error registrando pago:", err);
      mostrarToast("Error al registrar pago", "error");
    }
  });

  // Si hay trabajador preseleccionado, disparar el evento change
  if (preseleccionado) {
    selectTrabajador.dispatchEvent(new Event("change"));
  }
}
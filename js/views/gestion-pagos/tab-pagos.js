// ============================================================
// TAB PAGOS - Saldos por trabajador con filtro de estado de corte
// Filtros: Finalizados → Activos → Todos
// Calcula ganado/pagado/pendiente por trabajador filtrando
// cortes por estado y pagos por trabajadores con cortes relevantes.
// Boton "Pagar" abre bottom sheet con formulario.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs, centavosABolivianos, bolivianosACentavos } from "../../utils.js";
import { mostrarBottomSheet, mostrarToast, estadoVacioHTML } from "../shared.js";

function calcularSaldos(trabajadoresLista, cortes, pagos, filtroEstado) {
  var resultado = {};

  trabajadoresLista.forEach(function (t) {
    resultado[t.id] = {
      trabajadorId: t.id,
      nombre: t.nombre,
      ganadoCtv: 0,
      pagadoCtv: 0,
      pendienteCtv: 0,
    };
  });

  var cortesFiltrados = cortes;
  if (filtroEstado === "activo") {
    cortesFiltrados = cortes.filter(function (c) { return c.estado === "activo"; });
  } else if (filtroEstado === "terminado") {
    cortesFiltrados = cortes.filter(function (c) { return c.estado === "terminado"; });
  }

  var trabajadoresConCortesFiltrados = {};
  cortesFiltrados.forEach(function (corte) {
    if (!corte.tareas) return;
    corte.tareas.forEach(function (tarea) {
      if (!tarea.asignaciones) return;
      tarea.asignaciones.forEach(function (asignacion) {
        trabajadoresConCortesFiltrados[asignacion.trabajadorId] = true;
      });
    });
  });

  cortesFiltrados.forEach(function (corte) {
    if (!corte.tareas) return;
    corte.tareas.forEach(function (tarea) {
      if (!tarea.asignaciones) return;
      tarea.asignaciones.forEach(function (asignacion) {
        var trabajadorId = asignacion.trabajadorId;
        if (resultado[trabajadorId]) {
          var cantidad = asignacion.cantidad || 0;
          var precio = tarea.precioUnitario || 0;
          resultado[trabajadorId].ganadoCtv += cantidad * precio;
        }
      });
    });
  });

  pagos.forEach(function (pago) {
    var trabajadorId = pago.trabajadorId;
    if (resultado[trabajadorId] && trabajadoresConCortesFiltrados[trabajadorId]) {
      resultado[trabajadorId].pagadoCtv += pago.monto || 0;
    }
  });

  Object.keys(resultado).forEach(function (id) {
    resultado[id].pendienteCtv = resultado[id].ganadoCtv - resultado[id].pagadoCtv;
  });

  return Object.values(resultado);
}

function calcularPendienteFiltrado(trabajadorId, cortes, pagos, filtroEstado) {
  var ganadoCtv = 0;

  var cortesFiltrados = cortes;
  if (filtroEstado === "activo") {
    cortesFiltrados = cortes.filter(function (c) { return c.estado === "activo"; });
  } else if (filtroEstado === "terminado") {
    cortesFiltrados = cortes.filter(function (c) { return c.estado === "terminado"; });
  }

  var tieneCorteFiltrado = false;
  cortesFiltrados.forEach(function (corte) {
    if (!corte.tareas) return;
    corte.tareas.forEach(function (tarea) {
      if (!tarea.asignaciones) return;
      tarea.asignaciones.forEach(function (asignacion) {
        if (asignacion.trabajadorId === trabajadorId) {
          tieneCorteFiltrado = true;
          ganadoCtv += (asignacion.cantidad || 0) * (tarea.precioUnitario || 0);
        }
      });
    });
  });

  if (!tieneCorteFiltrado) return 0;

  var pagadoCtv = 0;
  pagos.forEach(function (pago) {
    if (pago.trabajadorId === trabajadorId) {
      pagadoCtv += pago.monto || 0;
    }
  });

  return ganadoCtv - pagadoCtv;
}

function generarFormularioPago(trabajadorId, trabajadorNombre, pendienteActual, filtroEstado) {
  var pendienteStr = formatBs(Math.abs(pendienteActual));
  var esDeudor = pendienteActual > 0;
  var estadoLabel = filtroEstado === "terminado" ? "Finalizados" : (filtroEstado === "activo" ? "Activos" : "Todos");

  return '<form id="pg-bottom-sheet-form">' +
    '<div class="form-group">' +
    '<label class="form-label">Trabajador</label>' +
    '<input type="text" class="form-input" value="' + escaparHTML(trabajadorNombre) + '" readonly />' +
    '<input type="hidden" name="trabajadorId" value="' + trabajadorId + '" />' +
    '</div>' +
    '<div class="pg-registrar__saldo">' +
    '<span class="pg-registrar__saldo-label">Saldo en cortes ' + estadoLabel + ':</span>' +
    '<span class="pg-registrar__saldo-valor ' + (esDeudor ? 'pg-registrar__saldo-valor--deuda' : 'pg-registrar__saldo-valor--ok') + '">' +
    (esDeudor ? pendienteStr : (esDeudor === false && pendienteActual < 0 ? pendienteStr + ' (A favor)' : '0.00 Bs (Al dia)')) +
    '</span>' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="bs-input-monto">Monto (Bs)</label>' +
    '<input type="number" id="bs-input-monto" name="monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" required />' +
    '<button type="button" id="bs-btn-sugerir" class="btn btn--ghost btn--sm" style="margin-top:4px;' + (esDeudor ? '' : 'display:none;') + '">Sugerir monto pendiente</button>' +
    '<p class="form-error" id="bs-error-monto" style="display:none;"></p>' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="bs-input-fecha">Fecha</label>' +
    '<input type="date" id="bs-input-fecha" name="fecha" class="form-input" required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="bs-input-notas">Notas (opcional)</label>' +
    '<textarea id="bs-input-notas" name="notas" class="form-input" rows="2" placeholder="Descripcion del pago..."></textarea>' +
    '</div>' +
    '</form>';
}

function abrirBottomSheetPago(trabajadorId, trabajadorNombre, cortes, pagos, filtroEstado, onPagoRegistrado) {
  var pendiente = calcularPendienteFiltrado(trabajadorId, cortes, pagos, filtroEstado);
  var htmlForm = generarFormularioPago(trabajadorId, trabajadorNombre, pendiente, filtroEstado);

  var overlay = mostrarBottomSheet("Registrar Pago", htmlForm, async function (datos) {
    var montoBs = Math.round(parseFloat(datos.monto) * 100) / 100;
    var fecha = datos.fecha;
    var notas = datos.notas || "";

    if (isNaN(montoBs) || montoBs <= 0) {
      mostrarToast("Ingresa un monto mayor a 0", "warning");
      return false;
    }

    if (!fecha) {
      mostrarToast("Selecciona una fecha", "warning");
      return false;
    }

    var montoCtv = bolivianosACentavos(montoBs);

    var pendienteRecalculado = calcularPendienteFiltrado(trabajadorId, cortes, pagos, filtroEstado);
    if (pendienteRecalculado > 0 && montoCtv > pendienteRecalculado) {
      var errorEl = document.getElementById("bs-error-monto");
      if (errorEl) {
        errorEl.textContent = "El monto excede el saldo pendiente (" + formatBs(pendienteRecalculado) + ")";
        errorEl.style.display = "block";
        document.getElementById("bs-input-monto").classList.add("form-input--error");
      }
      mostrarToast("El monto excede el saldo pendiente", "warning");
      return false;
    }

    try {
      await db.pagos.add({
        trabajadorId: parseInt(trabajadorId),
        monto: montoCtv,
        fecha: fecha,
        trabajadorNombre: trabajadorNombre,
        notas: notas,
        corteId: null,
      });

      mostrarToast("Pago registrado correctamente", "success");
      if (onPagoRegistrado) {
        await onPagoRegistrado();
      }
    } catch (err) {
      console.error("Error registrando pago:", err);
      mostrarToast("Error al registrar pago", "error");
    }
  }, "Cancelar", "Registrar");

  setTimeout(function () {
    var inputFecha = document.getElementById("bs-input-fecha");
    if (inputFecha) {
      var hoy = new Date();
      inputFecha.value = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
    }

    var btnSugerir = document.getElementById("bs-btn-sugerir");
    if (btnSugerir && pendiente > 0) {
      btnSugerir.addEventListener("click", function () {
        var inputMonto = document.getElementById("bs-input-monto");
        if (inputMonto && pendiente > 0) {
          inputMonto.value = centavosABolivianos(pendiente).toFixed(2);
        }
      });
    }

    var inputMonto = document.getElementById("bs-input-monto");
    if (inputMonto) {
      inputMonto.addEventListener("input", function () {
        var errorEl = document.getElementById("bs-error-monto");
        if (errorEl) {
          errorEl.style.display = "none";
          inputMonto.classList.remove("form-input--error");
        }
      });
    }
  }, 0);
}

export function renderTabPagos(pagos, cortes, trabajadoresMap, trabajadoresLista, container, opciones) {
  container.innerHTML = "";

  var filtroEstado = opciones.filtroEstado || "terminado";

  var html =
    '<div class="pg-resumen">' +
    '<div class="pg-resumen__filtros">' +
    '<div class="filter-chips" id="pg-resumen-filter-chips">' +
    '<button class="filter-chip' + (filtroEstado === "terminado" ? " active" : "") + '" data-filtro="terminado">Finalizados</button>' +
    '<button class="filter-chip' + (filtroEstado === "activo" ? " active" : "") + '" data-filtro="activo">Activos</button>' +
    '<button class="filter-chip' + (filtroEstado === "todos" ? " active" : "") + '" data-filtro="todos">Todos</button>' +
    '</div>' +
    '</div>' +
    '<div id="pg-resumen-kpis"></div>' +
    '<div class="pg-resumen__lista" id="pg-resumen-lista"></div>' +
    '</div>';

  container.innerHTML = html;

  var filterChips = document.getElementById("pg-resumen-filter-chips");
  filterChips.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    var nuevoFiltro = chip.dataset.filtro;
    filterChips.querySelectorAll(".filter-chip").forEach(function (c) {
      c.classList.remove("active");
    });
    chip.classList.add("active");
    opciones.filtroEstado = nuevoFiltro;
    renderListaSaldos(pagos, cortes, trabajadoresLista, trabajadoresMap, nuevoFiltro, container, opciones);
  });

  renderListaSaldos(pagos, cortes, trabajadoresLista, trabajadoresMap, filtroEstado, container, opciones);
}

function renderListaSaldos(pagos, cortes, trabajadoresLista, trabajadoresMap, filtroEstado, container, opciones) {
  var listaContainer = document.getElementById("pg-resumen-lista");
  var kpiContainer = document.getElementById("pg-resumen-kpis");
  if (!listaContainer || !kpiContainer) return;

  var saldos = calcularSaldos(trabajadoresLista, cortes, pagos, filtroEstado);

  var totalPagadoCtv = 0;
  var totalPendienteCtv = 0;
  saldos.forEach(function (s) {
    totalPagadoCtv += s.pagadoCtv;
    if (s.pendienteCtv > 0) {
      totalPendienteCtv += s.pendienteCtv;
    }
  });

  kpiContainer.innerHTML =
    '<div class="pg-kpi-grid">' +
    '<div class="pg-kpi">' +
    '<span class="pg-kpi__label">Total Pendiente</span>' +
    '<span class="pg-kpi__valor pg-kpi__valor--danger">' + formatBs(totalPendienteCtv) + '</span>' +
    '</div>' +
    '<div class="pg-kpi">' +
    '<span class="pg-kpi__label">Total Pagado</span>' +
    '<span class="pg-kpi__valor">' + formatBs(totalPagadoCtv) + '</span>' +
    '</div>' +
    '</div>';

  var saldosConActividad = saldos.filter(function (s) {
    return s.ganadoCtv > 0 || s.pagadoCtv > 0;
  });

  if (saldosConActividad.length === 0) {
    listaContainer.innerHTML = estadoVacioHTML(
      "Sin actividad",
      "No hay datos de pagos para los filtros seleccionados"
    );
    return;
  }

  saldosConActividad.sort(function (a, b) {
    return b.pendienteCtv - a.pendienteCtv;
  });

  var html = '<div class="pg-resumen__cards">';

  saldosConActividad.forEach(function (s, i) {
    var nombre = escaparHTML(s.nombre);
    var ganadoBs = formatBs(s.ganadoCtv);
    var pagadoBs = formatBs(s.pagadoCtv);
    var pendienteBs = formatBs(Math.abs(s.pendienteCtv));
    var esDeudor = s.pendienteCtv > 0;
    var esPagadoCompleto = s.pendienteCtv === 0;

    var porcentaje = s.ganadoCtv > 0 ? Math.min(100, Math.round((s.pagadoCtv / s.ganadoCtv) * 100)) : 0;

    var pendienteClase = esDeudor ? "pg-saldo-card__pendiente--deuda" : "pg-saldo-card__pendiente--ok";

    html +=
      '<div class="pg-saldo-card" style="animation-delay:' + (i * 50) + 'ms">' +
      '<div class="pg-saldo-card__header">' +
      '<span class="pg-saldo-card__nombre">' + nombre + '</span>' +
      '<span class="pg-saldo-card__pendiente ' + pendienteClase + '">' +
      (esDeudor ? "Pendiente: " + pendienteBs : (esPagadoCompleto ? "Al dia" : "A favor: " + pendienteBs)) +
      '</span>' +
      '</div>' +
      '<div class="pg-saldo-card__barra">' +
      '<div class="progress-bar">' +
      '<div class="progress-bar__fill' + (porcentaje >= 100 ? " progress-bar__fill--completo" : "") + '" style="width:' + porcentaje + '%"></div>' +
      '</div>' +
      '<span class="pg-saldo-card__porcentaje">' + porcentaje + '%</span>' +
      '</div>' +
      '<div class="pg-saldo-card__detalle">' +
      '<div class="pg-saldo-card__fila">' +
      '<span class="pg-saldo-card__label">Ganado</span>' +
      '<span class="pg-saldo-card__valor">' + ganadoBs + '</span>' +
      '</div>' +
      '<div class="pg-saldo-card__fila">' +
      '<span class="pg-saldo-card__label">Pagado</span>' +
      '<span class="pg-saldo-card__valor">' + pagadoBs + '</span>' +
      '</div>' +
      '</div>' +
      (esDeudor ? '<div class="pg-saldo-card__acciones"><button class="btn btn--primary btn--sm pg-btn-pagar-trabajador" data-trabajador-id="' + s.trabajadorId + '">Pagar</button></div>' : '') +
      '</div>';
  });

  html += '</div>';
  listaContainer.innerHTML = html;

  listaContainer.addEventListener("click", function (e) {
    var btnPagar = e.target.closest(".pg-btn-pagar-trabajador");
    if (!btnPagar) return;
    var trabajadorId = parseInt(btnPagar.dataset.trabajadorId);
    var trabajador = trabajadoresMap[trabajadorId];
    var trabajadorNombre = trabajador ? trabajador.nombre : "Desconocido";
    var filtroActual = opciones.filtroEstado || "terminado";

    abrirBottomSheetPago(trabajadorId, trabajadorNombre, cortes, pagos, filtroActual, opciones.onPagoRegistrado);
  });
}
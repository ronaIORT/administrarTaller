// ============================================================
// TAB RESUMEN - Saldos por trabajador con filtro de estado de corte
// Muestra: KPIs globales + cards por trabajador con saldo
// Permite filtrar por cortes activos, finalizados o todos.
// ============================================================

import { escaparHTML, formatBs, centavosABolivianos } from "../../utils.js";
import { estadoVacioHTML } from "../shared.js";

// ============================================================
// CALCULO DE SALDOS - Calcula ganado/pagado/pendiente por trabajador
// Para cada trabajador, recorre todos los cortes (filtrables),
// suma las asignaciones donde aparece el trabajadorId,
// y descuenta los pagos registrados.
// ============================================================

function calcularSaldos(trabajadoresLista, cortes, pagos, filtroEstado) {
  var resultado = {};

  // Inicializar todos los trabajadores con saldo 0
  trabajadoresLista.forEach(function (t) {
    resultado[t.id] = {
      trabajadorId: t.id,
      nombre: t.nombre,
      ganadoCtv: 0,
      pagadoCtv: 0,
      pendienteCtv: 0,
    };
  });

  // Filtrar cortes segun estado
  var cortesFiltrados = cortes;
  if (filtroEstado === "activo") {
    cortesFiltrados = cortes.filter(function (c) { return c.estado === "activo"; });
  } else if (filtroEstado === "terminado") {
    cortesFiltrados = cortes.filter(function (c) { return c.estado === "terminado"; });
  }

  // Sumar ganancias por asignaciones en los cortes filtrados
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

  // Sumar pagos (siempre globales, no filtrados por corte)
  pagos.forEach(function (pago) {
    var trabajadorId = pago.trabajadorId;
    if (resultado[trabajadorId]) {
      resultado[trabajadorId].pagadoCtv += pago.monto || 0;
    }
  });

  // Calcular pendiente
  Object.keys(resultado).forEach(function (id) {
    resultado[id].pendienteCtv = resultado[id].ganadoCtv - resultado[id].pagadoCtv;
  });

  // Convertir a array y ordenar por nombre
  return Object.values(resultado);
}

// ============================================================
// RENDER PRINCIPAL DEL TAB
// ============================================================

export function renderTabResumen(pagos, cortes, trabajadoresMap, trabajadoresLista, container, opciones) {
  container.innerHTML = "";

  var filtroEstado = opciones.filtroEstado || "todos";

  // Filtro de estado de corte (chips)
  var html =
    '<div class="pg-resumen">' +
    '<div class="pg-resumen__filtros">' +
    '<div class="filter-chips" id="pg-resumen-filter-chips">' +
    '<button class="filter-chip' + (filtroEstado === "todos" ? " active" : "") + '" data-filtro="todos">Todos</button>' +
    '<button class="filter-chip' + (filtroEstado === "activo" ? " active" : "") + '" data-filtro="activo">Activos</button>' +
    '<button class="filter-chip' + (filtroEstado === "terminado" ? " active" : "") + '" data-filtro="terminado">Finalizados</button>' +
    '</div>' +
    '</div>' +
    '<div id="pg-resumen-kpis"></div>' +
    '<div class="pg-resumen__lista" id="pg-resumen-lista"></div>' +
    '</div>';

  container.innerHTML = html;

  // Eventos de filtro
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
    renderListaSaldos(pagos, cortes, trabajadoresLista, nuevoFiltro, container, opciones);
  });

  renderListaSaldos(pagos, cortes, trabajadoresLista, filtroEstado, container, opciones);
}

// ============================================================
// RENDER DE LISTA DE SALDOS POR TRABAJADOR
// Incluye KPIs globales (Total Pendiente + Total Pagado)
// ============================================================

function renderListaSaldos(pagos, cortes, trabajadoresLista, filtroEstado, container, opciones) {
  var listaContainer = document.getElementById("pg-resumen-lista");
  var kpiContainer = document.getElementById("pg-resumen-kpis");
  if (!listaContainer || !kpiContainer) return;

  var saldos = calcularSaldos(trabajadoresLista, cortes, pagos, filtroEstado);

  // Calcular totales globales para KPIs
  var totalPagadoCtv = 0;
  var totalPendienteCtv = 0;
  saldos.forEach(function (s) {
    totalPagadoCtv += s.pagadoCtv;
    if (s.pendienteCtv > 0) {
      totalPendienteCtv += s.pendienteCtv;
    }
  });

  // Renderizar KPIs
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

  // Filtrar solo trabajadores con alguna actividad (ganado > 0 o pagado > 0)
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

  // Ordenar por pendiente descendente (los que mas deben primero)
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
    var esPagadoCompleto = s.pendienteCtv <= 0;

    // Barra de progreso: porcentaje pagado sobre lo ganado
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

  // Delegacion de eventos para boton Pagar
  listaContainer.addEventListener("click", function (e) {
    var btnPagar = e.target.closest(".pg-btn-pagar-trabajador");
    if (!btnPagar) return;
    var trabajadorId = parseInt(btnPagar.dataset.trabajadorId);
    if (opciones.onPagarTrabajador) {
      opciones.onPagarTrabajador(trabajadorId);
    }
  });
}
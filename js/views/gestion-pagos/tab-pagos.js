// ============================================================
// TAB PAGOS - Pagos a trabajadores
// 2 filtros (Terminados/Por terminar) + select global de corte.
// Cada pago queda asociado a un (corte, trabajador). Al elegir
// "Todos los cortes" en el select, los calculos se hacen sobre
// la union de cortes del estado filtrado por los chips.
// Modal de pago: el corte viene predefinido desde la vista.
// Validaciones:
//   - El monto a pagar no puede superar el pendiente actual.
//   - Los pagos huerfanos (sin corteId o con corteId invalido)
//     se excluyen del calculo.
//   - Cards con excedente (pagado > ganado) muestran badge y
//     siempre permanecen visibles aunque pendiente = 0.
// ============================================================

import { escaparHTML, formatBs } from "../../utils.js";
import { mostrarToast, estadoVacioHTML } from "../shared.js";
import { abrirModalPagoShared } from "../shared-pagos.js";

// ============================================================
// ESTADO LOCAL DEL TAB
// ============================================================

/** "terminado" | "activo"  (sin opcion "todos") */
let filtroActivo = "terminado";

/** null = "Todos los cortes" del filtro activo */
let corteSeleccionadoId = null;

/** Cache de datos calculados por trabajador para el filtro activo */
let datosCalculados = [];

/** Mapa corteId -> corte para lookups O(1) */
let cortesMap = {};

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabPagos(container, opciones) {
  var trabajadoresMap = opciones.trabajadoresMap;
  var cortes = opciones.cortes;
  var pagos = opciones.pagos;
  var onDataChange = opciones.onDataChange;
  var cortesMapRecibido = opciones.cortesMap || {};

  if (!opciones.preservarEstadoFiltros) {
    filtroActivo = "terminado";
    corteSeleccionadoId = null;
  }
  cortesMap = cortesMapRecibido;

  calcularDatos(trabajadoresMap, cortes, pagos);

  container.innerHTML =
    '<section class="pagos-filter-bar">' +
    '<div class="pagos-filter-chips" id="pagos-filter-chips">' +
    '<button class="filter-chip' + (filtroActivo === "terminado" ? " active" : "") + '" data-filtro="terminado">Terminados</button>' +
    '<button class="filter-chip' + (filtroActivo === "activo" ? " active" : "") + '" data-filtro="activo">Por terminar</button>' +
    "</div>" +
    '<div class="pagos-corte-select-wrap">' +
    '<label for="pagos-corte-select">Corte:</label>' +
    '<select id="pagos-corte-select" class="pagos-corte-select">' +
    "</select>" +
    "</div>" +
    "</section>" +
    '<div class="pagos-kpi-grid" id="pagos-kpi-grid">' +
    renderKPIs() +
    "</div>" +
    '<section aria-label="Lista de trabajadores" id="pagos-worker-list-container">' +
    renderWorkerList(trabajadoresMap) +
    "</section>";

  poblarSelectCortes(cortes, pagos);

  // Event listeners en chips de filtro
  var filterChips = document.getElementById("pagos-filter-chips");
  filterChips.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    filtroActivo = chip.dataset.filtro;
    filterChips.querySelectorAll(".filter-chip").forEach(function (c) {
      c.classList.remove("active");
    });
    chip.classList.add("active");
    corteSeleccionadoId = null;

    poblarSelectCortes(cortes, pagos);
    calcularDatos(trabajadoresMap, cortes, pagos);
    document.getElementById("pagos-kpi-grid").innerHTML = renderKPIs();
    document.getElementById("pagos-worker-list-container").innerHTML = renderWorkerList(trabajadoresMap);
  });

  // Event listener en select de corte
  var selectCorte = document.getElementById("pagos-corte-select");
  selectCorte.addEventListener("change", function () {
    corteSeleccionadoId = this.value ? parseInt(this.value) : null;
    calcularDatos(trabajadoresMap, cortes, pagos);
    document.getElementById("pagos-kpi-grid").innerHTML = renderKPIs();
    document.getElementById("pagos-worker-list-container").innerHTML = renderWorkerList(trabajadoresMap);
  });

  // Delegacion de clicks en botones Pagar
  document.getElementById("pagos-worker-list-container").addEventListener("click", function (e) {
    var btnPagar = e.target.closest(".btn-pagar-worker");
    if (!btnPagar) return;
    if (btnPagar.disabled) return;
    var workerId = parseInt(btnPagar.dataset.id);
    var workerNombre = btnPagar.dataset.nombre;
    var dato = null;
    datosCalculados.forEach(function (d) {
      if (d.trabajadorId === workerId) dato = d;
    });
    if (!dato || !dato.corteId) return;
    abrirModalPago(dato, workerNombre, onDataChange);
  });
}

// ============================================================
// POBLAR SELECT DE CORTES
// Muestra "nombre — pendiente Bs X.XX" en cada opcion.
// Si un corte esta pagado completo, muestra "nombre — pagado".
// Si tiene excedente, muestra "nombre — excedente Bs X.XX".
// ============================================================

function poblarSelectCortes(cortes, pagos) {
  var select = document.getElementById("pagos-corte-select");
  if (!select) return;

  var cortesDelEstado = cortes.filter(function (c) {
    return c.estado === filtroActivo;
  });

  var html = '<option value="">Todos los cortes</option>';
  cortesDelEstado.forEach(function (c) {
    var pendienteCorte = calcularPendienteCorte(c, pagos);
    if (pendienteCorte <= 0) return;
    var nombre = escaparHTML(c.nombreCorte || "Corte " + c.id);
    nombre += ' — pendiente ' + formatBs(pendienteCorte);
    html += '<option value="' + c.id + '">' + nombre + '</option>';
  });
  select.innerHTML = html;
  select.value = corteSeleccionadoId || "";
}

// Helper: pendiente (positivo=adeudo, negativo=excedente, 0=pagado) de un corte completo.
function calcularPendienteCorte(corte, pagos) {
  var earnedCtv = 0;
  (corte.tareas || []).forEach(function (t) {
    (t.asignaciones || []).forEach(function (a) {
      earnedCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
    });
  });
  var earnedBs = earnedCtv / 100;
  var paid = 0;
  (pagos || []).forEach(function (p) {
    if (p.corteId === corte.id) paid += p.monto || 0;
  });
  return earnedBs - paid;
}

// ============================================================
// CALCULO DE DATOS POR TRABAJADOR
// Aplica ambos filtros en cascada: estado (chip) + corte (select).
// Si corteSeleccionadoId es null, suma sobre todos los cortes
// del estado filtrado. Excluye pagos huerfanos.
// ============================================================

function calcularDatos(trabajadoresMap, cortes, pagos) {
  datosCalculados = [];

  // 1) Filtrar cortes por estado (chip)
  var cortesPorEstado = cortes.filter(function (c) {
    return c.estado === filtroActivo;
  });

  // 2) Filtrar por corte seleccionado (select)
  var cortesFiltrados = corteSeleccionadoId
    ? cortesPorEstado.filter(function (c) { return c.id === corteSeleccionadoId; })
    : cortesPorEstado;

  // Set de corteIds validos (para excluir huerfanos)
  var corteIdsValidos = {};
  cortesPorEstado.forEach(function (c) { corteIdsValidos[c.id] = true; });

  var workerIds = Object.keys(trabajadoresMap).map(Number);
  workerIds.forEach(function (trabajadorId) {
    // Ganado en centavos para los cortes filtrados
    var earnedCtv = 0;
    cortesFiltrados.forEach(function (corte) {
      if (!corte.tareas) return;
      corte.tareas.forEach(function (tarea) {
        if (!tarea.asignaciones) return;
        tarea.asignaciones.forEach(function (asig) {
          if (asig.trabajadorId === trabajadorId) {
            earnedCtv += (asig.cantidad || 0) * (tarea.precioUnitario || 0);
          }
        });
      });
    });
    var earnedBs = earnedCtv / 100;

    // Pagado: solo pagos cuyo corteId sea valido y pertenezca al conjunto
    var totalPaid = 0;
    pagos.forEach(function (p) {
      if (p.trabajadorId !== trabajadorId) return;
      if (!p.corteId) return;                       // legacy sin corteId
      if (!corteIdsValidos[p.corteId]) return;     // pago huerfano
      if (corteSeleccionadoId && p.corteId !== corteSeleccionadoId) return;
      totalPaid += p.monto || 0;
    });

    var excedente = totalPaid > earnedBs;
    var pending = excedente ? 0 : Math.max(0, earnedBs - totalPaid);
    var pct = earnedBs > 0 ? Math.round((totalPaid / earnedBs) * 100) : 0;

    datosCalculados.push({
      trabajadorId: trabajadorId,
      corteId: corteSeleccionadoId,
      earnedBs: earnedBs,
      totalPaid: totalPaid,
      pending: pending,
      pct: pct,
      excedente: excedente,
    });
  });

  // Filtrar: solo con actividad
  datosCalculados = datosCalculados.filter(function (d) {
    return d.earnedBs > 0 || d.totalPaid > 0;
  });
  // Mostrar siempre excedentes aunque pendiente=0; resto solo si pendiente>0
  datosCalculados = datosCalculados.filter(function (d) {
    return d.excedente || d.pending > 0;
  });

  // Ordenar por pendiente descendente
  datosCalculados.sort(function (a, b) {
    return b.pending - a.pending;
  });
}

// ============================================================
// KPIs
// ============================================================

function renderKPIs() {
  var totalPending = 0;
  var totalPaid = 0;
  var hayExcedente = false;
  datosCalculados.forEach(function (d) {
    totalPending += d.pending;
    totalPaid += d.totalPaid;
    if (d.excedente) hayExcedente = true;
  });

  return (
    '<div class="pagos-kpi-card" style="animation-delay:0ms">' +
    '<span class="pagos-kpi-card__label">Pendiente</span>' +
    '<span class="pagos-kpi-card__value pagos-kpi-card__value--primary">' +
    formatBs(totalPending) +
    "</span>" +
    "</div>" +
    '<div class="pagos-kpi-card" style="animation-delay:50ms">' +
    '<span class="pagos-kpi-card__label">Pagado' + (hayExcedente ? ' (con excedente)' : '') + "</span>" +
    '<span class="pagos-kpi-card__value ' + (hayExcedente ? 'pagos-kpi-card__value--excedente' : 'pagos-kpi-card__value--success') + '">' +
    formatBs(totalPaid) +
    "</span>" +
    "</div>"
  );
}

// ============================================================
// LISTA DE TRABAJADORES
// ============================================================

function renderWorkerList(trabajadoresMap) {
  if (datosCalculados.length === 0) {
    var msj = "Sin resultados";
    var sub = "No hay trabajadores con actividad en este filtro";
    if (corteSeleccionadoId) {
      sub = "Este corte no tiene pagos ni ganancias registradas";
    }
    return estadoVacioHTML(msj, sub);
  }

  return (
    '<div class="pagos-worker-list" role="list">' +
    datosCalculados.map(function (d, i) {
      var nombre = escaparHTML(trabajadoresMap[d.trabajadorId] || "Trabajador " + d.trabajadorId);
      var esCompleto = d.pct >= 100 && !d.excedente;
      var sinCorte = !d.corteId;
      var tituloBoton = sinCorte
        ? ' title="Selecciona un corte especifico para pagar"'
        : "";

      var headerExtra = d.excedente
        ? '<span class="badge badge--excedente" title="El total pagado supera lo ganado en este filtro">Excedente</span>'
        : "";

      var pctVisual = d.pct > 100 ? 100 : d.pct;
      var progressClase = esCompleto
        ? " pagos-worker-card__progress-fill--complete"
        : (d.excedente ? " pagos-worker-card__progress-fill--excedente" : "");

      var statPagadoClase = d.excedente
        ? "pagos-worker-card__stat-value--excedente"
        : "pagos-worker-card__stat-value--paid";

      return (
        '<div class="pagos-worker-card' + (d.excedente ? ' pagos-worker-card--excedente' : '') + '" role="listitem" style="animation-delay:' + (i * 50) + 'ms">' +
        '<div class="pagos-worker-card__header">' +
        '<span class="pagos-worker-card__name">' + nombre + "</span>" +
        headerExtra +
        "</div>" +
        '<div class="pagos-worker-card__stats">' +
        '<div class="pagos-worker-card__stat">' +
        '<span class="pagos-worker-card__stat-label">Pendiente</span>' +
        '<span class="pagos-worker-card__stat-value pagos-worker-card__stat-value--pending">' +
        formatBs(d.pending) +
        "</span>" +
        "</div>" +
        '<div class="pagos-worker-card__stat">' +
        '<span class="pagos-worker-card__stat-label">Pagado</span>' +
        '<span class="pagos-worker-card__stat-value ' + statPagadoClase + '">' +
        formatBs(d.totalPaid) +
        "</span>" +
        "</div>" +
        "</div>" +
        '<div class="pagos-worker-card__progress-wrap">' +
        '<div class="pagos-worker-card__progress">' +
        '<div class="pagos-worker-card__progress-fill' + progressClase +
        '" style="width:' + pctVisual + '%"></div>' +
        "</div>" +
        '<span class="pagos-worker-card__progress-pct">' + d.pct + "%</span>" +
        "</div>" +
        '<div class="pagos-worker-card__actions">' +
        '<button class="btn btn--primary btn--sm btn-pagar-worker" ' +
        'data-id="' + d.trabajadorId + '" ' +
        'data-nombre="' + nombre + '"' +
        (sinCorte ? " disabled" : "") +
        tituloBoton +
        ">" +
        "Pagar" +
        "</button>" +
        "</div>" +
        "</div>"
      );
    }).join("") +
    "</div>"
  );
}

// ============================================================
// MODAL DE PAGO - El corte viene predefinido desde la card.
// Valida que el monto no supere el pendiente actual (recalcula
// desde la BD para evitar race conditions con otras pestañas).
// ============================================================

function abrirModalPago(dato, workerNombre, onDataChange) {
  var corte = cortesMap[dato.corteId];
  var nombreCorte = corte ? (corte.nombreCorte || "Corte " + corte.id) : "Corte";

  abrirModalPagoShared({
    corteId: dato.corteId,
    corteNombre: nombreCorte,
    trabajadorId: dato.trabajadorId,
    trabajadorNombre: workerNombre,
    pending: dato.pending,
    onDataChange: onDataChange,
  });
}

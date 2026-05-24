// ============================================================
// DASHBOARD — KPIs, charts y resúmenes con período global
// Período sticky afecta: KPIs financieros, charts 1/2/3/5,
// caja, cortes recientes y últimos pagos.
// No afecta: Cortes Activos, Pendiente, Progreso.
// Charts: (1) Ingresos/Costos Bar+Line, (2) Rentabilidad HBar,
//         (3) Margen Line, (4) Distribución Costos Doughnut,
//         (5) Top 3 HBar
// ============================================================

import { db } from "../db.js";
import { APP_VERSION } from "../version.js";
import { formatBs, centavosABolivianos, escaparHTML } from "../utils.js";
import { estadoVacioHTML } from "./shared.js";

let abortController = null;
let chartInstances = {};
let datosDashboard = null;
let periodoActual = "mes";

const MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const PERIODOS = [
  { id: "mes", label: "Este mes" },
  { id: "3meses", label: "3 meses" },
  { id: "6meses", label: "6 meses" },
  { id: "anio", label: "Este año" },
  { id: "todo", label: "Todo" }
];

const CHART_IDS = ["chart-ingresos-costos", "chart-rentabilidad", "chart-margen", "chart-dist-costos", "chart-top-cortes"];

// ============================================================
// PERÍODO HELPERS
// ============================================================

function obtenerPeriodo(id) {
  var hoy = new Date();
  var y = hoy.getFullYear();
  var m = hoy.getMonth() + 1;
  switch (id) {
    case "mes":
      return { yearStart: y, monthStart: m, yearEnd: y, monthEnd: m };
    case "3meses": {
      var d = new Date(y, m - 3, 1);
      return { yearStart: d.getFullYear(), monthStart: d.getMonth() + 1, yearEnd: y, monthEnd: m };
    }
    case "6meses": {
      var d = new Date(y, m - 6, 1);
      return { yearStart: d.getFullYear(), monthStart: d.getMonth() + 1, yearEnd: y, monthEnd: m };
    }
    case "anio":
      return { yearStart: y, monthStart: 1, yearEnd: y, monthEnd: m };
    case "todo":
    default:
      return { yearStart: null, monthStart: null, yearEnd: null, monthEnd: null };
  }
}

function estaEnPeriodo(fechaISO, periodo) {
  if (!fechaISO) return false;
  if (periodo.yearStart === null) return true;
  var d = new Date(fechaISO);
  var y = d.getFullYear();
  var mon = d.getMonth() + 1;
  if (y < periodo.yearStart || (y === periodo.yearStart && mon < periodo.monthStart)) return false;
  if (y > periodo.yearEnd || (y === periodo.yearEnd && mon > periodo.monthEnd)) return false;
  return true;
}

function obtenerMesesEnPeriodo(periodo) {
  if (periodo.yearStart === null) {
    return obtenerUltimosMeses(12);
  }
  var meses = [];
  var y = periodo.yearStart;
  var m = periodo.monthStart;
  var endY = periodo.yearEnd;
  var endM = periodo.monthEnd;
  var hoy = new Date();
  while (y < endY || (y === endY && m <= endM)) {
    var label = MESES_ES[m - 1];
    if (y !== hoy.getFullYear()) {
      label += " '" + String(y).slice(-2);
    }
    meses.push({ year: y, month: m, label: label });
    m++;
    if (m > 12) { m = 1; y++; }
    if (meses.length > 36) break;
  }
  return meses;
}

function obtenerUltimosMeses(n) {
  var meses = [];
  var ahora = new Date();
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    var label = MESES_ES[d.getMonth()];
    if (d.getFullYear() !== ahora.getFullYear()) {
      label += " '" + String(d.getFullYear()).slice(-2);
    }
    meses.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: label });
  }
  return meses;
}

// ============================================================
// CÁLCULOS FINANCIEROS
// ============================================================

function calcularIngresosPeriodo(cortes, periodo) {
  return cortes.reduce(function (sum, c) {
    if (c.estado !== "terminado" || !c.fechaFinalizacion) return sum;
    if (!estaEnPeriodo(c.fechaFinalizacion, periodo)) return sum;
    var cantidad = (c.tallas || []).reduce(function (s, t) { return s + t.cantidad; }, 0);
    return sum + cantidad * (c.precioVentaUnitario || 0);
  }, 0);
}

function calcularIngresosMesCorte(cortes, year, month) {
  return cortes.reduce(function (sum, c) {
    if (c.estado !== "terminado" || !c.fechaFinalizacion) return sum;
    var d = new Date(c.fechaFinalizacion);
    if (d.getFullYear() !== year || (d.getMonth() + 1) !== month) return sum;
    var cantidad = (c.tallas || []).reduce(function (s, t) { return s + t.cantidad; }, 0);
    return sum + cantidad * (c.precioVentaUnitario || 0);
  }, 0);
}

function calcularPagosRealesPeriodo(pagos, periodo) {
  var centavos = pagos.reduce(function (sum, p) {
    if (!p.fecha) return sum;
    if (!estaEnPeriodo(p.fecha, periodo)) return sum;
    return sum + (p.monto || 0);
  }, 0);
  return centavosABolivianos(centavos);
}

function calcularPagosRealesMes(pagos, year, month) {
  var centavos = pagos.reduce(function (sum, p) {
    if (!p.fecha) return sum;
    var d = new Date(p.fecha);
    if (d.getFullYear() !== year || (d.getMonth() + 1) !== month) return sum;
    return sum + (p.monto || 0);
  }, 0);
  return centavosABolivianos(centavos);
}

function calcularManoObraEstimadaPorPrenda(cortes, prendaId) {
  var centavos = 0;
  cortes.forEach(function (c) {
    if (c.estado !== "terminado" || c.prendaId !== prendaId) return;
    (c.tareas || []).forEach(function (t) {
      (t.asignaciones || []).forEach(function (a) {
        centavos += (a.cantidad || 0) * (t.precioUnitario || 0);
      });
    });
  });
  return centavosABolivianos(centavos);
}

function calcularPendienteTotal(cortes, pagos, trabajadores) {
  var ganado = {};
  var pagado = {};
  trabajadores.forEach(function (t) { ganado[t.id] = 0; pagado[t.id] = 0; });
  cortes.forEach(function (c) {
    (c.tareas || []).forEach(function (tarea) {
      (tarea.asignaciones || []).forEach(function (a) {
        if (ganado[a.trabajadorId] !== undefined) {
          ganado[a.trabajadorId] += (a.cantidad || 0) * (tarea.precioUnitario || 0);
        }
      });
    });
  });
  pagos.forEach(function (p) {
    if (pagado[p.trabajadorId] !== undefined) {
      pagado[p.trabajadorId] += (p.monto || 0);
    }
  });
  var pendiente = 0;
  Object.keys(ganado).forEach(function (id) {
    var diff = ganado[id] - (pagado[id] || 0);
    if (diff > 0) pendiente += diff;
  });
  return pendiente;
}

function calcularCortesFinalizadosPeriodo(cortes, periodo) {
  return cortes.filter(function (c) {
    return c.estado === "terminado" && c.fechaFinalizacion && estaEnPeriodo(c.fechaFinalizacion, periodo);
  }).length;
}

function calcularPagosTotalesPeriodoCentavos(pagos, periodo) {
  return pagos.reduce(function (sum, p) {
    if (!p.fecha || !estaEnPeriodo(p.fecha, periodo)) return sum;
    return sum + (p.monto || 0);
  }, 0);
}

function calcularMargen(ingresos, costos) {
  if (!ingresos || ingresos === 0) return null;
  return ((ingresos - costos) / ingresos) * 100;
}

function calcularTopCortes(cortes, prendasMap, periodo, n) {
  var finalizados = cortes.filter(function (c) {
    return c.estado === "terminado" && c.fechaFinalizacion && estaEnPeriodo(c.fechaFinalizacion, periodo);
  });
  var resultados = finalizados.map(function (c) {
    var cantidad = (c.tallas || []).reduce(function (s, t) { return s + t.cantidad; }, 0);
    var ingresos = cantidad * (c.precioVentaUnitario || 0);
    var costoCtv = 0;
    (c.tareas || []).forEach(function (t) {
      (t.asignaciones || []).forEach(function (a) {
        costoCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
      });
    });
    var costos = costoCtv / 100;
    var prenda = prendasMap.get(c.prendaId);
    return {
      id: c.id,
      nombre: c.nombreCorte || ("Corte #" + c.id),
      prendaNombre: prenda ? prenda.nombre : "",
      ingresos: ingresos,
      costos: costos,
      ganancia: ingresos - costos
    };
  });
  resultados.sort(function (a, b) { return b.ganancia - a.ganancia; });
  return resultados.slice(0, n);
}

function calcularProgresoCorte(corte) {
  if (!corte.tareas || corte.tareas.length === 0) return 0;
  var totalAsignadas = 0;
  var totalPosible = 0;
  corte.tareas.forEach(function (tarea) {
    totalPosible += (tarea.unidadesTotales || 0);
    if (tarea.asignaciones) {
      totalAsignadas += tarea.asignaciones.reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
    }
  });
  if (totalPosible === 0) return 0;
  return Math.min(100, Math.round((totalAsignadas / totalPosible) * 100));
}

function diasDesde(fechaISO) {
  if (!fechaISO) return 0;
  var diff = Date.now() - new Date(fechaISO).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ============================================================
// KPI AGGREGATOR
// ============================================================

function calcularKPIs(datos, periodo) {
  var ingresos = calcularIngresosPeriodo(datos.cortes, periodo);
  var costos = calcularPagosRealesPeriodo(datos.pagos, periodo);
  return {
    cortesActivos: datos.cortes.filter(function (c) { return c.estado === "activo"; }).length,
    ingresosMes: ingresos,
    costosMes: costos,
    gananciaMes: ingresos - costos,
    margen: calcularMargen(ingresos, costos),
    pendiente: calcularPendienteTotal(datos.cortes, datos.pagos, datos.trabajadores),
    finalizados: calcularCortesFinalizadosPeriodo(datos.cortes, periodo),
    totalPagado: calcularPagosTotalesPeriodoCentavos(datos.pagos, periodo)
  };
}

// ============================================================
// FORMAT HELPERS
// ============================================================

function formatBsValor(valor) {
  if (typeof valor !== "number" || isNaN(valor)) return "Bs 0.00";
  var abs = Math.abs(valor);
  var formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (valor < 0 ? "-" : "") + "Bs " + formatted;
}

function formatMargen(margen) {
  if (margen === null || margen === undefined) return "--";
  return margen.toFixed(1) + "%";
}

function formatFechaCorta(fechaISO) {
  if (!fechaISO) return "";
  var d = new Date(fechaISO);
  return d.getDate() + " " + MESES_ES[d.getMonth()] + " " + d.getFullYear();
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export async function renderDashboard() {
  var app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  if (abortController) { abortController.abort(); }
  abortController = new AbortController();
  destruirCharts();

  datosDashboard = await cargarDatos();

  var container = document.createElement("div");
  container.className = "app-container app-container--no-header dashboard-v2";
  container.innerHTML = buildDashboardHTML(datosDashboard);
  app.appendChild(container);

  container.addEventListener("click", handleClick, { signal: abortController.signal });

  var periodo = obtenerPeriodo(periodoActual);
  renderAllCharts(datosDashboard, periodo);
}

function cargarDatos() {
  return Promise.all([
    db.cortes.toArray(),
    db.pagos.toArray(),
    db.prendas.toArray(),
    db.trabajadores.toArray()
  ]).then(function (r) {
    return { cortes: r[0], pagos: r[1], prendas: r[2], trabajadores: r[3] };
  });
}

function destruirCharts() {
  CHART_IDS.forEach(function (id) {
    if (chartInstances[id]) {
      chartInstances[id].destroy();
      chartInstances[id] = null;
    }
  });
}

// ============================================================
// BUILD HTML
// ============================================================

function buildDashboardHTML(datos) {
  var periodo = obtenerPeriodo(periodoActual);
  var kpis = calcularKPIs(datos, periodo);
  var prendasMap = new Map(datos.prendas.map(function (p) { return [p.id, p]; }));
  var trabajadoresMap = new Map(datos.trabajadores.map(function (t) { return [t.id, t]; }));

  return buildPeriodSelectorHTML() +
    buildKPIsHTML(kpis) +
    buildChartsHTML() +
    buildCashSummaryHTML(kpis) +
    buildProgresoHTML(datos.cortes) +
    buildCortesRecientesHTML(datos.cortes, prendasMap, periodo) +
    buildPagosRecientesHTML(datos.pagos, datos.cortes, trabajadoresMap, periodo) +
    '<div class="app-version">v' + APP_VERSION + '</div>';
}

function buildPeriodSelectorHTML() {
  var html = '<div class="dash-period-bar"><div class="dash-period-chips">';
  PERIODOS.forEach(function (p) {
    var active = p.id === periodoActual ? " active" : "";
    html += '<button class="filter-chip' + active + '" data-periodo="' + p.id + '" type="button">' + escaparHTML(p.label) + '</button>';
  });
  html += '</div></div>';
  return html;
}

// ============================================================
// KPI CARDS (8 tarjetas, 2 filas x 4 columnas)
// ============================================================

function buildKPIsHTML(kpis) {
  var gananciaCls = kpis.gananciaMes >= 0 ? "kpi-card--positive" : "kpi-card--negative";

  return '<div class="dash-kpis" id="dash-kpis">' +

    // Fila 1 - Financiera
    '<div class="kpi-card kpi-card--ingresos">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Ingresos</span>' +
        '<span class="kpi-card__value">' + formatBsValor(kpis.ingresosMes) + '</span>' +
      '</div>' +
    '</div>' +

    '<div class="kpi-card kpi-card--costos">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Costos</span>' +
        '<span class="kpi-card__value">' + formatBsValor(kpis.costosMes) + '</span>' +
      '</div>' +
    '</div>' +

    '<div class="kpi-card ' + gananciaCls + '">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Ganancia Neta</span>' +
        '<span class="kpi-card__value">' + formatBsValor(kpis.gananciaMes) + '</span>' +
      '</div>' +
    '</div>' +

    '<div class="kpi-card">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Margen</span>' +
        '<span class="kpi-card__value">' + formatMargen(kpis.margen) + '</span>' +
      '</div>' +
    '</div>' +

    // Fila 2 - Operativa
    '<div class="kpi-card">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2"/><line x1="12" y1="22" x2="12" y2="15.5"/><polyline points="22 8.5 12 15.5 2 8.5"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Cortes Activos</span>' +
        '<span class="kpi-card__value">' + kpis.cortesActivos + '</span>' +
      '</div>' +
    '</div>' +

    '<div class="kpi-card kpi-card--warning">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Pendiente de Pago</span>' +
        '<span class="kpi-card__value">' + formatBs(kpis.pendiente) + '</span>' +
      '</div>' +
    '</div>' +

    '<div class="kpi-card">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Finalizados</span>' +
        '<span class="kpi-card__value">' + kpis.finalizados + '</span>' +
      '</div>' +
    '</div>' +

    '<div class="kpi-card">' +
      '<div class="kpi-card__icon">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>' +
      '</div>' +
      '<div class="kpi-card__body">' +
        '<span class="kpi-card__label">Total Pagado</span>' +
        '<span class="kpi-card__value">' + formatBs(kpis.totalPagado) + '</span>' +
      '</div>' +
    '</div>' +

  '</div>';
}

// ============================================================
// CHARTS HTML
// ============================================================

function buildChartsHTML() {
  return '<div class="dash-charts">' +

    // Chart 1 - Full width
    '<div class="dash-section">' +
      '<div class="dash-section__header">' +
        '<h2 class="dash-section__title">Ingresos vs Costos</h2>' +
      '</div>' +
      '<div class="card chart-card">' +
        '<div class="chart-container chart-container--tall">' +
          '<canvas id="chart-ingresos-costos"></canvas>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Charts 2+3 side by side
    '<div class="dash-charts-row">' +
      '<div class="dash-section">' +
        '<div class="dash-section__header">' +
          '<h2 class="dash-section__title">Rentabilidad por Prenda</h2>' +
        '</div>' +
        '<div class="card chart-card">' +
          '<div class="chart-container chart-container--square">' +
            '<canvas id="chart-rentabilidad"></canvas>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dash-section">' +
        '<div class="dash-section__header">' +
          '<h2 class="dash-section__title">Tendencia de Margen</h2>' +
        '</div>' +
        '<div class="card chart-card">' +
          '<div class="chart-container chart-container--square">' +
            '<canvas id="chart-margen"></canvas>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Charts 4+5 side by side
    '<div class="dash-charts-row">' +
      '<div class="dash-section">' +
        '<div class="dash-section__header">' +
          '<h2 class="dash-section__title">Distribución de Costos</h2>' +
        '</div>' +
        '<div class="card chart-card">' +
          '<div class="chart-container chart-container--square">' +
            '<canvas id="chart-dist-costos"></canvas>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dash-section">' +
        '<div class="dash-section__header">' +
          '<h2 class="dash-section__title">Top 3 Cortes — Mayor Margen</h2>' +
        '</div>' +
        '<div class="card chart-card">' +
          '<div class="chart-container chart-container--square">' +
            '<canvas id="chart-top-cortes"></canvas>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

  '</div>';
}

// ============================================================
// CASH SUMMARY
// ============================================================

function buildCashSummaryHTML(kpis) {
  var balance = kpis.ingresosMes - kpis.costosMes;
  var balanceCls = balance >= 0 ? "cash-summary__balance--positive" : "cash-summary__balance--negative";

  return '<div class="dash-section" id="dash-cash-summary">' +
    '<div class="dash-section__header">' +
      '<h2 class="dash-section__title">Resumen de Caja</h2>' +
    '</div>' +
    '<div class="cash-summary">' +
      '<div class="cash-summary__item cash-summary__item--in">' +
        '<span class="cash-summary__label">Recibido</span>' +
        '<span class="cash-summary__value">' + formatBsValor(kpis.ingresosMes) + '</span>' +
      '</div>' +
      '<div class="cash-summary__divider"></div>' +
      '<div class="cash-summary__item cash-summary__item--out">' +
        '<span class="cash-summary__label">Pagado</span>' +
        '<span class="cash-summary__value">' + formatBsValor(kpis.costosMes) + '</span>' +
      '</div>' +
      '<div class="cash-summary__divider"></div>' +
      '<div class="cash-summary__item cash-summary__item--balance">' +
        '<span class="cash-summary__label">Balance</span>' +
        '<span class="cash-summary__value ' + balanceCls + '">' + formatBsValor(balance) + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ============================================================
// PROGRESO DE PRODUCCIÓN
// ============================================================

function buildProgresoHTML(cortes) {
  var activos = cortes.filter(function (c) { return c.estado === "activo"; });
  if (activos.length === 0) {
    return '<div class="dash-section" id="dash-progreso">' +
      '<div class="dash-section__header">' +
        '<h2 class="dash-section__title">Progreso de Producción</h2>' +
      '</div>' +
      '<div class="card">' + estadoVacioHTML("No hay cortes activos", "Crea un nuevo corte para comenzar") + '</div>' +
    '</div>';
  }

  var html = '<div class="dash-section" id="dash-progreso">' +
    '<div class="dash-section__header">' +
      '<h2 class="dash-section__title">Progreso de Producción</h2>' +
    '</div>' +
    '<div class="card">';

  activos.forEach(function (corte) {
    var pct = calcularProgresoCorte(corte);
    var completoCls = pct >= 100 ? "progress-bar__fill--completo" : "";
    var dias = diasDesde(corte.fechaCreacion);
    var diasText = dias === 0 ? "Hoy" : (dias === 1 ? "1 día" : dias + " días");

    html += '<div class="dash-progress-item" data-corte-id="' + corte.id + '">' +
      '<div class="dash-progress-header">' +
        '<span class="dash-progress-name">' + escaparHTML(corte.nombreCorte || ("Corte #" + corte.id)) + '</span>' +
        '<span class="dash-progress-meta">' + diasText + '</span>' +
        '<span class="dash-progress-pct">' + pct + '%</span>' +
      '</div>' +
      '<div class="progress-bar">' +
        '<div class="progress-bar__fill ' + completoCls + '" style="width:' + pct + '%"></div>' +
      '</div>' +
    '</div>';
  });

  html += '</div></div>';
  return html;
}

// ============================================================
// CORTES RECIENTES (creados O finalizados en el período)
// ============================================================

function buildCortesRecientesHTML(cortes, prendasMap, periodo) {
  var enPeriodo = cortes.filter(function (c) {
    return estaEnPeriodo(c.fechaCreacion, periodo) ||
      (c.estado === "terminado" && estaEnPeriodo(c.fechaFinalizacion, periodo));
  });

  var recientes = enPeriodo
    .slice()
    .sort(function (a, b) { return new Date(b.fechaCreacion) - new Date(a.fechaCreacion); })
    .slice(0, 5);

  if (recientes.length === 0) {
    return '<div class="dash-section" id="dash-cortes-recientes">' +
      '<div class="dash-section__header">' +
        '<h2 class="dash-section__title">Cortes Recientes</h2>' +
        '<a class="dash-section__link" data-nav="#gestion-cortes">Ver todos →</a>' +
      '</div>' +
      '<div class="card">' + estadoVacioHTML("Sin cortes en este período") + '</div>' +
    '</div>';
  }

  var html = '<div class="dash-section" id="dash-cortes-recientes">' +
    '<div class="dash-section__header">' +
      '<h2 class="dash-section__title">Cortes Recientes</h2>' +
      '<a class="dash-section__link" data-nav="#gestion-cortes">Ver todos →</a>' +
    '</div>';

  recientes.forEach(function (c) {
    var prenda = prendasMap.get(c.prendaId);
    var nombrePrenda = prenda ? prenda.nombre : "Prenda eliminada";
    var badgeCls = c.estado === "activo" ? "badge--success" : "badge--info";
    var badgeText = c.estado === "activo" ? "Activo" : "Terminado";
    var fecha = formatFechaCorta(c.fechaCreacion);

    html += '<div class="dash-list-item" data-corte-id="' + c.id + '">' +
      '<div class="dash-list-item__info">' +
        '<span class="dash-list-item__name">' + escaparHTML(c.nombreCorte || ("Corte #" + c.id)) + '</span>' +
        '<span class="dash-list-item__detail">' + escaparHTML(nombrePrenda) + '</span>' +
      '</div>' +
      '<div class="dash-list-item__meta">' +
        '<span class="badge ' + badgeCls + '">' + badgeText + '</span>' +
        '<span class="dash-list-item__fecha">' + fecha + '</span>' +
      '</div>' +
    '</div>';
  });

  html += '</div>';
  return html;
}

// ============================================================
// ÚLTIMOS PAGOS
// ============================================================

function buildPagosRecientesHTML(pagos, cortes, trabajadoresMap, periodo) {
  var cortesMap = new Map(cortes.map(function (c) { return [c.id, c]; }));
  var enPeriodo = pagos.filter(function (p) {
    return estaEnPeriodo(p.fecha, periodo);
  });

  var recientes = enPeriodo
    .slice()
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); })
    .slice(0, 5);

  if (recientes.length === 0) {
    return '<div class="dash-section" id="dash-pagos-recientes">' +
      '<div class="dash-section__header">' +
        '<h2 class="dash-section__title">Últimos Pagos</h2>' +
        '<a class="dash-section__link" data-nav="#historial-pagos">Ver todos →</a>' +
      '</div>' +
      '<div class="card">' + estadoVacioHTML("Sin pagos en este período", "Registra tu primer pago") + '</div>' +
    '</div>';
  }

  var html = '<div class="dash-section" id="dash-pagos-recientes">' +
    '<div class="dash-section__header">' +
      '<h2 class="dash-section__title">Últimos Pagos</h2>' +
      '<a class="dash-section__link" data-nav="#historial-pagos">Ver todos →</a>' +
    '</div>';

  recientes.forEach(function (p) {
    var trabajador = trabajadoresMap.get(p.trabajadorId);
    var corte = cortesMap.get(p.corteId);
    var nombreTrabajador = trabajador ? trabajador.nombre : "Trabajador eliminado";
    var nombreCorte = corte ? (corte.nombreCorte || ("Corte #" + corte.id)) : "";
    var fecha = formatFechaCorta(p.fecha);

    html += '<div class="dash-list-item" data-nav="#historial-pagos">' +
      '<div class="dash-list-item__info">' +
        '<span class="dash-list-item__name">' + escaparHTML(nombreTrabajador) + '</span>' +
        (nombreCorte ? '<span class="dash-list-item__detail">' + escaparHTML(nombreCorte) + '</span>' : '') +
      '</div>' +
      '<div class="dash-list-item__meta">' +
        '<span class="dash-list-item__monto">' + formatBs(p.monto) + '</span>' +
        '<span class="dash-list-item__fecha">' + fecha + '</span>' +
      '</div>' +
    '</div>';
  });

  html += '</div>';
  return html;
}

// ============================================================
// RENDER ALL CHARTS
// ============================================================

function renderAllCharts(datos, periodo) {
  renderChartIngresosCostos(datos, periodo);
  renderChartRentabilidad(datos, periodo);
  renderChartMargen(datos, periodo);
  renderChartDistCostos(datos, periodo);
  renderChartTopCortes(datos, periodo);
}

// ============================================================
// CHART 1: INGRESOS VS COSTOS (Bar + Line)
// ============================================================

function renderChartIngresosCostos(datos, periodo) {
  var canvas = document.getElementById("chart-ingresos-costos");
  if (!canvas) return;
  var Chart = window.Chart;
  if (!Chart) return;

  var meses = obtenerMesesEnPeriodo(periodo);
  var labels = meses.map(function (m) { return m.label; });
  var ingresosData = [];
  var costosData = [];
  var gananciaData = [];

  meses.forEach(function (m) {
    var ing = calcularIngresosMesCorte(datos.cortes, m.year, m.month);
    var gast = calcularPagosRealesMes(datos.pagos, m.year, m.month);
    ingresosData.push(ing);
    costosData.push(gast);
    gananciaData.push(ing - gast);
  });

  var ctx = canvas.getContext("2d");
  chartInstances["chart-ingresos-costos"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Ingresos",
          data: ingresosData,
          backgroundColor: "#09af4d",
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
          order: 2
        },
        {
          label: "Costos",
          data: costosData,
          backgroundColor: "#ef5350",
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
          order: 3
        },
        {
          label: "Ganancia",
          data: gananciaData,
          type: "line",
          borderColor: "#d4e5f7",
          backgroundColor: "rgba(212, 229, 247, 0.08)",
          borderWidth: 2,
          pointBackgroundColor: "#d4e5f7",
          pointBorderColor: "#d4e5f7",
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: false,
          order: 1
        }
      ]
    },
    options: getBarLineOptions()
  });
}

// ============================================================
// CHART 2: RENTABILIDAD POR PRENDA (Bar Horizontal)
// ============================================================

function renderChartRentabilidad(datos, periodo) {
  var canvas = document.getElementById("chart-rentabilidad");
  if (!canvas) return;
  var Chart = window.Chart;
  if (!Chart) return;

  var labels = [];
  var ingresosData = [];
  var costosData = [];
  var gananciaData = [];

  datos.prendas.forEach(function (prenda) {
    var cortesDePrenda = datos.cortes.filter(function (c) {
      return c.prendaId === prenda.id && c.estado === "terminado" && estaEnPeriodo(c.fechaFinalizacion, periodo);
    });
    var ing = 0;
    cortesDePrenda.forEach(function (c) {
      var cantidad = (c.tallas || []).reduce(function (s, t) { return s + t.cantidad; }, 0);
      ing += cantidad * (c.precioVentaUnitario || 0);
    });
    var gast = calcularManoObraEstimadaPorPrenda(cortesDePrenda, prenda.id);

    labels.push(prenda.nombre);
    ingresosData.push(ing);
    costosData.push(gast);
    gananciaData.push(ing - gast);
  });

  if (labels.length === 0) {
    chartInstances["chart-rentabilidad"] = null;
    return;
  }

  var ctx = canvas.getContext("2d");
  chartInstances["chart-rentabilidad"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Ingresos",
          data: ingresosData,
          backgroundColor: "#09af4d",
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: "Costos",
          data: costosData,
          backgroundColor: "#ef5350",
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: "Ganancia",
          data: gananciaData,
          backgroundColor: "#42a5f5",
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }
      ]
    },
    options: Object.assign({}, getBarLineOptions(), {
      indexAxis: "y",
      scales: {
        x: {
          grid: { color: "rgba(30, 58, 95, 0.5)", drawBorder: false },
          ticks: {
            color: "#5a7fa0",
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: function (value) { return "Bs " + value; }
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 11 }
          }
        }
      }
    })
  });
}

// ============================================================
// CHART 3: TENDENCIA DE MARGEN % (Line)
// ============================================================

function renderChartMargen(datos, periodo) {
  var canvas = document.getElementById("chart-margen");
  if (!canvas) return;
  var Chart = window.Chart;
  if (!Chart) return;

  var meses = obtenerMesesEnPeriodo(periodo);
  var labels = meses.map(function (m) { return m.label; });
  var margenData = [];

  meses.forEach(function (m) {
    var ing = calcularIngresosMesCorte(datos.cortes, m.year, m.month);
    var gast = calcularPagosRealesMes(datos.pagos, m.year, m.month);
    var mrg = ing > 0 ? ((ing - gast) / ing) * 100 : null;
    margenData.push(mrg);
  });

  var ctx = canvas.getContext("2d");
  chartInstances["chart-margen"] = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Margen %",
        data: margenData,
        borderColor: "#42a5f5",
        backgroundColor: "rgba(66, 165, 245, 0.12)",
        borderWidth: 2.5,
        pointBackgroundColor: "#42a5f5",
        pointBorderColor: "#0f2744",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        fill: true,
        spanGaps: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 39, 68, 0.95)",
          titleColor: "#d4e5f7",
          bodyColor: "#d4e5f7",
          borderColor: "#1e3a5f",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: function (context) {
              var val = context.parsed.y;
              if (val === null || val === undefined) return "Sin datos";
              return "Margen: " + val.toFixed(1) + "%";
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#8fb8d8", font: { family: "'Inter', sans-serif", size: 12 } }
        },
        y: {
          grid: { color: "rgba(30, 58, 95, 0.5)", drawBorder: false },
          ticks: {
            color: "#5a7fa0",
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: function (value) { return value.toFixed(0) + "%"; }
          }
        }
      }
    }
  });
}

// ============================================================
// CHART 4: PIPELINE DE PRODUCCIÓN (Doughnut)
// ============================================================

function renderChartDistCostos(datos, periodo) {
  var canvas = document.getElementById("chart-dist-costos");
  if (!canvas) return;
  var Chart = window.Chart;
  if (!Chart) return;

  var labels = [];
  var costosData = [];
  var totalCostos = 0;

  datos.prendas.forEach(function (prenda) {
    var costoCtv = 0;
    datos.cortes.forEach(function (c) {
      if (c.prendaId !== prenda.id) return;
      if (c.estado !== "terminado" || !c.fechaFinalizacion) return;
      if (!estaEnPeriodo(c.fechaFinalizacion, periodo)) return;
      (c.tareas || []).forEach(function (t) {
        (t.asignaciones || []).forEach(function (a) {
          costoCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
        });
      });
    });
    if (costoCtv > 0) {
      labels.push(prenda.nombre);
      costosData.push(costoCtv);
      totalCostos += costoCtv;
    }
  });

  if (labels.length === 0) {
    chartInstances["chart-dist-costos"] = null;
    return;
  }

  var doughnutColors = ["#ef5350", "#ffb74d", "#ab47bc", "#42a5f5", "#26c6da", "#7e57c2", "#66bb6a", "#ff7043"];

  var ctx = canvas.getContext("2d");
  chartInstances["chart-dist-costos"] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: costosData,
        backgroundColor: doughnutColors.slice(0, labels.length),
        borderColor: "#0f2744",
        borderWidth: 2,
        hoverBorderColor: "#1e3a5f"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 11 },
            usePointStyle: true,
            padding: 16,
            pointStyleWidth: 10
          }
        },
        tooltip: {
          backgroundColor: "rgba(15, 39, 68, 0.95)",
          titleColor: "#d4e5f7",
          bodyColor: "#d4e5f7",
          borderColor: "#1e3a5f",
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12,
          callbacks: {
            label: function (context) {
              var val = context.parsed;
              var pct = totalCostos > 0 ? ((val / totalCostos) * 100).toFixed(1) : 0;
              return " " + context.label + ": Bs " + (val / 100).toFixed(2) + " (" + pct + "%)";
            }
          }
        }
      }
    },
    plugins: [{
      id: "centerText",
      afterDraw: function (chart) {
        var ctx2 = chart.ctx;
        var centerX = (chart.chartArea.left + chart.chartArea.right) / 2;
        var centerY = (chart.chartArea.top + chart.chartArea.bottom) / 2;
        ctx2.save();
        ctx2.textAlign = "center";
        ctx2.textBaseline = "middle";
        ctx2.font = "700 28px 'Inter', sans-serif";
        ctx2.fillStyle = "#ef5350";
        ctx2.fillText("Bs " + (totalCostos / 100).toFixed(0), centerX, centerY - 8);
        ctx2.font = "400 11px 'Inter', sans-serif";
        ctx2.fillStyle = "#5a7fa0";
        ctx2.fillText("costo total", centerX, centerY + 16);
        ctx2.restore();
      }
    }]
  });
}

// ============================================================
// CHART 5: TOP 3 CORTES — MAYOR MARGEN (Bar Horizontal)
// ============================================================

function renderChartTopCortes(datos, periodo) {
  var canvas = document.getElementById("chart-top-cortes");
  if (!canvas) return;
  var Chart = window.Chart;
  if (!Chart) return;

  var prendasMap = new Map(datos.prendas.map(function (p) { return [p.id, p]; }));
  var topCortes = calcularTopCortes(datos.cortes, prendasMap, periodo, 3);

  if (topCortes.length === 0) {
    chartInstances["chart-top-cortes"] = null;
    return;
  }

  var labels = topCortes.map(function (t) {
    var label = t.nombre;
    if (t.prendaNombre) label += " (" + t.prendaNombre + ")";
    return label;
  });
  var ingresosData = topCortes.map(function (t) { return t.ingresos; });
  var costosData = topCortes.map(function (t) { return t.costos; });
  var gananciaData = topCortes.map(function (t) { return t.ganancia; });

  var ctx = canvas.getContext("2d");
  chartInstances["chart-top-cortes"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Ingresos",
          data: ingresosData,
          backgroundColor: "#09af4d",
          borderRadius: 3,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        },
        {
          label: "Costos",
          data: costosData,
          backgroundColor: "#ef5350",
          borderRadius: 3,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        },
        {
          label: "Ganancia",
          data: gananciaData,
          backgroundColor: "#42a5f5",
          borderRadius: 3,
          barPercentage: 0.6,
          categoryPercentage: 0.7
        }
      ]
    },
    options: Object.assign({}, getBarLineOptions(), {
      indexAxis: "y",
      scales: {
        x: {
          grid: { color: "rgba(30, 58, 95, 0.5)", drawBorder: false },
          ticks: {
            color: "#5a7fa0",
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: function (value) { return "Bs " + value; }
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: function (value) {
              var str = value || "";
              return str.length > 22 ? str.slice(0, 20) + "…" : str;
            }
          }
        }
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 11 },
            usePointStyle: true,
            padding: 14
          }
        }
      }
    })
  });
}

// ============================================================
// SHARED CHART OPTIONS
// ============================================================

function getBarLineOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: "#8fb8d8",
          font: { family: "'Inter', sans-serif", size: 12 },
          usePointStyle: true,
          padding: 20
        }
      },
      tooltip: {
        backgroundColor: "rgba(15, 39, 68, 0.95)",
        titleColor: "#d4e5f7",
        bodyColor: "#d4e5f7",
        borderColor: "#1e3a5f",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        callbacks: {
          label: function (context) {
            var label = context.dataset.label || "";
            if (label) label += ": ";
            return label + "Bs " + context.parsed.y.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#8fb8d8", font: { family: "'Inter', sans-serif", size: 12 } }
      },
      y: {
        grid: { color: "rgba(30, 58, 95, 0.5)", drawBorder: false },
        ticks: {
          color: "#5a7fa0",
          font: { family: "'Inter', sans-serif", size: 11 },
          callback: function (value) { return "Bs " + value; }
        }
      }
    }
  };
}

// ============================================================
// EVENT HANDLER — Delegación de clicks
// ============================================================

function handleClick(e) {
  // Período chips
  var chip = e.target.closest(".filter-chip[data-periodo]");
  if (chip) {
    periodoActual = chip.dataset.periodo;
    if (!datosDashboard) return;
    var periodo = obtenerPeriodo(periodoActual);

    // Re-render KPIs, cash summary, progress, recent lists
    var kpis = calcularKPIs(datosDashboard, periodo);
    var prendasMap = new Map(datosDashboard.prendas.map(function (p) { return [p.id, p]; }));
    var trabajadoresMap = new Map(datosDashboard.trabajadores.map(function (t) { return [t.id, t]; }));
    var container = document.querySelector(".dashboard-v2");
    if (!container) return;

    // Update period selector active state
    container.querySelectorAll(".filter-chip[data-periodo]").forEach(function (btn) {
      btn.classList.toggle("active", btn.dataset.periodo === periodoActual);
    });

    // Replace KPI section
    var kpiEl = container.querySelector("#dash-kpis");
    if (kpiEl) kpiEl.outerHTML = buildKPIsHTML(kpis);

    // Replace cash summary
    var cashEl = container.querySelector("#dash-cash-summary");
    if (cashEl) cashEl.outerHTML = buildCashSummaryHTML(kpis);

    // Replace progreso section
    var progSection = container.querySelector("#dash-progreso");
    if (progSection) progSection.outerHTML = buildProgresoHTML(datosDashboard.cortes);

    // Replace cortes recientes
    var cortesSection = container.querySelector("#dash-cortes-recientes");
    if (cortesSection) cortesSection.outerHTML = buildCortesRecientesHTML(datosDashboard.cortes, prendasMap, periodo);

    // Replace últimos pagos
    var pagosSection = container.querySelector("#dash-pagos-recientes");
    if (pagosSection) pagosSection.outerHTML = buildPagosRecientesHTML(datosDashboard.pagos, datosDashboard.cortes, trabajadoresMap, periodo);

    // Re-render period-dependent charts
    destruirCharts();
    renderAllCharts(datosDashboard, periodo);

    // Charts re-rendered; event delegation on container covers new elements automatically
    return;
  }

  // Navegación desde items de lista
  var listItem = e.target.closest(".dash-list-item");
  if (listItem) {
    var corteId = listItem.dataset.corteId;
    var navHash = listItem.dataset.nav;
    if (corteId) { location.hash = "#administrar-tareas/" + corteId; return; }
    if (navHash) { location.hash = navHash; return; }
  }

  // Navegación desde "Ver todos"
  var linkNav = e.target.closest(".dash-section__link[data-nav]");
  if (linkNav) { location.hash = linkNav.dataset.nav; return; }

  // Click en items de progreso
  var progressItem = e.target.closest(".dash-progress-item");
  if (progressItem) {
    var pid = progressItem.dataset.corteId;
    if (pid) { location.hash = "#administrar-tareas/" + pid; return; }
  }
}

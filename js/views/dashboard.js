// ============================================================
// DASHBOARD - Vista de inicio con KPIs, gráficos y resúmenes
// Carga datos reales de IndexedDB y renderiza 3 tipos de chart:
// 1) Bar+Line agrupado (Ganancias mensuales)
// 2) Bar agrupado (Rentabilidad por prenda)
// 3) Line (Tendencia de Producción)
// ============================================================

import { db } from "../db.js";
import { formatBs, centavosABolivianos, escaparHTML } from "../utils.js";
import { estadoVacioHTML } from "./shared.js";

/** AbortController para limpiar event listeners al salir */
let abortController = null;

/** Instancias de Chart.js para destruirlas al recargar */
let chartGanancias = null;
let chartRentabilidad = null;
let chartTendencia = null;

/** Datos cargados de la BD, requeridos para cambiar período sin recargar */
let datosDashboard = null;

/** Período activo del gráfico de ganancias: 3 | 6 | 12 meses */
let periodoSeleccionado = 6;

/** Labels cortos de meses en español */
const MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Configuración de períodos disponibles */
const PERIODOS = [
  { id: 3, label: "3 meses" },
  { id: 6, label: "6 meses" },
  { id: 12, label: "12 meses" }
];

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export async function renderDashboard() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  // Limpiar listeners y charts de la visita anterior
  if (abortController) {
    abortController.abort();
  }
  abortController = new AbortController();
  destruirCharts();

  // Cargar datos reales de IndexedDB en paralelo
  datosDashboard = await cargarDatos();

  // Construir DOM
  const container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  container.innerHTML = buildDashboardHTML(datosDashboard);
  app.appendChild(container);

  // Delegación de eventos
  container.addEventListener("click", handleClick, { signal: abortController.signal });

  // Renderizar UI y charts
  renderPeriodSelector();
  renderChartGanancias(datosDashboard);
  renderChartRentabilidad(datosDashboard);
  renderChartTendencia(datosDashboard);
}

// ============================================================
// DESTRUIR CHARTS (evita memory leaks)
// ============================================================

function destruirCharts() {
  if (chartGanancias) {
    chartGanancias.destroy();
    chartGanancias = null;
  }
  if (chartRentabilidad) {
    chartRentabilidad.destroy();
    chartRentabilidad = null;
  }
  if (chartTendencia) {
    chartTendencia.destroy();
    chartTendencia = null;
  }
}

// ============================================================
// CARGA DE DATOS
// ============================================================

async function cargarDatos() {
  const [cortes, pagos, prendas, trabajadores] = await Promise.all([
    db.cortes.toArray(),
    db.pagos.toArray(),
    db.prendas.toArray(),
    db.trabajadores.toArray()
  ]);
  return { cortes, pagos, prendas, trabajadores };
}

// ============================================================
// CÁLCULOS Y UTILIDADES DE FECHA
// ============================================================

function esEsteMes(fechaISO) {
  if (!fechaISO) return false;
  const d = new Date(fechaISO);
  const ahora = new Date();
  return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();
}

function esMismoMes(fechaISO, year, month) {
  if (!fechaISO) return false;
  const d = new Date(fechaISO);
  return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function obtenerUltimosMeses(n) {
  const meses = [];
  const ahora = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: MESES_ES[d.getMonth()]
    });
  }
  return meses;
}

function calcularIngresosMes(cortes, year, month) {
  return cortes.reduce(function (sum, c) {
    if (c.estado !== "terminado" || !c.fechaFinalizacion) return sum;
    if (!esMismoMes(c.fechaFinalizacion, year, month)) return sum;
    return sum + c.cantidadPrendas * c.precioVentaUnitario;
  }, 0);
}

function calcularGastosMes(pagos, year, month) {
  const centavos = pagos.reduce(function (sum, p) {
    if (!esMismoMes(p.fecha, year, month)) return sum;
    return sum + p.monto;
  }, 0);
  return centavosABolivianos(centavos);
}

function calcularKPIs(datos) {
  const cortesActivos = datos.cortes.filter(function (c) {
    return c.estado === "activo";
  }).length;

  const ingresosMes = calcularIngresosMes(datos.cortes, new Date().getFullYear(), new Date().getMonth() + 1);

  const gastosMes = calcularGastosMes(datos.pagos, new Date().getFullYear(), new Date().getMonth() + 1);

  return {
    cortesActivos: cortesActivos,
    ingresosMes: ingresosMes,
    gastosMes: gastosMes,
    gananciaMes: ingresosMes - gastosMes
  };
}

function calcularProgresoCorte(corte) {
  if (!corte.tareas || corte.tareas.length === 0) return 0;
  let totalAsignadas = 0;
  let totalPosible = corte.cantidadPrendas * corte.tareas.length;
  corte.tareas.forEach(function (tarea) {
    if (tarea.asignaciones) {
      totalAsignadas += tarea.asignaciones.reduce(function (s, a) {
        return s + (a.cantidad || 0);
      }, 0);
    }
  });
  if (totalPosible === 0) return 0;
  return Math.min(100, Math.round((totalAsignadas / totalPosible) * 100));
}

// ============================================================
// BUILD HTML
// ============================================================

function buildDashboardHTML(datos) {
  const kpis = calcularKPIs(datos);
  const prendasMap = new Map(datos.prendas.map(function (p) { return [p.id, p]; }));
  const trabajadoresMap = new Map(datos.trabajadores.map(function (t) { return [t.id, t]; }));

  return buildKPICardsHTML(kpis) +
    buildGananciasSectionHTML() +
    buildChartsRowHTML(datos) +
    buildProgresoHTML(datos.cortes) +
    buildCortesRecientesHTML(datos.cortes, prendasMap) +
    buildPagosRecientesHTML(datos.pagos, datos.cortes, trabajadoresMap) +
    '<div class="app-version">v1.4</div>';
}

function buildKPICardsHTML(kpis) {
  const gananciaClase = kpis.gananciaMes >= 0
    ? "dashboard-kpi__value--positive"
    : "dashboard-kpi__value--negative";

  return '<div class="dashboard-kpis">' +
    '<div class="dashboard-kpi">' +
      '<span class="dashboard-kpi__label">Cortes Activos</span>' +
      '<span class="dashboard-kpi__value">' + kpis.cortesActivos + "</span>" +
    "</div>" +
    '<div class="dashboard-kpi">' +
      '<span class="dashboard-kpi__label">Ganancia del Mes</span>' +
      '<span class="dashboard-kpi__value ' + gananciaClase + '">' + formatBsValor(kpis.gananciaMes) + "</span>" +
    "</div>" +
    '<div class="dashboard-kpi">' +
      '<span class="dashboard-kpi__label">Gastos del Mes</span>' +
      '<span class="dashboard-kpi__value">' + formatBsValor(kpis.gastosMes) + "</span>" +
    "</div>" +
    '<div class="dashboard-kpi">' +
      '<span class="dashboard-kpi__label">Ingresos del Mes</span>' +
      '<span class="dashboard-kpi__value">' + formatBsValor(kpis.ingresosMes) + "</span>" +
    "</div>" +
  "</div>";
}

/** Formatea un valor en bolivianos (ya convertido) con 2 decimales */
function formatBsValor(valor) {
  if (typeof valor !== "number" || isNaN(valor)) return "Bs 0.00";
  return "Bs " + valor.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function buildGananciasSectionHTML() {
  return '<div class="dashboard-section">' +
    '<div class="dashboard-section__header">' +
      '<h2 class="dashboard-section__title">Ganancias</h2>' +
    "</div>" +
    '<div class="card">' +
      '<div class="dashboard-period-selector" id="dash-period-selector"></div>' +
      '<div class="dashboard-chart-container dashboard-chart-container--tall">' +
        '<canvas id="chart-ganancias"></canvas>' +
      "</div>" +
    "</div>" +
  "</div>";
}

function buildChartsRowHTML(datos) {
  return '<div class="dashboard-charts-row">' +
    '<div class="dashboard-section">' +
      '<div class="dashboard-section__header">' +
        '<h2 class="dashboard-section__title">Rentabilidad por Prenda</h2>' +
      "</div>" +
      '<div class="card">' +
        '<div class="dashboard-chart-container dashboard-chart-container--square">' +
          '<canvas id="chart-rentabilidad"></canvas>' +
        "</div>" +
      "</div>" +
    "</div>" +
    '<div class="dashboard-section">' +
      '<div class="dashboard-section__header">' +
        '<h2 class="dashboard-section__title">Tendencia de Producción</h2>' +
      "</div>" +
      '<div class="card">' +
        '<div class="dashboard-chart-container dashboard-chart-container--square">' +
          '<canvas id="chart-tendencia"></canvas>' +
        "</div>" +
      "</div>" +
    "</div>" +
  "</div>";
}

function buildProgresoHTML(cortes) {
  const activos = cortes.filter(function (c) { return c.estado === "activo"; });

  if (activos.length === 0) {
    return '<div class="dashboard-section">' +
      '<div class="dashboard-section__header">' +
        '<h2 class="dashboard-section__title">Progreso de Producción</h2>' +
      "</div>" +
      '<div class="card">' +
        estadoVacioHTML("No hay cortes activos", "Crea un nuevo corte para comenzar") +
      "</div>" +
    "</div>";
  }

  let html = '<div class="dashboard-section">' +
    '<div class="dashboard-section__header">' +
      '<h2 class="dashboard-section__title">Progreso de Producción</h2>' +
    "</div>" +
    '<div class="card">';

  activos.forEach(function (corte) {
    const pct = calcularProgresoCorte(corte);
    const completoClase = pct >= 100 ? "progress-bar__fill--completo" : "";
    html += '<div class="dashboard-progress-item" data-corte-id="' + corte.id + '">' +
      '<div class="dashboard-progress-header">' +
        '<span class="dashboard-progress-name">' + escaparHTML(corte.nombreCorte || ("Corte #" + corte.id)) + "</span>" +
        '<span class="dashboard-progress-pct">' + pct + "%</span>" +
      "</div>" +
      '<div class="progress-bar">' +
        '<div class="progress-bar__fill ' + completoClase + '" style="width:' + pct + '%"></div>' +
      "</div>" +
    "</div>";
  });

  html += "</div></div>";
  return html;
}

function buildCortesRecientesHTML(cortes, prendasMap) {
  const recientes = cortes
    .slice()
    .sort(function (a, b) {
      return new Date(b.fechaCreacion) - new Date(a.fechaCreacion);
    })
    .slice(0, 5);

  if (recientes.length === 0) {
    return '<div class="dashboard-section">' +
      '<div class="dashboard-section__header">' +
        '<h2 class="dashboard-section__title">Cortes Recientes</h2>' +
        '<a class="dashboard-section__link" data-nav="#gestion-cortes">Ver todos →</a>' +
      "</div>" +
      estadoVacioHTML("No hay cortes registrados", "Crea tu primer corte") +
    "</div>";
  }

  let html = '<div class="dashboard-section">' +
    '<div class="dashboard-section__header">' +
      '<h2 class="dashboard-section__title">Cortes Recientes</h2>' +
      '<a class="dashboard-section__link" data-nav="#gestion-cortes">Ver todos →</a>' +
    "</div>";

  recientes.forEach(function (c) {
    const prenda = prendasMap.get(c.prendaId);
    const nombrePrenda = prenda ? prenda.nombre : "Prenda eliminada";
    const badgeClass = c.estado === "activo" ? "badge--success" : "badge--info";
    const badgeText = c.estado === "activo" ? "Activo" : "Terminado";
    const fecha = formatFechaCorta(c.fechaCreacion);

    html += '<div class="dashboard-list-item" data-corte-id="' + c.id + '">' +
      '<div class="dashboard-list-item__info">' +
        '<span class="dashboard-list-item__name">' + escaparHTML(c.nombreCorte || ("Corte #" + c.id)) + "</span>" +
        '<span class="dashboard-list-item__detail">' + escaparHTML(nombrePrenda) + "</span>" +
      "</div>" +
      '<div class="dashboard-list-item__meta">' +
        '<span class="badge ' + badgeClass + '">' + badgeText + "</span>" +
        '<span class="dashboard-list-item__fecha">' + fecha + "</span>" +
      "</div>" +
    "</div>";
  });

  html += "</div>";
  return html;
}

function buildPagosRecientesHTML(pagos, cortes, trabajadoresMap) {
  const recientes = pagos
    .slice()
    .sort(function (a, b) {
      return new Date(b.fecha) - new Date(a.fecha);
    })
    .slice(0, 5);

  if (recientes.length === 0) {
    return '<div class="dashboard-section">' +
      '<div class="dashboard-section__header">' +
        '<h2 class="dashboard-section__title">Últimos Pagos</h2>' +
        '<a class="dashboard-section__link" data-nav="#historial-pagos">Ver todos →</a>' +
      "</div>" +
      estadoVacioHTML("No hay pagos registrados", "Registra tu primer pago") +
    "</div>";
  }

  const cortesMap = new Map(cortes.map(function (c) { return [c.id, c]; }));

  let html = '<div class="dashboard-section">' +
    '<div class="dashboard-section__header">' +
      '<h2 class="dashboard-section__title">Últimos Pagos</h2>' +
      '<a class="dashboard-section__link" data-nav="#historial-pagos">Ver todos →</a>' +
    "</div>";

  recientes.forEach(function (p) {
    const trabajador = trabajadoresMap.get(p.trabajadorId);
    const corte = cortesMap.get(p.corteId);
    const nombreTrabajador = trabajador ? trabajador.nombre : "Trabajador eliminado";
    const nombreCorte = corte ? (corte.nombreCorte || ("Corte #" + corte.id)) : "Corte eliminado";
    const fecha = formatFechaCorta(p.fecha);

    html += '<div class="dashboard-list-item" data-nav="#historial-pagos">' +
      '<div class="dashboard-list-item__info">' +
        '<span class="dashboard-list-item__name">' + escaparHTML(nombreTrabajador) + "</span>" +
        '<span class="dashboard-list-item__detail">' + escaparHTML(nombreCorte) + "</span>" +
      "</div>" +
      '<div class="dashboard-list-item__meta">' +
        '<span class="dashboard-list-item__monto">' + formatBs(p.monto) + "</span>" +
        '<span class="dashboard-list-item__fecha">' + fecha + "</span>" +
      "</div>" +
    "</div>";
  });

  html += "</div>";
  return html;
}

function formatFechaCorta(fechaISO) {
  if (!fechaISO) return "";
  const d = new Date(fechaISO);
  const mes = MESES_ES[d.getMonth()];
  return d.getDate() + " " + mes + " " + d.getFullYear();
}

// ============================================================
// RENDER PERIOD SELECTOR
// ============================================================

function renderPeriodSelector() {
  const container = document.getElementById("dash-period-selector");
  if (!container) return;

  container.innerHTML = PERIODOS.map(function (p) {
    const activeClass = p.id === periodoSeleccionado ? "active" : "";
    return '<button class="filter-chip ' + activeClass + '" data-periodo="' + p.id + '" type="button">' +
      escaparHTML(p.label) +
    "</button>";
  }).join("");
}

// ============================================================
// CHART 1: GANANCIAS (Bar + Line agrupado)
// ============================================================

function renderChartGanancias(datos) {
  const canvas = document.getElementById("chart-ganancias");
  if (!canvas) return;

  const meses = obtenerUltimosMeses(periodoSeleccionado);
  const labels = meses.map(function (m) { return m.label; });
  const ingresos = [];
  const gastos = [];
  const ganancias = [];

  meses.forEach(function (m) {
    const ing = calcularIngresosMes(datos.cortes, m.year, m.month);
    const gast = calcularGastosMes(datos.pagos, m.year, m.month);
    ingresos.push(ing);
    gastos.push(gast);
    ganancias.push(ing - gast);
  });

  const ctx = canvas.getContext("2d");
  const Chart = window.Chart;
  if (!Chart) return;

  chartGanancias = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Ingresos",
          data: ingresos,
          backgroundColor: "#09af4d",
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
          order: 2
        },
        {
          label: "Gastos",
          data: gastos,
          backgroundColor: "#ef5350",
          borderRadius: 4,
          barPercentage: 0.6,
          categoryPercentage: 0.7,
          order: 3
        },
        {
          label: "Ganancia",
          data: ganancias,
          type: "line",
          borderColor: "#d4e5f7",
          backgroundColor: "rgba(212, 229, 247, 0.1)",
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
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
              let label = context.dataset.label || "";
              if (label) label += ": ";
              return label + "Bs " + context.parsed.y.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 12 }
          }
        },
        y: {
          grid: { color: "rgba(30, 58, 95, 0.5)", drawBorder: false },
          ticks: {
            color: "#5a7fa0",
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: function (value) {
              return "Bs " + value;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// CHART 2: RENTABILIDAD POR PRENDA (Bar chart agrupado)
// Ingresos = cortes TERMINADOS de esa prenda * precioVentaUnitario
// Gastos   = pagos asociados a cortes de esa prenda
// Ganancia = Ingresos - Gastos
// ============================================================

function renderChartRentabilidad(datos) {
  const canvas = document.getElementById("chart-rentabilidad");
  if (!canvas) return;

  const Chart = window.Chart;
  if (!Chart) return;

  // Mapa corteId -> corte para lookup
  const cortesMap = new Map(datos.cortes.map(function (c) { return [c.id, c]; }));

  // Para cada prenda: calcular ingresos, gastos y ganancia
  const labels = [];
  const ingresos = [];
  const gastos = [];
  const ganancias = [];

  datos.prendas.forEach(function (prenda) {
    const cortesDePrenda = datos.cortes.filter(function (c) {
      return c.prendaId === prenda.id;
    });

    const ing = cortesDePrenda
      .filter(function (c) { return c.estado === "terminado"; })
      .reduce(function (sum, c) {
        return sum + c.cantidadPrendas * c.precioVentaUnitario;
      }, 0);

    const corteIds = cortesDePrenda.map(function (c) { return c.id; });
    const gastoCentavos = datos.pagos
      .filter(function (p) { return corteIds.includes(p.corteId); })
      .reduce(function (sum, p) { return sum + p.monto; }, 0);
    const gast = centavosABolivianos(gastoCentavos);

    labels.push(prenda.nombre);
    ingresos.push(ing);
    gastos.push(gast);
    ganancias.push(ing - gast);
  });

  chartRentabilidad = new Chart(canvas, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Ingresos",
          data: ingresos,
          backgroundColor: "#09af4d",
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: "Gastos",
          data: gastos,
          backgroundColor: "#ef5350",
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        },
        {
          label: "Ganancia",
          data: ganancias,
          backgroundColor: "#42a5f5",
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 12 },
            usePointStyle: true,
            padding: 16
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
              let label = context.dataset.label || "";
              if (label) label += ": ";
              return label + "Bs " + context.parsed.y.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 11 }
          }
        },
        y: {
          grid: { color: "rgba(30, 58, 95, 0.5)", drawBorder: false },
          ticks: {
            color: "#5a7fa0",
            font: { family: "'Inter', sans-serif", size: 11 },
            callback: function (value) {
              return "Bs " + value;
            }
          }
        }
      }
    }
  });
}

// ============================================================
// CHART 3: TENDENCIA DE PRODUCCIÓN (Line chart)
// ============================================================

function renderChartTendencia(datos) {
  const canvas = document.getElementById("chart-tendencia");
  if (!canvas) return;

  const meses = obtenerUltimosMeses(6);
  const labels = meses.map(function (m) { return m.label; });
  const dataValues = meses.map(function (m) {
    return datos.cortes.filter(function (c) {
      return esMismoMes(c.fechaCreacion, m.year, m.month);
    }).length;
  });

  const Chart = window.Chart;
  if (!Chart) return;

  chartTendencia = new Chart(canvas, {
    type: "line",
    data: {
      labels: labels,
      datasets: [{
        label: "Cortes creados",
        data: dataValues,
        borderColor: "#09af4d",
        backgroundColor: "rgba(9, 175, 77, 0.15)",
        borderWidth: 2,
        pointBackgroundColor: "#09af4d",
        pointBorderColor: "#0f2744",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
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
              const val = context.parsed.y;
              return val + (val === 1 ? " corte" : " cortes");
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#8fb8d8",
            font: { family: "'Inter', sans-serif", size: 12 }
          }
        },
        y: {
          grid: { color: "rgba(30, 58, 95, 0.5)", drawBorder: false },
          ticks: {
            color: "#5a7fa0",
            font: { family: "'Inter', sans-serif", size: 11 },
            stepSize: 1,
            callback: function (value) {
              return value | 0;
            }
          },
          beginAtZero: true
        }
      }
    }
  });
}

// ============================================================
// EVENT HANDLERS
// ============================================================

function handleClick(e) {
  // Navegación desde items de lista
  const listItem = e.target.closest(".dashboard-list-item");
  if (listItem) {
    const corteId = listItem.dataset.corteId;
    const navHash = listItem.dataset.nav;
    if (corteId) {
      location.hash = "#administrar-tareas/" + corteId;
      return;
    }
    if (navHash) {
      location.hash = navHash;
      return;
    }
  }

  // Navegación desde links "Ver todos"
  const linkNav = e.target.closest(".dashboard-section__link[data-nav]");
  if (linkNav) {
    location.hash = linkNav.dataset.nav;
    return;
  }

  // Cambio de período del gráfico de ganancias
  const chip = e.target.closest(".filter-chip[data-periodo]");
  if (chip) {
    periodoSeleccionado = parseInt(chip.dataset.periodo, 10);
    renderPeriodSelector();
    renderChartGanancias(datosDashboard);
    return;
  }

  // Click en items de progreso
  const progressItem = e.target.closest(".dashboard-progress-item");
  if (progressItem) {
    const corteId = progressItem.dataset.corteId;
    if (corteId) {
      location.hash = "#administrar-tareas/" + corteId;
      return;
    }
  }
}

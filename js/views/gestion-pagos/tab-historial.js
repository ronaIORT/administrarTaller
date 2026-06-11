// ============================================================
// TAB HISTORIAL - Historial combinado de pagos y gastos
// Filtros: tipo (Pagos/Gastos), select secundario (trabajador
// para pagos, categoria para gastos). KPIs de cantidad y total.
// Timeline con boton de eliminar en cada entrada.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "../shared.js";

// ============================================================
// CATEGORIAS DE GASTOS
// ============================================================

var CATEGORIAS = [
  { id: "hilos", label: "Hilos", icon: "🧵" },
  { id: "aceite", label: "Aceite / Mantenimiento", icon: "🔧" },
  { id: "repuestos", label: "Repuestos", icon: "⚙️" },
  { id: "servicios", label: "Servicios", icon: "📋" },
  { id: "otros", label: "Otros", icon: "📦" },
];

var CATEGORIA_MAP = {};
CATEGORIAS.forEach(function (c) { CATEGORIA_MAP[c.id] = c; });

// ============================================================
// ESTADO LOCAL
// ============================================================

/** "pagos" | "gastos" */
let tipoActivo = "pagos";
/** ID del filtro secundario ("todos" o un id especifico) */
let filtroSecundario = "todos";

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabHistorial(container, opciones) {
  var pagos = opciones.pagos;
  var gastos = opciones.gastos;
  var trabajadoresMap = opciones.trabajadoresMap;
  var cortesMap = opciones.cortesMap || {};
  var onDataChange = opciones.onDataChange;

  tipoActivo = "pagos";
  filtroSecundario = "todos";

  container.innerHTML =
    '<section class="historial-section">' +
    '<div class="historial-filters">' +
    '<div class="historial-type-chips" id="historial-type-chips">' +
    '<button class="filter-chip active" data-tipo="pagos">Pagos</button>' +
    '<button class="filter-chip" data-tipo="gastos">Gastos</button>' +
    "</div>" +
    '<select id="historial-select" class="form-select historial-select">' +
    "</select>" +
    "</div>" +
    '<div id="historial-kpi-container"></div>' +
    '<div id="historial-timeline-container"></div>' +
    "</section>";

  poblarSelectSecundario(pagos, gastos, trabajadoresMap);
  renderKPI(pagos, gastos, trabajadoresMap);
  renderTimeline(pagos, gastos, trabajadoresMap, cortesMap, onDataChange);

  // Cambio de tipo (Pagos/Gastos)
  document.getElementById("historial-type-chips").addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    tipoActivo = chip.dataset.tipo;
    document.querySelectorAll("#historial-type-chips .filter-chip").forEach(function (c) {
      c.classList.toggle("active", c.dataset.tipo === tipoActivo);
    });
    filtroSecundario = "todos";
    poblarSelectSecundario(pagos, gastos, trabajadoresMap);
    renderKPI(pagos, gastos, trabajadoresMap);
    renderTimeline(pagos, gastos, trabajadoresMap, cortesMap, onDataChange);
  });

  // Cambio de filtro secundario (trabajador/categoria)
  document.getElementById("historial-select").addEventListener("change", function () {
    filtroSecundario = this.value;
    renderKPI(pagos, gastos, trabajadoresMap);
    renderTimeline(pagos, gastos, trabajadoresMap, cortesMap, onDataChange);
  });

  // Delegacion de clicks en botones eliminar
  document.getElementById("historial-timeline-container").addEventListener("click", function (e) {
    var btnDelete = e.target.closest(".historial-entry__delete");
    if (!btnDelete) return;
    var tipo = btnDelete.dataset.tipo;
    var id = parseInt(btnDelete.dataset.id);
    if (tipo === "pago") {
      confirmarEliminarPago(id, onDataChange);
    } else if (tipo === "gasto") {
      confirmarEliminarGasto(id, onDataChange);
    }
  });
}

// ============================================================
// SELECT SECUNDARIO - Trabajadores (pagos) / Categorias (gastos)
// ============================================================

function poblarSelectSecundario(pagos, gastos, trabajadoresMap) {
  var select = document.getElementById("historial-select");
  select.innerHTML = "";

  if (tipoActivo === "pagos") {
    // Obtener trabajadores que tienen pagos
    var idsConPagos = [];
    var idsVistos = {};
    pagos.forEach(function (p) {
      if (p.trabajadorId && !idsVistos[p.trabajadorId]) {
        idsVistos[p.trabajadorId] = true;
        idsConPagos.push(p.trabajadorId);
      }
    });

    select.innerHTML = '<option value="todos">Todos los trabajadores</option>';
    idsConPagos.forEach(function (id) {
      var nombre = trabajadoresMap[id] || "Trabajador " + id;
      select.innerHTML += '<option value="' + id + '">' + escaparHTML(nombre) + "</option>";
    });
  } else {
    // Obtener categorias que tienen gastos
    var catsConGastos = [];
    var catsVistos = {};
    gastos.forEach(function (g) {
      if (g.categoria && !catsVistos[g.categoria]) {
        catsVistos[g.categoria] = true;
        catsConGastos.push(g.categoria);
      }
    });

    select.innerHTML = '<option value="todos">Todas las categorias</option>';
    catsConGastos.forEach(function (catId) {
      var cat = CATEGORIA_MAP[catId];
      var label = cat ? cat.label : catId;
      select.innerHTML += '<option value="' + catId + '">' + escaparHTML(label) + "</option>";
    });
  }
}

// ============================================================
// KPI - Cantidad y total
// ============================================================

function renderKPI(pagos, gastos, trabajadoresMap) {
  var container = document.getElementById("historial-kpi-container");
  var filtrados = obtenerFiltrados(pagos, gastos, trabajadoresMap);
  var total = 0;
  filtrados.forEach(function (item) { total += item.monto; });

  var tipoLabel = tipoActivo === "pagos" ? "pagos" : "gastos";

  container.innerHTML =
    '<div class="historial-kpi-card">' +
    '<div class="historial-kpi-card__left">' +
    '<span class="historial-kpi-card__count">' + filtrados.length + "</span>" +
    '<span class="historial-kpi-card__label">' + tipoLabel + "</span>" +
    "</div>" +
    '<span class="historial-kpi-card__total">' + formatBs(total) + "</span>" +
    "</div>";
}

// ============================================================
// FILTRAR DATOS
// ============================================================

function obtenerFiltrados(pagos, gastos, trabajadoresMap) {
  var items = [];

  if (tipoActivo === "pagos") {
    pagos.forEach(function (p) {
      if (filtroSecundario !== "todos" && p.trabajadorId !== parseInt(filtroSecundario)) return;
      items.push({
        id: p.id,
        tipo: "pago",
        trabajadorId: p.trabajadorId,
        corteId: p.corteId,
        categoria: null,
        descripcion: null,
        monto: p.monto,
        fecha: p.fecha,
        nota: p.nota,
      });
    });
  } else {
    gastos.forEach(function (g) {
      if (filtroSecundario !== "todos" && g.categoria !== filtroSecundario) return;
      items.push({
        id: g.id,
        tipo: "gasto",
        trabajadorId: null,
        categoria: g.categoria,
        descripcion: g.descripcion,
        monto: g.monto,
        fecha: g.fecha,
        nota: g.nota,
      });
    });
  }

  // Ordenar por fecha descendente
  items.sort(function (a, b) {
    if (a.fecha > b.fecha) return -1;
    if (a.fecha < b.fecha) return 1;
    // Misma fecha: items mas nuevos primero (por id descendente)
    return b.id - a.id;
  });

  return items;
}

// ============================================================
// TIMELINE
// ============================================================

function renderTimeline(pagos, gastos, trabajadoresMap, cortesMap, onDataChange) {
  var container = document.getElementById("historial-timeline-container");
  var items = obtenerFiltrados(pagos, gastos, trabajadoresMap);

  if (items.length === 0) {
    container.innerHTML = estadoVacioHTML("Sin registros", "No hay " + (tipoActivo === "pagos" ? "pagos" : "gastos") + " registrados aun");
    return;
  }

  container.innerHTML =
    '<div class="historial-timeline">' +
    items.map(function (item, i) {
      var tipoClase, titulo, badgeTipo, badgeClase, amountClase, notaHTML, badgeCorteHTML;

      if (item.tipo === "pago") {
        var nombreTrab = trabajadoresMap[item.trabajadorId] || "Trabajador " + item.trabajadorId;
        tipoClase = "historial-entry--pago";
        titulo = "💰 Pago a " + escaparHTML(nombreTrab);
        badgeTipo = "Pago";
        badgeClase = "badge--primary";
        amountClase = "historial-entry__amount--payment";

        // Etiqueta del corte
        var corte = cortesMap[item.corteId];
        if (corte) {
          var nombreCorte = escaparHTML(corte.nombreCorte || "Corte " + corte.id);
          badgeCorteHTML = '<span class="badge badge--corte" title="' + nombreCorte + '">🧵 ' + nombreCorte + '</span>';
        } else {
          badgeCorteHTML = '<span class="badge badge--corte badge--corte--orphan">Corte eliminado</span>';
        }
      } else {
        var cat = CATEGORIA_MAP[item.categoria];
        var iconCat = cat ? cat.icon + " " : "📦 ";
        var catLabel = cat ? cat.label : item.categoria;
        tipoClase = "historial-entry--gasto";
        titulo = iconCat + escaparHTML(item.descripcion || catLabel);
        badgeTipo = "Gasto";
        badgeClase = "badge--accent";
        amountClase = "historial-entry__amount--expense";
        badgeCorteHTML = "";
      }

      notaHTML = item.nota
        ? '<div class="historial-entry__note">' + escaparHTML(item.nota) + "</div>"
        : "";

      return (
        '<div class="historial-entry ' + tipoClase + '" role="listitem" style="animation-delay:' + (i * 30) + 'ms">' +
        '<div class="historial-entry__header">' +
        '<span class="historial-entry__title">' + titulo + "</span>" +
        '<span class="historial-entry__amount ' + amountClase + '">' +
        formatBs(item.monto) +
        "</span>" +
        "</div>" +
        '<div class="historial-entry__meta-row">' +
        '<span class="badge ' + badgeClase + '">' + badgeTipo + "</span>" +
        badgeCorteHTML +
        '<span class="historial-entry__date">' + formatearFecha(item.fecha) + "</span>" +
        '<button class="btn btn--ghost btn--sm historial-entry__delete" data-tipo="' + item.tipo + '" data-id="' + item.id + '" aria-label="Eliminar">Eliminar</button>' +
        "</div>" +
        notaHTML +
        "</div>"
      );
    }).join("") +
    "</div>";
}

// ============================================================
// ELIMINAR PAGO
// ============================================================

function confirmarEliminarPago(id, onDataChange) {
  mostrarModalConfirmar(
    "Eliminar Pago",
    "Este pago se eliminara permanentemente. Los calculos de pendiente se actualizaran automaticamente.",
    "danger",
    async function () {
      try {
        await db.pagos.delete(id);
        mostrarToast("Pago eliminado", "success");
        if (onDataChange) await onDataChange();
      } catch (err) {
        console.error("Error al eliminar pago:", err);
        mostrarToast("Error al eliminar", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

// ============================================================
// ELIMINAR GASTO
// ============================================================

function confirmarEliminarGasto(id, onDataChange) {
  mostrarModalConfirmar(
    "Eliminar Gasto",
    "Este gasto se eliminara permanentemente.",
    "danger",
    async function () {
      try {
        await db.gastos.delete(id);
        mostrarToast("Gasto eliminado", "success");
        if (onDataChange) await onDataChange();
      } catch (err) {
        console.error("Error al eliminar gasto:", err);
        mostrarToast("Error al eliminar", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

// ============================================================
// FORMATEO DE FECHA
// ============================================================

function formatearFecha(fechaISO) {
  if (!fechaISO) return "-";
  var partes = fechaISO.split("T")[0].split("-");
  return partes[2] + "/" + partes[1] + "/" + partes[0];
}

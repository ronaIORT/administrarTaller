// ============================================================
// TAB HISTORIAL - Vista unificada de pagos y gastos
// Selector (chips): Pagos | Gastos
// Pagos: filtro por trabajador + resumen + lista de pagos
// Gastos: filtro por categoria + resumen + lista de gastos
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs, formatNumero } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML, CATEGORIAS_GASTOS } from "../shared.js";

function formatearFecha(fechaISO) {
  if (!fechaISO) return "";
  var fecha = new Date(fechaISO);
  var dia = String(fecha.getDate()).padStart(2, "0");
  var mes = String(fecha.getMonth() + 1).padStart(2, "0");
  var anio = fecha.getFullYear();
  return dia + "/" + mes + "/" + anio;
}

export function renderTabHistorial(pagos, gastos, trabajadoresMap, container, opciones) {
  container.innerHTML = "";

  var onPagoEliminado = opciones ? opciones.onPagoEliminado : null;
  var onGastoEliminado = opciones ? opciones.onGastoEliminado : null;

  var chipPagosActivo = "active";
  var chipGastosActivo = "";

  container.innerHTML =
    '<div class="pg-historial">' +
    '<div class="pg-historial__chips">' +
    '<button class="filter-chip pg-chip-pagos ' + chipPagosActivo + '" data-tipo="pagos">Pagos</button>' +
    '<button class="filter-chip pg-chip-gastos ' + chipGastosActivo + '" data-tipo="gastos">Gastos</button>' +
    '</div>' +
    '<div id="pg-historial-filtro"></div>' +
    '<div id="pg-historial-resumen"></div>' +
    '<div class="pg-historial__lista" id="pg-historial-lista"></div>' +
    '</div>';

  var tipoActual = "pagos";

  container.querySelector(".pg-historial__chips").addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    var nuevoTipo = chip.dataset.tipo;
    if (nuevoTipo === tipoActual) return;
    tipoActual = nuevoTipo;

    container.querySelectorAll(".pg-historial__chips .filter-chip").forEach(function (c) {
      c.classList.remove("active");
    });
    chip.classList.add("active");

    renderTipoActual(pagos, gastos, trabajadoresMap, tipoActual, container, opciones);
  });

  if (container._clickHandler) {
    container.removeEventListener("click", container._clickHandler);
  }

  container._clickHandler = function (e) {
    var btnEliminarPago = e.target.closest(".pg-btn-eliminar-pago");
    if (btnEliminarPago) {
      var pagoId = parseInt(btnEliminarPago.dataset.id);
      confirmarEliminarPago(pagoId, pagos, trabajadoresMap, onPagoEliminado);
      return;
    }
    var btnEliminarGasto = e.target.closest(".pg-btn-eliminar-gasto");
    if (btnEliminarGasto) {
      var gastoId = parseInt(btnEliminarGasto.dataset.id);
      confirmarEliminarGasto(gastoId, gastos, onGastoEliminado);
    }
  };

  container.addEventListener("click", container._clickHandler);

  renderTipoActual(pagos, gastos, trabajadoresMap, tipoActual, container, opciones);
}

function renderTipoActual(pagos, gastos, trabajadoresMap, tipo, container, opciones) {
  var filtroContainer = document.getElementById("pg-historial-filtro");
  var resumenContainer = document.getElementById("pg-historial-resumen");
  var listaContainer = document.getElementById("pg-historial-lista");

  if (tipo === "pagos") {
    renderFiltroTrabajadores(trabajadoresMap, filtroContainer);
    renderListaPagos(pagos, trabajadoresMap, "todos", resumenContainer, listaContainer);
  } else {
    renderFiltroCategorias(CATEGORIAS_GASTOS, filtroContainer);
    renderListaGastos(gastos, "todas", resumenContainer, listaContainer);
  }
}

function renderFiltroTrabajadores(trabajadoresMap, container) {
  var trabajadoresOrdenados = Object.values(trabajadoresMap).sort(function (a, b) {
    return a.nombre.localeCompare(b.nombre);
  });

  var html =
    '<div class="pg-historial__filtro">' +
    '<select id="pg-filtro-trabajador" class="form-select">' +
    '<option value="todos">Todos los trabajadores</option>';

  trabajadoresOrdenados.forEach(function (t) {
    html += '<option value="' + t.id + '">' + escaparHTML(t.nombre) + '</option>';
  });

  html += '</select></div>';
  container.innerHTML = html;

  document.getElementById("pg-filtro-trabajador").addEventListener("change", function () {
    var pagos = window._pagosCache || [];
    var trabajadoresMap = window._trabajadoresMapCache || {};
    renderListaPagos(pagos, trabajadoresMap, this.value,
      document.getElementById("pg-historial-resumen"),
      document.getElementById("pg-historial-lista"));
  });
}

function renderFiltroCategorias(categorias, container) {
  var html =
    '<div class="pg-historial__filtro">' +
    '<select id="pg-filtro-categoria" class="form-select">' +
    '<option value="todas">Todas las categorias</option>';

  categorias.forEach(function (cat) {
    html += '<option value="' + cat.id + '">' + escaparHTML(cat.label) + '</option>';
  });

  html += '</select></div>';
  container.innerHTML = html;

  document.getElementById("pg-filtro-categoria").addEventListener("change", function () {
    var gastos = window._gastosCache || [];
    renderListaGastos(gastos, this.value,
      document.getElementById("pg-historial-resumen"),
      document.getElementById("pg-historial-lista"));
  });
}

function renderListaPagos(pagos, trabajadoresMap, filtroTrabajador, resumenContainer, listaContainer) {
  window._pagosCache = pagos;
  window._trabajadoresMapCache = trabajadoresMap;

  var pagosFiltrados = pagos.slice().sort(function (a, b) {
    return (b.fecha || "").localeCompare(a.fecha || "");
  });

  if (filtroTrabajador !== "todos") {
    var id = parseInt(filtroTrabajador);
    pagosFiltrados = pagosFiltrados.filter(function (p) {
      return p.trabajadorId === id;
    });
  }

  if (resumenContainer && pagosFiltrados.length > 0) {
    var totalMontoCtv = 0;
    pagosFiltrados.forEach(function (p) { totalMontoCtv += p.monto || 0; });
    var totalBs = formatBs(totalMontoCtv);
    var plural = pagosFiltrados.length === 1 ? "pago" : "pagos";

    resumenContainer.innerHTML =
      '<div class="pg-historial__resumen">' +
      '<span class="pg-historial__cantidad">' + pagosFiltrados.length + ' ' + plural + '</span>' +
      '<span class="pg-historial__total">Total: ' + totalBs + '</span>' +
      '</div>';
  } else if (resumenContainer) {
    resumenContainer.innerHTML = "";
  }

  if (pagosFiltrados.length === 0) {
    listaContainer.innerHTML = estadoVacioHTML(
      "Sin pagos registrados",
      "Los pagos que registres apareceran aqui"
    );
    return;
  }

  var html = '<div class="pg-historial__cards">';

  pagosFiltrados.forEach(function (pago, i) {
    var nombreTrabajador = pago.trabajadorNombre || (trabajadoresMap[pago.trabajadorId] ? trabajadoresMap[pago.trabajadorId].nombre : "Desconocido");
    var montoBs = formatBs(pago.monto || 0);
    var fecha = formatearFecha(pago.fecha);
    var notas = pago.notas ? escaparHTML(pago.notas) : "";

    html +=
      '<div class="pg-pago-card" style="animation-delay:' + (i * 40) + 'ms">' +
      '<div class="pg-pago-card__header">' +
      '<div class="pg-pago-card__trabajador">' + escaparHTML(nombreTrabajador) + '</div>' +
      '<div class="pg-pago-card__monto">' + montoBs + '</div>' +
      '</div>' +
      '<div class="pg-pago-card__info">' +
      '<span class="pg-pago-card__fecha">' + fecha + '</span>' +
      (notas ? '<span class="pg-pago-card__notas">' + notas + '</span>' : '') +
      '</div>' +
      '<div class="pg-pago-card__acciones">' +
      '<button class="btn btn--ghost btn--sm pg-btn-eliminar-pago" data-id="' + pago.id + '">Eliminar</button>' +
      '</div>' +
      '</div>';
  });

  html += '</div>';
  listaContainer.innerHTML = html;
}

function renderListaGastos(gastos, filtroCat, resumenContainer, listaContainer) {
  window._gastosCache = gastos;

  var gastosFiltrados = gastos.slice().sort(function (a, b) {
    return (b.fecha || "").localeCompare(a.fecha || "");
  });

  if (filtroCat !== "todas") {
    gastosFiltrados = gastosFiltrados.filter(function (g) {
      return g.cat === filtroCat;
    });
  }

  if (resumenContainer && gastosFiltrados.length > 0) {
    var totalMonto = 0;
    gastosFiltrados.forEach(function (g) { totalMonto += g.monto || 0; });
    totalMonto = Math.round(totalMonto * 100) / 100;
    var plural = gastosFiltrados.length === 1 ? "gasto" : "gastos";

    resumenContainer.innerHTML =
      '<div class="pg-historial__resumen">' +
      '<span class="pg-historial__cantidad">' + gastosFiltrados.length + ' ' + plural + '</span>' +
      '<span class="pg-historial__total">Total: Bs ' + formatNumero(totalMonto) + '</span>' +
      '</div>';
  } else if (resumenContainer) {
    resumenContainer.innerHTML = "";
  }

  if (gastosFiltrados.length === 0) {
    listaContainer.innerHTML = estadoVacioHTML(
      "Sin gastos registrados",
      "Los gastos operativos que registres apareceran aqui"
    );
    return;
  }

  var html = '<div class="pg-historial__cards">';

  gastosFiltrados.forEach(function (gasto, i) {
    var catInfo = CATEGORIAS_GASTOS.find(function (c) { return c.id === gasto.cat; });
    var catLabel = catInfo ? catInfo.label : (gasto.cat || "Sin categoria");
    var catClase = gasto.cat || "otros";
    var montoStr = formatNumero(gasto.monto || 0);
    var fecha = formatearFecha(gasto.fecha);
    var notas = gasto.notas ? escaparHTML(gasto.notas) : "";

    html +=
      '<div class="pg-gasto-card" style="animation-delay:' + (i * 40) + 'ms">' +
      '<div class="pg-gasto-card__header">' +
      '<span class="pg-gasto-card__cat pg-gasto-card__cat--' + catClase + '">' + escaparHTML(catLabel) + '</span>' +
      '<span class="pg-gasto-card__monto">Bs ' + montoStr + '</span>' +
      '</div>' +
      '<div class="pg-gasto-card__descripcion">' + escaparHTML(gasto.descripcion || "") + '</div>' +
      '<div class="pg-gasto-card__info">' +
      '<span class="pg-gasto-card__fecha">' + fecha + '</span>' +
      (notas ? '<span class="pg-gasto-card__notas">' + notas + '</span>' : '') +
      '</div>' +
      '<div class="pg-gasto-card__acciones">' +
      '<button class="btn btn--ghost btn--sm pg-btn-eliminar-gasto" data-id="' + gasto.id + '">Eliminar</button>' +
      '</div>' +
      '</div>';
  });

  html += '</div>';
  listaContainer.innerHTML = html;
}

async function confirmarEliminarPago(pagoId, pagos, trabajadoresMap, onPagoEliminado) {
  var pago = pagos.find(function (p) { return p.id === pagoId; });
  if (!pago) return;

  var nombreTrabajador = pago.trabajadorNombre || (trabajadoresMap[pago.trabajadorId] ? trabajadoresMap[pago.trabajadorId].nombre : "Desconocido");
  var montoBs = formatBs(pago.monto || 0);

  mostrarModalConfirmar(
    "Eliminar Pago",
    "Estas seguro de eliminar el pago de " + montoBs + " a " + nombreTrabajador + "? Esta accion no se puede deshacer.",
    "danger",
    async function () {
      try {
        await db.pagos.delete(pagoId);
        mostrarToast("Pago eliminado", "success");
        if (onPagoEliminado) {
          await onPagoEliminado();
        }
      } catch (err) {
        console.error("Error al eliminar pago:", err);
        mostrarToast("Error al eliminar", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

async function confirmarEliminarGasto(gastoId, gastos, onGastoEliminado) {
  var gasto = gastos.find(function (g) { return g.id === gastoId; });
  if (!gasto) return;

  var catInfo = CATEGORIAS_GASTOS.find(function (c) { return c.id === gasto.cat; });
  var catLabel = catInfo ? catInfo.label : (gasto.cat || "Sin categoria");
  var montoStr = formatNumero(gasto.monto || 0);

  mostrarModalConfirmar(
    "Eliminar Gasto",
    "Estas seguro de eliminar el gasto de Bs " + montoStr + " en " + catLabel + "? Esta accion no se puede deshacer.",
    "danger",
    async function () {
      try {
        await db.gastos.delete(gastoId);
        mostrarToast("Gasto eliminado", "success");
        if (onGastoEliminado) {
          await onGastoEliminado();
        }
      } catch (err) {
        console.error("Error al eliminar gasto:", err);
        mostrarToast("Error al eliminar", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}
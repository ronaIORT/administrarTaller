// ============================================================
// TAB HISTORIAL - Lista de pagos registrados con filtro
// por trabajador y posibilidad de eliminar pagos.
// Muestra contador de pagos y total en Bs.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "../shared.js";

// ============================================================
// FORMATEO DE FECHA - Convierte fecha ISO a DD/MM/YYYY
// ============================================================

function formatearFecha(fechaISO) {
  if (!fechaISO) return "";
  var fecha = new Date(fechaISO);
  var dia = String(fecha.getDate()).padStart(2, "0");
  var mes = String(fecha.getMonth() + 1).padStart(2, "0");
  var anio = fecha.getFullYear();
  return dia + "/" + mes + "/" + anio;
}

// ============================================================
// RENDER PRINCIPAL DEL TAB
// Usa delegacion de eventos en el contenedor exterior para
// evitar duplicar listeners al re-renderizar.
// ============================================================

export function renderTabHistorial(pagos, trabajadoresMap, container, opciones) {
  container.innerHTML = "";

  var onPagoEliminado = opciones ? opciones.onPagoEliminado : null;

  // Filtro por trabajador
  var filtroHTML =
    '<div class="pg-historial__filtro">' +
    '<select id="pg-filtro-trabajador" class="form-select">' +
    '<option value="todos">Todos los trabajadores</option>';

  var trabajadoresOrdenados = Object.values(trabajadoresMap).sort(function (a, b) {
    return a.nombre.localeCompare(b.nombre);
  });

  trabajadoresOrdenados.forEach(function (t) {
    filtroHTML += '<option value="' + t.id + '">' + escaparHTML(t.nombre) + '</option>';
  });

  filtroHTML += '</select></div>';

  container.innerHTML =
    '<div class="pg-historial">' +
    filtroHTML +
    '<div id="pg-historial-resumen"></div>' +
    '<div class="pg-historial__lista" id="pg-historial-lista"></div>' +
    '</div>';

  var filtroSelect = document.getElementById("pg-filtro-trabajador");
  filtroSelect.addEventListener("change", function () {
    renderListaPagos(pagos, trabajadoresMap, filtroSelect.value, onPagoEliminado);
  });

  // Delegacion de eventos en el contenedor exterior (solo una vez)
  container.addEventListener("click", function (e) {
    var btnEliminar = e.target.closest(".pg-btn-eliminar-pago");
    if (!btnEliminar) return;
    var pagoId = parseInt(btnEliminar.dataset.id);
    confirmarEliminarPago(pagoId, pagos, trabajadoresMap, onPagoEliminado);
  });

  renderListaPagos(pagos, trabajadoresMap, "todos", onPagoEliminado);
}

// ============================================================
// RENDER DE LISTA DE PAGOS
// Incluye resumen con contador y total en Bs.
// ============================================================

function renderListaPagos(pagos, trabajadoresMap, filtroTrabajador, onPagoEliminado) {
  var listaContainer = document.getElementById("pg-historial-lista");
  var resumenContainer = document.getElementById("pg-historial-resumen");
  if (!listaContainer) return;

  // Filtrar y ordenar por fecha descendente
  var pagosFiltrados = pagos.slice().sort(function (a, b) {
    return (b.fecha || "").localeCompare(a.fecha || "");
  });

  if (filtroTrabajador !== "todos") {
    var id = parseInt(filtroTrabajador);
    pagosFiltrados = pagosFiltrados.filter(function (p) {
      return p.trabajadorId === id;
    });
  }

  // Renderizar resumen con contador y total
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

// ============================================================
// ELIMINAR PAGO - Modal de confirmacion y eliminacion
// ============================================================

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
    }
  );
}
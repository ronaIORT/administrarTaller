// ============================================================
// TAB GASTOS - Registro y listado de gastos operativos
// Formulario para registrar gastos (hilos, aceite, repuestos,
// servicios, otros) y lista con filtro por categoria.
// Los montos se almacenan en Bolivianos (decimal).
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatNumero } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "../shared.js";

// ============================================================
// CATEGORIAS DE GASTOS
// ============================================================

var CATEGORIAS = [
  { id: "hilos", label: "Hilos" },
  { id: "aceite", label: "Aceite/Mantenimiento" },
  { id: "repuestos", label: "Repuestos" },
  { id: "servicios", label: "Servicios" },
  { id: "otros", label: "Otros" }
];

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
// ============================================================

export function renderTabGastos(gastos, container, opciones) {
  container.innerHTML = "";

  var onGastoRegistrado = opciones ? opciones.onGastoRegistrado : null;
  var onGastoEliminado = opciones ? opciones.onGastoEliminado : null;

  var html =
    '<div class="pg-gastos">' +
    renderFormularioHTML() +
    '<hr class="pg-gastos__divider">' +
    '<div class="pg-gastos__filtro">' +
    '<select id="pg-gastos-filtro-cat" class="form-select">' +
    '<option value="todas">Todas las categorias</option>';

  CATEGORIAS.forEach(function (cat) {
    html += '<option value="' + cat.id + '">' + escaparHTML(cat.label) + '</option>';
  });

  html +=
    '</select>' +
    '</div>' +
    '<div id="pg-gastos-resumen"></div>' +
    '<div class="pg-gastos__lista" id="pg-gastos-lista"></div>' +
    '</div>';

  container.innerHTML = html;

  // Fecha por defecto: hoy
  var inputFecha = document.getElementById("pg-gastos-fecha");
  var hoy = new Date();
  var fechaStr = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
  inputFecha.value = fechaStr;

  // Submit del formulario
  var form = document.getElementById("pg-gastos-form");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    var cat = document.getElementById("pg-gastos-cat").value;
    var descripcion = document.getElementById("pg-gastos-desc").value.trim();
    var montoBs = parseFloat(document.getElementById("pg-gastos-monto").value);
    var fecha = document.getElementById("pg-gastos-fecha").value;
    var notas = document.getElementById("pg-gastos-notas").value.trim();

    if (!cat) {
      mostrarToast("Selecciona una categoria", "warning");
      return;
    }

    if (!descripcion) {
      mostrarToast("Ingresa una descripcion", "warning");
      return;
    }

    if (isNaN(montoBs) || montoBs <= 0) {
      mostrarToast("Ingresa un monto mayor a 0", "warning");
      return;
    }

    if (!fecha) {
      mostrarToast("Selecciona una fecha", "warning");
      return;
    }

    try {
      await db.gastos.add({
        cat: cat,
        descripcion: descripcion,
        monto: montoBs,
        fecha: fecha,
        notas: notas
      });

      mostrarToast("Gasto registrado correctamente", "success");

      form.reset();
      inputFecha.value = fechaStr;

      if (onGastoRegistrado) {
        await onGastoRegistrado();
      }
    } catch (err) {
      console.error("Error registrando gasto:", err);
      mostrarToast("Error al registrar gasto", "error");
    }
  });

  // Filtro por categoria
  var filtroSelect = document.getElementById("pg-gastos-filtro-cat");
  filtroSelect.addEventListener("change", function () {
    renderListaGastos(gastos, filtroSelect.value, onGastoEliminado);
  });

  // Delegacion de eventos para eliminar
  container.addEventListener("click", function (e) {
    var btnEliminar = e.target.closest(".pg-btn-eliminar-gasto");
    if (!btnEliminar) return;
    var gastoId = parseInt(btnEliminar.dataset.id);
    confirmarEliminarGasto(gastoId, gastos, onGastoEliminado);
  });

  renderListaGastos(gastos, "todas", onGastoEliminado);
}

// ============================================================
// FORMULARIO HTML
// ============================================================

function renderFormularioHTML() {
  var optionsHTML = "";
  CATEGORIAS.forEach(function (cat) {
    optionsHTML += '<option value="' + cat.id + '">' + escaparHTML(cat.label) + '</option>';
  });

  return '<form id="pg-gastos-form" class="pg-gastos__form">' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-cat">Categoria</label>' +
    '<select id="pg-gastos-cat" class="form-select" required>' +
    '<option value="">Seleccionar categoria</option>' +
    optionsHTML +
    '</select>' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-desc">Descripcion</label>' +
    '<input type="text" id="pg-gastos-desc" class="form-input" placeholder="Ej: Hilo negro poliester..." required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-monto">Monto (Bs)</label>' +
    '<input type="number" id="pg-gastos-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-fecha">Fecha</label>' +
    '<input type="date" id="pg-gastos-fecha" class="form-input" required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-notas">Notas (opcional)</label>' +
    '<textarea id="pg-gastos-notas" class="form-input" rows="2" placeholder="Detalles adicionales..."></textarea>' +
    '</div>' +
    '<button type="submit" class="btn btn--accent btn--full" id="pg-btn-registrar-gasto">Registrar Gasto</button>' +
    '</form>';
}

// ============================================================
// RENDER DE LISTA DE GASTOS
// ============================================================

function renderListaGastos(gastos, filtroCat, onGastoEliminado) {
  var listaContainer = document.getElementById("pg-gastos-lista");
  var resumenContainer = document.getElementById("pg-gastos-resumen");
  if (!listaContainer) return;

  // Filtrar y ordenar por fecha descendente
  var gastosFiltrados = gastos.slice().sort(function (a, b) {
    return (b.fecha || "").localeCompare(a.fecha || "");
  });

  if (filtroCat !== "todas") {
    gastosFiltrados = gastosFiltrados.filter(function (g) {
      return g.cat === filtroCat;
    });
  }

  // Renderizar resumen
  if (resumenContainer && gastosFiltrados.length > 0) {
    var totalMonto = 0;
    gastosFiltrados.forEach(function (g) { totalMonto += g.monto || 0; });
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

  var html = '<div class="pg-gastos__cards">';

  gastosFiltrados.forEach(function (gasto, i) {
    var catInfo = CATEGORIAS.find(function (c) { return c.id === gasto.cat; });
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

// ============================================================
// ELIMINAR GASTO - Modal de confirmacion y eliminacion
// ============================================================

async function confirmarEliminarGasto(gastoId, gastos, onGastoEliminado) {
  var gasto = gastos.find(function (g) { return g.id === gastoId; });
  if (!gasto) return;

  var catInfo = CATEGORIAS.find(function (c) { return c.id === gasto.cat; });
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

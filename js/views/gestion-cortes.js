// ============================================================
// IMPORTS Y CONSTANTES DEL MODULO
// ============================================================

import { db } from "../db.js";
import { escaparHTML } from "../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "./shared.js";

/** ID del FAB flotante para crear nuevo corte */
const FAB_ID = "crear-corte-fab";

/** AbortController para cancelar event listeners al cambiar de vista */
let clickAbortControllerC = null;

/** Cache local de todos los cortes para filtrar sin consultar DB */
let todosLosCortes = [];

/** Mapa prendaId -> nombre para lookup O(1) en el render */
let prendasMapa = {};

/** Filtro activo actual: "todos" | "activo" | "terminado" | "semana" */
let filtroActivo = "todos";

/** Texto de busqueda actual */
let busquedaTexto = "";

// ============================================================
// RENDER PRINCIPAL - Vista de gestion de cortes
// Construye la barra de filtros + busqueda, el contenedor de
// lista, el FAB flotante, y carga los datos desde IndexedDB.
// ============================================================

export async function renderGestionCortes() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.add("app--sidebar");

  if (clickAbortControllerC) {
    clickAbortControllerC.abort();
    clickAbortControllerC = null;
  }
  clickAbortControllerC = new AbortController();

  filtroActivo = "todos";
  busquedaTexto = "";

  const container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  app.appendChild(container);

  container.innerHTML =
    '<section class="cortes-filter-bar">' +
    '<input type="text" id="input-buscar-corte" class="form-input" placeholder="Buscar corte..." autocomplete="off" />' +
    '<div class="filter-chips" id="filter-chips">' +
    '<button class="filter-chip active" data-filtro="todos">Todos</button>' +
    '<button class="filter-chip" data-filtro="activo">Activos</button>' +
    '<button class="filter-chip" data-filtro="terminado">Terminados</button>' +
    '<button class="filter-chip" data-filtro="semana">Semana</button>' +
    '</div>' +
    '</section>' +
    '<section aria-label="Lista de cortes" id="lista-cortes-container">' +
    '<div class="spinner"></div>' +
    '</section>';

  var inputBuscar = document.getElementById("input-buscar-corte");
  inputBuscar.addEventListener("input", function () {
    busquedaTexto = inputBuscar.value.trim();
    filtrarCortes();
  });

  var filterChips = document.getElementById("filter-chips");
  filterChips.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    filtroActivo = chip.dataset.filtro;
    filterChips.querySelectorAll(".filter-chip").forEach(function (c) {
      c.classList.remove("active");
    });
    chip.classList.add("active");
    filtrarCortes();
  });

  document.addEventListener("click", manejarClickDocumentoC, { signal: clickAbortControllerC.signal });

  var fab = document.createElement("button");
  fab.id = FAB_ID;
  fab.className = "btn btn--fab";
  fab.setAttribute("aria-label", "Crear nuevo corte");
  fab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  fab.addEventListener("click", function () {
    location.hash = "#nuevo-corte";
  }, { signal: clickAbortControllerC.signal });
  document.body.appendChild(fab);

  await cargarCortes();
}

// ============================================================
// CARGA DE DATOS - Obtiene todos los cortes y construye un
// mapa de prendaId -> nombre en una sola query batch.
// Ordena por fecha de creacion descendente (mas reciente primero).
// ============================================================

async function cargarCortes() {
  var container = document.getElementById("lista-cortes-container");
  if (!container) return;

  try {
    todosLosCortes = await db.cortes.orderBy("fechaCreacion").reverse().toArray();

    var prendaIdsUnicos = [];
    var idsVistos = {};
    todosLosCortes.forEach(function (c) {
      if (c.prendaId && !idsVistos[c.prendaId]) {
        idsVistos[c.prendaId] = true;
        prendaIdsUnicos.push(c.prendaId);
      }
    });

    prendasMapa = {};
    if (prendaIdsUnicos.length > 0) {
      var prendas = await db.prendas.where("id").anyOf(prendaIdsUnicos).toArray();
      prendas.forEach(function (p) {
        prendasMapa[p.id] = p.nombre;
      });
    }

    filtrarCortes();
  } catch (err) {
    console.error("Error cargando cortes:", err);
    container.innerHTML = estadoVacioHTML("Error al cargar", "Intenta recargar la pagina");
  }
}

// ============================================================
// FILTROS - Aplica el filtro activo y texto de busqueda
// sobre el array cacheado localmente (sin consultar DB).
// ============================================================

function filtrarCortes() {
  var cortes = todosLosCortes;

  if (filtroActivo === "activo") {
    cortes = cortes.filter(function (c) { return c.estado === "activo"; });
  } else if (filtroActivo === "terminado") {
    cortes = cortes.filter(function (c) { return c.estado === "terminado"; });
  } else if (filtroActivo === "semana") {
    var haceUnaSemana = new Date();
    haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);
    cortes = cortes.filter(function (c) {
      return c.fechaCreacion && new Date(c.fechaCreacion) >= haceUnaSemana;
    });
  }

  if (busquedaTexto) {
    var texto = busquedaTexto.toLowerCase();
    cortes = cortes.filter(function (c) {
      return c.nombreCorte && c.nombreCorte.toLowerCase().indexOf(texto) !== -1;
    });
  }

  renderListaCortes(cortes);
}

// ============================================================
// CALCULO DE PROGRESO - Disenado para Fase 5
// En Fase 4: terminado=100%, activo=0% (no hay asignaciones).
// En Fase 5: calcula real = sum(asignaciones.cantidad) / sum(unidadesTotales).
// ============================================================

function calcularProgreso(corte) {
  if (corte.estado === "terminado") return 100;
  if (!corte.tareas || corte.tareas.length === 0) return 0;
  var total = 0;
  var completado = 0;
  corte.tareas.forEach(function (t) {
    total += t.unidadesTotales || 0;
    if (t.asignaciones) {
      t.asignaciones.forEach(function (a) {
        completado += a.cantidad || 0;
      });
    }
  });
  if (total === 0) return 0;
  return Math.round((completado / total) * 100);
}

// ============================================================
// RENDER DE LISTA - Construye el HTML de las cards de corte
// Cada card muestra: prenda, badge de estado, nombre, progreso,
// tallas (solo nombres), cantidad, fecha de inicio y botones.
// ============================================================

function renderListaCortes(cortes) {
  var container = document.getElementById("lista-cortes-container");
  if (!container) return;

  if (cortes.length === 0) {
    var msj = "Sin cortes";
    var sub = "Crea tu primer corte usando el boton +";
    if (filtroActivo !== "todos" || busquedaTexto) {
      msj = "Sin resultados";
      sub = "Prueba con otros filtros o terminos de busqueda";
    }
    container.innerHTML = estadoVacioHTML(msj, sub);
    return;
  }

  container.innerHTML =
    '<div class="cortes-lista" role="list">' +
    cortes.map(function (c, i) {
      var nombrePrenda = escaparHTML(prendasMapa[c.prendaId] || "Sin prenda");
      var nombreCorte = escaparHTML(c.nombreCorte || "Sin nombre");
      var progreso = calcularProgreso(c);
      var esTerminado = c.estado === "terminado";

      var tallasTexto = "";
      if (c.tallas && c.tallas.length > 0) {
        tallasTexto = c.tallas.map(function (t) {
          return escaparHTML(t.talla);
        }).join(" ");
      }

      var fecha = c.fechaCreacion ? formatearFecha(c.fechaCreacion) : "";

      var badgeEstado = esTerminado
        ? '<span class="badge badge--success">Terminado</span>'
        : '<span class="badge badge--warning">Por terminar</span>';

      return '<div class="corte-card" data-id="' + c.id + '" role="listitem" style="animation-delay:' + (i * 50) + 'ms">' +
        '<div class="corte-card__header">' +
        '<span class="corte-card__prenda">' + nombrePrenda + '</span>' +
        badgeEstado +
        '</div>' +
        '<div class="corte-card__nombre-row">' +
        '<span class="corte-card__nombre">' + nombreCorte + '</span>' +
        '</div>' +
        '<div class="corte-card__body">' +
        '<div class="progress-bar">' +
        '<div class="progress-bar__fill' + (esTerminado ? ' progress-bar__fill--completo' : '') + '" style="width:' + progreso + '%"></div>' +
        '</div>' +
        '<div class="corte-card__info">' +
        (tallasTexto ? '<span class="corte-card__tallas">' + tallasTexto + '</span>' : '') +
        '<span class="corte-card__cantidad">' + (c.cantidadPrendas || 0) + ' prendas</span>' +
        '<span class="corte-card__fecha">Inicio ' + fecha + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="corte-card__footer">' +
        '<button class="btn btn--outline btn--sm btn-administrar-corte" data-id="' + c.id + '">Administrar</button>' +
        '<button class="btn btn--ghost btn--sm btn-eliminar-corte" data-id="' + c.id + '" data-nombre="' + escaparHTML(c.nombreCorte || "") + '">Eliminar</button>' +
        '</div>' +
        '</div>';
    }).join("") +
    '</div>';
}

// ============================================================
// FORMATEO DE FECHA - Convierte fecha ISO a DD/MM/YYYY
// ============================================================

function formatearFecha(fechaISO) {
  var fecha = new Date(fechaISO);
  var dia = String(fecha.getDate()).padStart(2, "0");
  var mes = String(fecha.getMonth() + 1).padStart(2, "0");
  var anio = fecha.getFullYear();
  return dia + "/" + mes + "/" + anio;
}

// ============================================================
// CLICK HANDLER - Delegacion de eventos en documento
// Maneja clicks en botones Administrar (-> #detalle-corte/:id)
// y Eliminar (-> modal de confirmacion con cascade delete).
// ============================================================

function manejarClickDocumentoC(e) {
  var fueAdministrar = e.target.closest(".btn-administrar-corte");
  var fueEliminar = e.target.closest(".btn-eliminar-corte");

  if (fueAdministrar) {
    var id = parseInt(fueAdministrar.dataset.id);
    location.hash = "#administrar-tareas/" + id;
    return;
  }
  if (fueEliminar) {
    var idDel = parseInt(fueEliminar.dataset.id);
    var nombreDel = fueEliminar.dataset.nombre || "este corte";
    confirmarEliminarCorte(idDel, nombreDel);
    return;
  }
}

// ============================================================
// CASCADE DELETE - Elimina el corte y todos sus pagos asociados
// IndexedDB no tiene FK constraints, el cascade se hace manual.
// ============================================================

async function confirmarEliminarCorte(id, nombre) {
  mostrarModalConfirmar(
    "Eliminar Corte",
    "Estas seguro de eliminar \"" + nombre + "\"? Tambien se eliminaran los pagos asociados. Esta accion no se puede deshacer.",
    "danger",
    async function () {
      try {
        await db.pagos.where("corteId").equals(id).delete();
        await db.cortes.delete(id);
        mostrarToast("Corte eliminado", "success");
        await cargarCortes();
      } catch (err) {
        console.error("Error al eliminar corte:", err);
        mostrarToast("Error al eliminar", "error");
      }
    }
  );
}

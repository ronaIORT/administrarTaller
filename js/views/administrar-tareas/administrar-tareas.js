// ============================================================
// ADMINISTRAR TAREAS - Orquestador de la vista de detalle de corte
// Gestiona la carga de datos, navegacion entre 5 tabs con swipe,
// y delega el renderizado a cada modulo de tab.
// La ruta es #administrar-tareas/:id y oculta el bottom-nav.
// ============================================================

import { db } from "../../db.js";
import {
  crearHeader,
  mostrarToast,
  estadoVacioHTML,
  agregarSwipeAnimado,
} from "../shared.js";
import { renderTabResumen } from "./tab-resumen.js";
import { renderTabCorte } from "./tab-corte.js";
import { renderTabTrabajador } from "./tab-trabajador.js";
import { renderTabEditar } from "./tab-editar.js";
import { renderTabAsignar } from "./tab-asignar.js";

// ============================================================
// ESTADO DEL MODULO
// ============================================================

/** Corte actual cargado desde IndexedDB */
let corteActual = null;
/** Prenda asociada al corte (o null si no tiene) */
let prendaActual = null;
/** Mapa trabajadorId -> nombre para lookups O(1) */
let trabajadoresMap = {};
/** ID del tab actualmente activo */
let tabActivo = "resumen";
/** AbortController para limpiar listeners al cambiar de vista */
let clickAbortControllerAT = null;
/** Referencia al elemento DOM del contenido del tab */
let tabContentEl = null;
/** Referencia al contenedor de tabs para actualizar al recargar */
let tabsWrapperEl = null;
/** Referencia al header para actualizar titulo si es necesario */
let headerEl = null;

/** Definicion de los 5 tabs con id y etiqueta visible */
const TABS = [
  { id: "resumen", label: "Info" },
  { id: "corte", label: "Corte" },
  { id: "trabajador", label: "Trabajador" },
  { id: "editar", label: "Editar" },
  { id: "asignar", label: "Asignar" },
];

// ============================================================
// RENDER PRINCIPAL - Punto de entrada desde el router
// ============================================================

export async function renderAdministrarTareas(corteId) {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.remove("app--sidebar");

  // Cancelar listeners de vista anterior
  if (clickAbortControllerAT) {
    clickAbortControllerAT.abort();
    clickAbortControllerAT = null;
  }
  clickAbortControllerAT = new AbortController();

  tabActivo = "resumen";
  corteActual = null;
  prendaActual = null;
  trabajadoresMap = {};

  // Header con boton volver a gestion de cortes
  headerEl = crearHeader("Administrar Tareas", "#gestion-cortes");
  app.appendChild(headerEl);

  const btnVolver = headerEl.querySelector("[data-nav-back]");
  if (btnVolver) {
    btnVolver.addEventListener("click", function (e) {
      e.preventDefault();
      location.hash = "#gestion-cortes";
    });
  }

  const container = document.createElement("div");
  container.className = "app-container";
  app.appendChild(container);

  // Spinner mientras carga datos
  container.innerHTML = '<div class="spinner" style="margin-top:60px;"></div>';

  // Cargar datos del corte, prenda y trabajadores
  try {
    corteActual = await db.cortes.get(corteId);
    if (!corteActual) {
      container.innerHTML = estadoVacioHTML(
        "Corte no encontrado",
        "El corte solicitado no existe o fue eliminado",
      );
      return;
    }

    if (corteActual.prendaId) {
      prendaActual = await db.prendas.get(corteActual.prendaId);
    } else {
      prendaActual = null;
    }

    const trabajadores = await db.trabajadores.toArray();
    trabajadoresMap = {};
    trabajadores.forEach(function (t) {
      trabajadoresMap[t.id] = t.nombre;
    });
  } catch (err) {
    console.error("Error cargando corte:", err);
    container.innerHTML = estadoVacioHTML(
      "Error al cargar",
      "No se pudo cargar la informacion del corte",
    );
    return;
  }

  // Construir UI: wrapper de tabs + area de contenido con swipe
  container.innerHTML =
    '<nav class="at-tabs-wrapper" role="tablist"></nav>' +
    '<main class="at-tab-content" id="at-tab-content"></main>';

  tabsWrapperEl = container.querySelector(".at-tabs-wrapper");
  tabContentEl = document.getElementById("at-tab-content");

  // Construir botones de tabs manualmente (los estilos sticky y layout
  // requieren control fino del wrapper, no usamos crearTabs directamente).
  renderTabsButtons();

  renderTabActivo();
}

// ============================================================
// RENDER DE BOTONES DE TAB - Reconstruye la UI de tabs
// Se usa tanto en la carga inicial como al recargar datos.
// ============================================================

function renderTabsButtons() {
  if (!tabsWrapperEl) return;
  tabsWrapperEl.innerHTML = "";

  const innerContainer = document.createElement("div");
  innerContainer.className = "tabs-container";
  innerContainer.setAttribute("role", "tablist");

  TABS.forEach(function (tab) {
    const btn = document.createElement("button");
    btn.className = "tab" + (tab.id === tabActivo ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", tab.id === tabActivo ? "true" : "false");
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;

    btn.addEventListener("click", function () {
      onCambioTab(tab.id);
      actualizarTabActivoUI(tab.id);
    });

    innerContainer.appendChild(btn);
  });

  tabsWrapperEl.appendChild(innerContainer);

  // Re-agregar swipe al contenido
  if (tabContentEl) {
    agregarSwipeAContenido();
  }
}

// ============================================================
// SWIPE HORIZONTAL ANIMADO en el area de contenido
// Drag-follow: el contenido sigue el dedo y al soltar entra
// animado el tab nuevo o rebota si no supera el umbral.
// ============================================================

function agregarSwipeAContenido() {
  if (!tabContentEl) return;

  agregarSwipeAnimado(tabContentEl, {
    getIndiceActivo: function () {
      return TABS.findIndex(function (t) {
        return t.id === tabActivo;
      });
    },
    getTotalTabs: function () {
      return TABS.length;
    },
    onCambio: function (nuevoIndice) {
      const tabId = TABS[nuevoIndice].id;
      onCambioTab(tabId);
      actualizarTabActivoUI(tabId);
    },
  });
}

// ============================================================
// CAMBIO DE TAB - Callback del sistema de tabs
// ============================================================

function onCambioTab(tabId) {
  if (tabId === tabActivo) return;
  tabActivo = tabId;
  renderTabActivo();
}

function actualizarTabActivoUI(tabId) {
  if (!tabsWrapperEl) return;
  const buttons = tabsWrapperEl.querySelectorAll(".tab");
  buttons.forEach(function (btn) {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

// ============================================================
// RENDER DEL TAB ACTIVO - Delega al modulo correspondiente
// Cada tab recibe: corte, contenedor DOM, y opciones extras.
// mantenerFiltro conserva el filtro de componente del tab Corte
// al re-renderizar tras una mutacion.
// ============================================================

function renderTabActivo(mantenerFiltro) {
  if (!tabContentEl || !corteActual) return;

  // Limpiar FABs flotantes de tabs anteriores
  document.getElementById("at-editar-fab-container")?.remove();
  document.getElementById("at-corte-fab-container")?.remove();
  document.getElementById("at-asignar-fab-container")?.remove();

  switch (tabActivo) {
    case "resumen":
      renderTabResumen(corteActual, tabContentEl, {
        prenda: prendaActual,
        trabajadoresMap: trabajadoresMap,
        onDataChange: recargarCorte,
        onFinalizar: function () {
          return recargarCorte();
        },
      });
      break;
    case "corte":
      renderTabCorte(corteActual, tabContentEl, {
        trabajadoresMap: trabajadoresMap,
        onCambiarTab: function (id) {
          onCambioTab(id);
          actualizarTabActivoUI(id);
        },
        onFinalizar: function () {
          return recargarCorte();
        },
        onDataChange: recargarCorte,
      }, mantenerFiltro);
      break;
    case "trabajador":
      renderTabTrabajador(corteActual, tabContentEl, {
        trabajadoresMap: trabajadoresMap,
        onDataChange: recargarCorte,
      });
      break;
    case "editar":
      renderTabEditar(corteActual, tabContentEl, {
        prenda: prendaActual,
        trabajadoresMap: trabajadoresMap,
        onDataChange: recargarCorte,
      }, mantenerFiltro);
      break;
    case "asignar":
      renderTabAsignar(corteActual, tabContentEl, {
        trabajadoresMap: trabajadoresMap,
        onDataChange: recargarCorte,
      });
      break;
  }
}

// ============================================================
// RECARGA DE DATOS - Despues de una mutacion (editar, asignar)
// vuelve a cargar el corte desde IndexedDB y re-renderiza.
// ============================================================

async function recargarCorte() {
  if (!corteActual) return;
  try {
    corteActual = await db.cortes.get(corteActual.id);
    if (!corteActual) return;
    if (corteActual.prendaId) {
      prendaActual = await db.prendas.get(corteActual.prendaId);
    }
    renderTabActivo(true);
  } catch (err) {
    console.error("Error recargando corte:", err);
    mostrarToast("Error al actualizar datos", "error");
  }
}

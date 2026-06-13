// ============================================================
// GESTION PAGOS - Orquestador de la vista de pagos y gastos
// Gestiona 3 tabs swipeables: Pagos, Gastos, Historial.
// Es una ruta principal del bottom-nav (#gestion-pagos).
// ============================================================

import { db } from "../../db.js";
import { mostrarToast, estadoVacioHTML } from "../shared.js";
import { renderTabPagos } from "./tab-pagos.js";
import { renderTabGastos } from "./tab-gastos.js";
import { renderTabHistorial } from "./tab-historial.js";

// ============================================================
// ESTADO DEL MODULO
// ============================================================

/** ID del tab actualmente activo */
let tabActivo = "pagos";
/** AbortController para limpiar listeners al cambiar de vista */
let clickAbortControllerGP = null;
/** Referencia al elemento DOM del contenido del tab */
let tabContentEl = null;
/** Referencia al contenedor de tabs */
let tabsWrapperEl = null;
/** Cache de trabajadores para lookups O(1) */
let trabajadoresMap = {};
/** Cache de todos los cortes */
let cortesCache = [];
/** Mapa corteId -> corte para lookups O(1) */
let cortesMap = {};
/** Cache de todos los pagos */
let pagosCache = [];
/** Cache de todos los gastos */
let gastosCache = [];

/** Definicion de los 3 tabs */
const TABS = [
  { id: "pagos", label: "Pagos" },
  { id: "gastos", label: "Gastos" },
  { id: "historial", label: "Historial" },
];

// ============================================================
// RENDER PRINCIPAL - Punto de entrada desde el router
// ============================================================

export async function renderGestionPagos() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.add("app--sidebar");

  // Cancelar listeners de vista anterior
  if (clickAbortControllerGP) {
    clickAbortControllerGP.abort();
    clickAbortControllerGP = null;
  }
  clickAbortControllerGP = new AbortController();

  tabActivo = "pagos";
  trabajadoresMap = {};
  cortesCache = [];
  cortesMap = {};
  pagosCache = [];
  gastosCache = [];

  const container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  app.appendChild(container);

  // Spinner mientras carga datos
  container.innerHTML = '<div class="spinner" style="margin-top:60px;"></div>';

  // Cargar datos iniciales
  try {
    await recargarDatos();
  } catch (err) {
    console.error("Error cargando datos de pagos:", err);
    container.innerHTML = estadoVacioHTML("Error al cargar", "No se pudieron cargar los datos");
    return;
  }

  // Construir UI: wrapper de tabs + area de contenido con swipe
  container.innerHTML =
    '<nav class="pagos-tabs-wrapper" role="tablist"></nav>' +
    '<main class="pagos-tab-content" id="pagos-tab-content"></main>';

  tabsWrapperEl = container.querySelector(".pagos-tabs-wrapper");
  tabContentEl = document.getElementById("pagos-tab-content");

  renderTabsButtons();
  renderTabActivo();
}

// ============================================================
// RECARGA DE DATOS - Obtiene todos los datos de la BD
// ============================================================

async function recargarDatos() {
  try {
    const trabajadores = await db.trabajadores.toArray();
    trabajadoresMap = {};
    trabajadores.forEach(function (t) {
      trabajadoresMap[t.id] = t.nombre;
    });

    cortesCache = await db.cortes.toArray();
    cortesMap = {};
    cortesCache.forEach(function (c) { cortesMap[c.id] = c; });
    pagosCache = await db.pagos.toArray();
    gastosCache = await db.gastos.toArray();
  } catch (err) {
    console.error("Error recargando datos:", err);
    throw err;
  }
}

// ============================================================
// RENDER DE BOTONES DE TAB
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

  if (tabContentEl) {
    agregarSwipeAContenido();
  }
}

// ============================================================
// SWIPE HORIZONTAL
// ============================================================

function agregarSwipeAContenido() {
  if (!tabContentEl) return;

  if (tabContentEl._swipeHandler) {
    tabContentEl.removeEventListener("touchstart", tabContentEl._swipeHandler.start);
    tabContentEl.removeEventListener("touchend", tabContentEl._swipeHandler.end);
  }

  let touchStartX = 0;
  let touchStartY = 0;

  const onStart = function (e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  };

  const onEnd = function (e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const currentIdx = TABS.findIndex(function (t) { return t.id === tabActivo; });
      let newIdx = currentIdx;
      if (dx < -50 && currentIdx < TABS.length - 1) {
        newIdx = currentIdx + 1;
      } else if (dx > 50 && currentIdx > 0) {
        newIdx = currentIdx - 1;
      }
      if (newIdx !== currentIdx) {
        onCambioTab(TABS[newIdx].id);
        actualizarTabActivoUI(TABS[newIdx].id);
      }
    }
  };

  tabContentEl.addEventListener("touchstart", onStart, { passive: true });
  tabContentEl.addEventListener("touchend", onEnd, { passive: true });

  tabContentEl._swipeHandler = { start: onStart, end: onEnd };
}

// ============================================================
// CAMBIO DE TAB
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
// RENDER DEL TAB ACTIVO
// ============================================================

function renderTabActivo(preservarEstadoFiltros) {
  if (!tabContentEl) return;

  document.getElementById("pagos-fab-container")?.remove();
  document.getElementById("pagos-historial-fab-container")?.remove();

  switch (tabActivo) {
    case "pagos":
      renderTabPagos(tabContentEl, {
        trabajadoresMap: trabajadoresMap,
        cortes: cortesCache,
        cortesMap: cortesMap,
        pagos: pagosCache,
        onDataChange: recargarYRender,
        preservarEstadoFiltros: !!preservarEstadoFiltros,
      });
      break;
    case "gastos":
      renderTabGastos(tabContentEl, {
        onDataChange: recargarYRender,
      });
      break;
    case "historial":
      renderTabHistorial(tabContentEl, {
        pagos: pagosCache,
        gastos: gastosCache,
        trabajadoresMap: trabajadoresMap,
        cortesMap: cortesMap,
        onDataChange: recargarYRender,
      });
      break;
  }
}

// ============================================================
// RECARGAR Y RERENDERIZAR - Tras mutaciones
// ============================================================

async function recargarYRender() {
  try {
    await recargarDatos();
    renderTabActivo(true);
  } catch (err) {
    console.error("Error recargando datos:", err);
    mostrarToast("Error al actualizar datos", "error");
  }
}

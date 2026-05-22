// ============================================================
// GESTION DE PAGOS - Vista principal con 3 tabs
// Tab Resumen: saldos por trabajador (filtrable por estado de corte)
// Tab Registrar: formulario de pago global por trabajador
// Tab Historial: lista de pagos con filtro y eliminacion
// Ruta: #historial-pagos (bottom-nav visible)
// ============================================================

import { db } from "../db.js";
import { mostrarToast, estadoVacioHTML } from "./shared.js";
import { renderTabResumen } from "./gestion-pagos/tab-resumen.js";
import { renderTabRegistrar } from "./gestion-pagos/tab-registrar.js";
import { renderTabHistorial } from "./gestion-pagos/tab-historial.js";

// ============================================================
// ESTADO DEL MODULO
// ============================================================

/** Todos los pagos cargados desde IndexedDB */
let pagos = [];
/** Todos los cortes cargados desde IndexedDB */
let cortes = [];
/** Mapa trabajadorId -> objeto trabajador para lookups O(1) */
let trabajadoresMap = {};
/** Array de trabajadores para selects */
let trabajadoresLista = [];
/** ID del tab actualmente activo */
let tabActivo = "resumen";
/** Referencia al elemento DOM del contenido del tab */
let tabContentEl = null;
/** Referencia al contenedor de tabs */
let tabsWrapperEl = null;
/** Trabajador preseleccionado desde el tab Resumen */
let trabajadorPreseleccionado = null;

/** Definicion de los 3 tabs */
const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "registrar", label: "Registrar" },
  { id: "historial", label: "Historial" },
];

// ============================================================
// RENDER PRINCIPAL - Punto de entrada desde el router
// Sin header: usa app-container--no-header
// ============================================================

export async function renderHistorialPagos() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.remove("app--sidebar");

  tabActivo = "resumen";
  pagos = [];
  cortes = [];
  trabajadoresMap = {};
  trabajadoresLista = [];
  trabajadorPreseleccionado = null;

  const container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  app.appendChild(container);

  container.innerHTML = '<div class="spinner" style="margin-top:60px;"></div>';

  try {
    const [pagosDB, cortesDB, trabajadoresDB] = await Promise.all([
      db.pagos.toArray(),
      db.cortes.toArray(),
      db.trabajadores.toArray(),
    ]);

    pagos = pagosDB;
    cortes = cortesDB;
    trabajadoresLista = trabajadoresDB;
    trabajadoresMap = {};
    trabajadoresLista.forEach(function (t) {
      trabajadoresMap[t.id] = t;
    });
  } catch (err) {
    console.error("Error cargando datos de pagos:", err);
    container.innerHTML = estadoVacioHTML(
      "Error al cargar",
      "No se pudo cargar la informacion de pagos"
    );
    return;
  }

  container.innerHTML =
    '<nav class="pg-tabs-wrapper" role="tablist"></nav>' +
    '<main class="pg-tab-content" id="pg-tab-content"></main>';

  tabsWrapperEl = container.querySelector(".pg-tabs-wrapper");
  tabContentEl = document.getElementById("pg-tab-content");

  renderTabsButtons();
  renderTabActivo();
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
// SWIPE HORIZONTAL en el area de contenido
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
      const currentIdx = TABS.findIndex(function (t) {
        return t.id === tabActivo;
      });
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

function renderTabActivo() {
  if (!tabContentEl) return;

  switch (tabActivo) {
    case "resumen":
      renderTabResumen(pagos, cortes, trabajadoresMap, trabajadoresLista, tabContentEl, {
        onPagarTrabajador: function (trabajadorId) {
          trabajadorPreseleccionado = trabajadorId;
          onCambioTab("registrar");
          actualizarTabActivoUI("registrar");
        },
        filtroEstado: "todos",
      });
      break;
    case "registrar":
      renderTabRegistrar(pagos, cortes, trabajadoresMap, trabajadoresLista, tabContentEl, {
        trabajadorPreseleccionado: trabajadorPreseleccionado,
        onPagoRegistrado: recargarDatos,
      });
      trabajadorPreseleccionado = null;
      break;
    case "historial":
      renderTabHistorial(pagos, trabajadoresMap, tabContentEl, {
        onPagoEliminado: recargarDatos,
      });
      break;
  }
}

// ============================================================
// RECARGA DE DATOS - Despues de una mutacion
// ============================================================

async function recargarDatos() {
  try {
    const [pagosDB, cortesDB, trabajadoresDB] = await Promise.all([
      db.pagos.toArray(),
      db.cortes.toArray(),
      db.trabajadores.toArray(),
    ]);

    pagos = pagosDB;
    cortes = cortesDB;
    trabajadoresLista = trabajadoresDB;
    trabajadoresMap = {};
    trabajadoresLista.forEach(function (t) {
      trabajadoresMap[t.id] = t;
    });

    renderTabActivo();
  } catch (err) {
    console.error("Error recargando datos:", err);
    mostrarToast("Error al actualizar datos", "error");
  }
}
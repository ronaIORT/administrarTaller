// ============================================================
// GESTION DE PAGOS - Vista principal con 3 tabs swipeables
// Tab Pagos: saldos por trabajador (filtro: Finalizados/Activos/Todos)
// Tab Gastos: formulario de registro de gastos operativos
// Tab Historial: vista unificada de pagos y gastos con filtro
// Ruta: #historial-pagos (bottom-nav visible)
// ============================================================

import { db } from "../db.js";
import { mostrarToast, estadoVacioHTML } from "./shared.js";
import { renderTabPagos } from "./gestion-pagos/tab-pagos.js";
import { renderTabGastos } from "./gestion-pagos/tab-gastos.js";
import { renderTabHistorial } from "./gestion-pagos/tab-historial.js";

var pagos = [];
var cortes = [];
var trabajadoresMap = {};
var trabajadoresLista = [];
var tabActivo = "pagos";
var tabContentEl = null;
var tabsWrapperEl = null;
var gastos = [];

var TABS = [
  { id: "pagos", label: "Pagos" },
  { id: "gastos", label: "Gastos" },
  { id: "historial", label: "Historial" },
];

export async function renderHistorialPagos() {
  var app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.remove("app--sidebar");

  tabActivo = "pagos";
  pagos = [];
  cortes = [];
  trabajadoresMap = {};
  trabajadoresLista = [];
  gastos = [];

  var container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  app.appendChild(container);

  container.innerHTML = '<div class="spinner" style="margin-top:60px;"></div>';

  try {
    var results = await Promise.all([
      db.pagos.toArray(),
      db.cortes.toArray(),
      db.trabajadores.toArray(),
      db.gastos.toArray(),
    ]);

    pagos = results[0];
    cortes = results[1];
    trabajadoresLista = results[2];
    gastos = results[3];
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

function renderTabsButtons() {
  if (!tabsWrapperEl) return;
  tabsWrapperEl.innerHTML = "";

  var innerContainer = document.createElement("div");
  innerContainer.className = "tabs-container";
  innerContainer.setAttribute("role", "tablist");

  TABS.forEach(function (tab) {
    var btn = document.createElement("button");
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

function agregarSwipeAContenido() {
  if (!tabContentEl) return;

  if (tabContentEl._swipeHandler) {
    tabContentEl.removeEventListener("touchstart", tabContentEl._swipeHandler.start);
    tabContentEl.removeEventListener("touchend", tabContentEl._swipeHandler.end);
    tabContentEl._swipeHandler = null;
  }

  var touchStartX = 0;
  var touchStartY = 0;

  var onStart = function (e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  };

  var onEnd = function (e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      var currentIdx = TABS.findIndex(function (t) {
        return t.id === tabActivo;
      });
      var newIdx = currentIdx;
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

function onCambioTab(tabId) {
  if (tabId === tabActivo) return;
  tabActivo = tabId;
  renderTabActivo();
}

function actualizarTabActivoUI(tabId) {
  if (!tabsWrapperEl) return;
  var buttons = tabsWrapperEl.querySelectorAll(".tab");
  buttons.forEach(function (btn) {
    var isActive = btn.dataset.tab === tabId;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function renderTabActivo() {
  if (!tabContentEl) return;

  switch (tabActivo) {
    case "pagos":
      renderTabPagos(pagos, cortes, trabajadoresMap, trabajadoresLista, tabContentEl, {
        onPagoRegistrado: recargarDatos,
        filtroEstado: "terminado",
      });
      break;
    case "gastos":
      renderTabGastos(gastos, tabContentEl, {
        onGastoRegistrado: recargarDatos,
      });
      break;
    case "historial":
      renderTabHistorial(pagos, gastos, trabajadoresMap, tabContentEl, {
        onPagoEliminado: recargarDatos,
        onGastoEliminado: recargarDatos,
      });
      break;
  }
}

async function recargarDatos() {
  try {
    var results = await Promise.all([
      db.pagos.toArray(),
      db.cortes.toArray(),
      db.trabajadores.toArray(),
      db.gastos.toArray(),
    ]);

    pagos = results[0];
    cortes = results[1];
    trabajadoresLista = results[2];
    gastos = results[3];
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
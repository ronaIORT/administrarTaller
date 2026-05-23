import { db } from "./db.js";
import { escaparHTML } from "./utils.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderGestionTrabajadores } from "./views/gestion-trabajadores.js";
import { renderGestionPrendas, renderFormPrenda } from "./views/gestion-prendas.js";
import { renderGestionCortes } from "./views/gestion-cortes.js";
import { renderNuevoCorte } from "./views/nuevo-corte.js";
import { renderAdministrarTareas } from "./views/administrar-tareas/administrar-tareas.js";
import { renderHistorialPagos } from "./views/gestion-pagos.js";

// ============================================================
// RUTAS - Mapeo de hash URL a etiquetas de navegación
// ============================================================

const RUTA_A_NAV = {
  "#dashboard": "inicio",
  "#gestion-cortes": "cortes",
  "#gestion-prendas": "prendas",
  "#historial-pagos": "pagos",
  "#gestion-trabajadores": "personal",
};

// ============================================================
// INICIALIZACIÓN - Se ejecuta cuando el DOM está listo
// Registra el Service Worker y carga la vista inicial.
// ============================================================

function init() {
  registrarServiceWorker();
  cargarVista(location.hash || "#dashboard");
  window.addEventListener("hashchange", () => {
    cargarVista(location.hash);
  });
}

function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("service-worker.js")
    .then((reg) => {
      console.log("SW registrado:", reg.scope);

      // Detectar actualización pendiente (SW en espera)
      if (reg.waiting) {
        mostrarBannerActualizacion();
      }

      // Escuchar nueva actualización
      reg.addEventListener("updatefound", function () {
        const newSW = reg.installing;
        if (!newSW) return;

        newSW.addEventListener("statechange", function () {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            console.log("[SW] Nueva versión lista para activar");
            mostrarBannerActualizacion();
          }
        });
      });
    })
    .catch((err) => console.error("SW error:", err));

  // También escuchar cambios de estado via controllerchange
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    console.log("[SW] Controller cambiado, recargando...");
    window.location.reload();
  });
}

// ============================================================
// BANNER DE ACTUALIZACIÓN - Se muestra cuando hay nueva versión
// del Service Worker disponible. El usuario hace clic en
// "Recargar" para aplicar la actualización.
// ============================================================

function mostrarBannerActualizacion() {
  // Evitar duplicados
  if (document.querySelector(".sw-update-banner")) return;

  const banner = document.createElement("div");
  banner.className = "sw-update-banner";
  banner.innerHTML =
    '<span class="sw-update-banner__texto">Nueva versión disponible</span>' +
    '<button class="sw-update-banner__btn" id="btn-recargar-sw">Recargar</button>';

  banner.querySelector("#btn-recargar-sw").addEventListener("click", function () {
    banner.remove();
    // Forzar activación del SW en espera
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      });
    }
  });

  document.body.appendChild(banner);
}

// ============================================================
// ROUTER HASH - Carga vistas basadas en la URL
// Cada ruta es un case en el switch que renderiza el componente.
// Las sub-rutas (#editar-prenda/1) se detectan con startsWith.
// ============================================================

async function cargarVista(ruta) {
  ruta = ruta || "#dashboard";
  const app = document.getElementById("app");
  if (!app) return;

  // Limpiar contenedores de FABs (Floating Action Buttons)
  // de vistas anteriores antes de renderizar la nueva vista.
  document.getElementById("prendas-fab-container")?.remove();
  document.getElementById("tareas-fab-container")?.remove();
  document.getElementById("trabajadores-fab-container")?.remove();
  document.getElementById("cortes-fab-container")?.remove();
  document.getElementById("crear-corte-fab")?.remove();
  document.getElementById("nc-tareas-fab-container")?.remove();
  document.getElementById("at-editar-fab-container")?.remove();
  document.getElementById("at-asignar-fab-container")?.remove();

  if (ruta === "#dashboard") {
    await renderDashboard();
  } else if (ruta === "#nuevo-corte") {
    await renderNuevoCorte();
  } else if (ruta.startsWith("#administrar-tareas/")) {
    const id = parseInt(ruta.split("/")[1]);
    await renderAdministrarTareas(id);
  } else if (ruta === "#gestion-cortes") {
    await renderGestionCortes();
  } else if (ruta === "#gestion-prendas") {
    await renderGestionPrendas();
  } else if (ruta === "#historial-pagos") {
    await renderHistorialPagos();
  } else if (ruta === "#gestion-trabajadores") {
    await renderGestionTrabajadores();
  } else if (ruta === "#nueva-prenda") {
    await renderFormPrenda(null);
  } else if (ruta.startsWith("#editar-prenda/")) {
    const id = parseInt(ruta.split("/")[1]);
    await renderFormPrenda(id);
  } else {
    app.innerHTML = '<div class="app-container"><div class="empty-state"><p class="empty-state__text">Pagina no encontrada</p></div></div>';
  }

  actualizarNav(ruta);
}

// Placeholder para páginas no implementadas aún.
// Muestra un icono y descripción en lugar de contenido real.
function renderPlaceholder(container, titulo, descripcion) {
  const tituloSeguro = escaparHTML(titulo);
  const descripcionSegura = escaparHTML(descripcion);

  container.innerHTML =
    '<div class="app-container">' +
    '<div class="empty-state" style="padding-top:60px;">' +
    '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-primary);opacity:0.4;margin-bottom:16px;">' +
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' +
    "</svg>" +
    '<h2 class="empty-state__text" style="font-size:var(--font-size-xl);color:var(--color-text);font-weight:var(--font-weight-semibold);">Taller de Costura</h2>' +
    '<p class="empty-state__subtext" style="margin-top:4px;">' +
    tituloSeguro +
    "</p>" +
    '<p class="empty-state__subtext" style="margin-top:2px;font-size:var(--font-size-sm);">' +
    descripcionSegura +
    "</p>" +
    "</div>" +
    "</div>";
}

// ============================================================
// NAVEGACIÓN INFERIOR - Bottom nav bar
// Se oculta en sub-vistas profundas (#ver-prenda/1) y se muestra
// en rutas principales. Solo existe una instancia (singleton).
// ============================================================

function actualizarNav(ruta) {
  const nav = crearBottomNav();
  if (!nav) return;

  // Ocultar nav en sub-vistas profundas y formularios
  const esSubVista = (ruta.includes("/") && ruta !== "#dashboard") ||
    ruta === "#nuevo-corte" || ruta === "#nueva-prenda";
  nav.classList.toggle("hidden", esSubVista);

  // Marcar body para que CSS pueda resetear el offset del sidebar en subvistas
  document.body.classList.toggle("no-sidebar", esSubVista);

  const iconoActivo = RUTA_A_NAV[ruta];
  const items = nav.querySelectorAll(".nav-item");
  items.forEach((item) => {
    item.classList.toggle("active", item.dataset.nav === iconoActivo);
  });
}

function crearBottomNav() {
  let existing = document.querySelector(".bottom-nav");
  // Singleton: si ya existe, no crear otro.
  if (existing) return existing;

  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.setAttribute("aria-label", "Navegacion principal");
  nav.innerHTML =
    '<a class="nav-item active" href="#dashboard" data-nav="inicio">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
    '<span class="nav-item__label">Inicio</span>' +
    "</a>" +
    '<a class="nav-item" href="#gestion-cortes" data-nav="cortes">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
    '<span class="nav-item__label">Cortes</span>' +
    "</a>" +
    '<a class="nav-item" href="#gestion-prendas" data-nav="prendas">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
    '<span class="nav-item__label">Prendas</span>' +
    "</a>" +
    '<a class="nav-item" href="#historial-pagos" data-nav="pagos">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
    '<span class="nav-item__label">Pagos</span>' +
    "</a>" +
    '<a class="nav-item" href="#gestion-trabajadores" data-nav="personal">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
    '<span class="nav-item__label">Personal</span>' +
    "</a>";

  document.body.appendChild(nav);

  // Delegar clicks para cambiar el hash sin recargar la página.
  nav.addEventListener("click", (e) => {
    const navItem = e.target.closest(".nav-item");
    if (!navItem) return;
    e.preventDefault();
    location.hash = navItem.getAttribute("href").replace("#", "");
  });

  return nav;
}

// ============================================================
// BOOTSTRAP - Esperar a que el DOM esté listo
// ============================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
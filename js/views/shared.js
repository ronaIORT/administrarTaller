import { escaparHTML } from "../utils.js";

// ============================================================
// MODAL DE CONFIRMACIÓN - Diálogo blocking con callback
// Se usa para acciones destructivas (eliminar) o importantes.
// El callback onConfirmar se ejecuta solo si el usuario confirma.
// ============================================================

export function mostrarModalConfirmar(titulo, mensaje, tipo, onConfirmar, labelCancelar, labelConfirmar, claseCancelar, claseConfirmar) {
  const textoCancelar = labelCancelar || "Cancelar";
  const textoConfirmar = labelConfirmar || "Confirmar";
  const clsCancelar = claseCancelar || "btn--secondary";
  const clsConfirmar = claseConfirmar || "btn--danger";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-titulo");

  let iconoHTML = "";
  if (tipo === "danger") {
    iconoHTML =
      '<div class="confirm-dialog__icon confirm-dialog__icon--danger"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>';
  } else if (tipo === "warning") {
    iconoHTML =
      '<div class="confirm-dialog__icon confirm-dialog__icon--warning"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>';
  } else {
    iconoHTML =
      '<div class="confirm-dialog__icon confirm-dialog__icon--info"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>';
  }

  overlay.innerHTML =
    '<div class="modal modal--sm confirm-dialog">' +
    '<div class="modal__body">' +
    iconoHTML +
    '<h3 id="modal-titulo" class="confirm-dialog__message">' + escaparHTML(titulo) + '</h3>' +
    '<p class="confirm-dialog__detail">' + escaparHTML(mensaje) + '</p>' +
    '</div>' +
    '<div class="modal__footer">' +
    '<button class="btn ' + clsCancelar + ' cancelar-btn">' + escaparHTML(textoCancelar) + '</button>' +
    '<button class="btn ' + clsConfirmar + ' confirmar-btn">' + escaparHTML(textoConfirmar) + '</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  // overflow: hidden previene que el fondo se desplace mientras
  // el modal está abierto, un problema común en móviles.
  document.body.style.overflow = "hidden";

  const cerrar = () => {
    overlay.classList.add("closing");
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  overlay.querySelector(".cancelar-btn").addEventListener("click", cerrar);
  overlay
    .querySelector(".confirmar-btn")
    .addEventListener("click", async () => {
      await onConfirmar();
      cerrar();
    });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });

  const handler = (e) => {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", handler);
    }
  };
  document.addEventListener("keydown", handler);
}

// ============================================================
// TOAST NOTIFICATIONS - Feedback visual no-blocking
// Duran 3 segundos por defecto. Si duracion=0, son permanentes
// y requieren que el usuario las cierre manualmente.
// ============================================================

export function mostrarToast(mensaje, tipo = "info", duracion = 2000) {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast--${tipo}`;

  const iconos = {
    success:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };

  toast.innerHTML = `
    <span class="toast__icon">${iconos[tipo] || iconos.info}</span>
    <span class="toast__message">${escaparHTML(mensaje)}</span>
    <button class="toast__close" aria-label="Cerrar notificacion">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  container.appendChild(toast);

  const cerrarToast = () => {
    toast.classList.add("removing");
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector(".toast__close").addEventListener("click", cerrarToast);

  // duracion=0 significa toast permanente (sin auto-cerrar)
  if (duracion > 0) {
    setTimeout(cerrarToast, duracion);
  }
}

// ============================================================
// TABS - Navegación entre secciones dentro de una vista
// Soporta click en botones y swipe horizontal (touch) para
// cambiar tabs con un umbral de 50px en el eje X.
// El swipe se activa solo si el movimiento horizontal es mayor
// que el vertical (evita conflictos con scroll).
// ============================================================

export function crearTabs(tabs, tabActivo, onCambio, swipeElement) {
  const container = document.createElement("div");
  container.className = "tabs-container";
  container.setAttribute("role", "tablist");

  // Referencia mutable al tab activo actual para que el swipe
  // siempre calcule desde el estado mas reciente.
  let currentTabId = tabActivo;

  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (tab.id === tabActivo ? " active" : "");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", tab.id === tabActivo ? "true" : "false");
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;

    btn.addEventListener("click", () => {
      currentTabId = tab.id;
      container.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      if (onCambio) onCambio(tab.id);
    });

    container.appendChild(btn);
  });

  // Soporte de swipe horizontal en el elemento de contenido
  // Umbral 50px, solo si el movimiento horizontal domina sobre el vertical.
  if (swipeElement) {
    let touchStartX = 0;
    let touchStartY = 0;

    swipeElement.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true },
    );

    swipeElement.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        // Solo swipe horizontal significativo (>50px) y dominante sobre vertical
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          const currentIdx = tabs.findIndex(function (t) {
            return t.id === currentTabId;
          });
          let newIdx = currentIdx;
          if (dx < -50 && currentIdx < tabs.length - 1) {
            newIdx = currentIdx + 1;
          } else if (dx > 50 && currentIdx > 0) {
            newIdx = currentIdx - 1;
          }

          if (newIdx !== currentIdx) {
            currentTabId = tabs[newIdx].id;
            // Sincronizar UI de botones
            container.querySelectorAll(".tab").forEach(function (btn, i) {
              var isActive = tabs[i].id === currentTabId;
              btn.classList.toggle("active", isActive);
              btn.setAttribute("aria-selected", isActive ? "true" : "false");
            });
            if (onCambio) onCambio(currentTabId);
          }
        }
      },
      { passive: true },
    );
  }

  return container;
}

// ============================================================
// HEADER - Barra superior con título y botón volver
// El botón volver es opcional (rutaVolver=null para páginas principales).
// ============================================================

export function crearHeader(titulo, rutaVolver) {
  const header = document.createElement("header");
  header.className = "app-header";
  header.setAttribute("role", "banner");

  if (rutaVolver) {
    header.innerHTML = `
      <a class="app-header__back" href="${rutaVolver}" data-nav-back>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        <span>Volver</span>
      </a>
    `;
  } else {
    // Placeholder vacío para mantener el título centrado
    header.innerHTML = `<div style="min-width:60px;"></div>`;
  }

  const titleEl = document.createElement("h1");
  titleEl.className = "app-header__title";
  titleEl.textContent = titulo;
  header.appendChild(titleEl);

  header.innerHTML += `<div style="min-width:60px;"></div>`;

  return header;
}

// ============================================================
// ESTADO VACÍO - Placeholder cuando no hay datos para mostrar
// Se usa en listas vacías o errores de carga.
// ============================================================

export function estadoVacioHTML(mensaje, submsg) {
  return `
    <div class="empty-state">
      <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p class="empty-state__text">${escaparHTML(mensaje)}</p>
      ${submsg ? `<p class="empty-state__subtext">${escaparHTML(submsg)}</p>` : ""}
    </div>
  `;
}

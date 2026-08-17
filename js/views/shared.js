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
// SWIPE ANIMADO - Drag-follow + transición para tabs
// El contenido sigue el dedo durante el arrastre horizontal y
// al soltar: si supera el umbral, el tab actual sale deslizado
// hacia el lado del gesto y el nuevo entra desde el lado opuesto.
// Si no lo supera, rebota a su posición original.
// Respeta prefers-reduced-motion (cambio instantáneo).
// ============================================================

export function agregarSwipeAnimado(contenido, opciones) {
  // Limpiar listeners previos para evitar duplicados
  if (contenido._swipeHandler) {
    contenido.removeEventListener("touchstart", contenido._swipeHandler.start);
    contenido.removeEventListener("touchmove", contenido._swipeHandler.move);
    contenido.removeEventListener("touchend", contenido._swipeHandler.end);
  }

  // Cancelar animaciones o transforms pendientes de un attach anterior
  contenido.getAnimations().forEach(function (anim) {
    anim.cancel();
  });
  contenido.style.transform = "";
  contenido.style.opacity = "";

  const umbral = 50;
  const factorResistencia = 0.7;
  const maxDesplazamiento = 120;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let touchStartX = 0;
  let touchStartY = 0;
  let arrastrando = false;
  let offsetActual = 0;

  const limpiarTransform = function () {
    contenido.style.transform = "";
    contenido.style.opacity = "";
  };

  // Verifica si el toque inicia dentro de una zona con scroll
  // horizontal propio (tablas anchas). En ese caso el gesto se
  // deja para el scroll interno y no para el swipe de tabs.
  const esScrollableHorizontal = function (el) {
    while (el && el !== contenido) {
      if (el.scrollWidth > el.clientWidth + 4) return true;
      el = el.parentElement;
    }
    return false;
  };

  // Índice destino según el gesto: -1 = tab siguiente (dedo a la
  // izquierda), +1 = tab anterior (dedo a la derecha).
  const indiceNuevo = function (dx, dy, indiceActual) {
    if (Math.abs(dx) <= umbral || Math.abs(dx) <= Math.abs(dy) * 1.5) {
      return indiceActual;
    }
    if (dx < 0 && indiceActual < opciones.getTotalTabs() - 1) {
      return indiceActual + 1;
    }
    if (dx > 0 && indiceActual > 0) {
      return indiceActual - 1;
    }
    return indiceActual;
  };

  // Rebotar el contenido de vuelta a su posición original
  const animarRegreso = function () {
    const anim = contenido.animate(
      [
        { transform: "translateX(" + offsetActual + "px)" },
        { transform: "translateX(0px)" },
      ],
      { duration: 240, easing: "cubic-bezier(0.25, 0.9, 0.35, 1.15)" },
    );
    anim.onfinish = limpiarTransform;
  };

  // Sacar el tab actual por el lado del gesto y, al terminar,
  // renderizar el nuevo con entrada desde el lado opuesto
  const animarCambio = function (nuevoIndice, dx) {
    const ancho = contenido.offsetWidth || 1;
    const exitX = dx < 0 ? -(ancho + 40) : ancho + 40;

    const anim = contenido.animate(
      [
        { transform: "translateX(" + offsetActual + "px)", opacity: 1 },
        { transform: "translateX(" + exitX + "px)", opacity: 0.5 },
      ],
      { duration: 160, easing: "ease-in", fill: "forwards" },
    );
    anim.onfinish = function () {
      opciones.onCambio(nuevoIndice);
      animarEntrada(-exitX);
    };
  };

  // Entrada del contenido nuevo desde un lado con slide + fade
  const animarEntrada = function (desdeX) {
    contenido.style.transform = "translateX(" + desdeX + "px)";
    contenido.style.opacity = 0.4;
    contenido.getBoundingClientRect(); // forzar reflow antes de animar

    const anim = contenido.animate(
      [
        { transform: "translateX(" + desdeX + "px)", opacity: 0.4 },
        { transform: "translateX(0px)", opacity: 1 },
      ],
      { duration: 220, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = limpiarTransform;
    anim.oncancel = limpiarTransform;
  };

  const onStart = function (e) {
    // Abortar animación o arrastre en curso
    contenido.getAnimations().forEach(function (anim) {
      anim.cancel();
    });
    limpiarTransform();
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    arrastrando = false;
    offsetActual = 0;
  };

  const onMove = function (e) {
    if (reduceMotion) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    // Requiere un mínimo de movimiento para arrancar el arrastre
    if (Math.abs(dx) < 12) return;
    // Scroll vertical nativo: cancelar arrastre y restaurar posición
    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      arrastrando = false;
      if (contenido.style.transform) animarRegreso();
      return;
    }
    // No secuestrar gestos dentro de zonas con scroll horizontal propio
    if (esScrollableHorizontal(e.target)) return;

    arrastrando = true;
    offsetActual =
      Math.max(-maxDesplazamiento, Math.min(maxDesplazamiento, dx * factorResistencia));
    contenido.style.transition = "none";
    contenido.style.transform = "translateX(" + offsetActual + "px)";
  };

  const onEnd = function (e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const indiceActual = opciones.getIndiceActivo();

    if (reduceMotion || !arrastrando) {
      // Cambio instantáneo (reduced motion o gesto sin arrastre)
      const idxRapido = indiceNuevo(dx, dy, indiceActual);
      if (idxRapido !== indiceActual) {
        opciones.onCambio(idxRapido);
      }
      limpiarTransform();
      return;
    }

    const nuevoIndice = indiceNuevo(dx, dy, indiceActual);
    if (nuevoIndice !== indiceActual) {
      animarCambio(nuevoIndice, dx);
    } else {
      animarRegreso();
    }
  };

  contenido.addEventListener("touchstart", onStart, { passive: true });
  contenido.addEventListener("touchmove", onMove, { passive: true });
  contenido.addEventListener("touchend", onEnd, { passive: true });

  contenido._swipeHandler = { start: onStart, move: onMove, end: onEnd };
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

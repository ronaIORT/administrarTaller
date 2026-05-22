import { db } from "../db.js";
import { escaparHTML, formatBs } from "../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "./shared.js";

// ============================================================
// CONSTANTES DEL MÓDULO
// ============================================================

/** ID del contenedor de FABs (Floating Action Buttons) */
const FAB_CONTAINER_ID = "trabajadores-fab-container";
/** Timeout para ocultar FABs con delay (permite animación) */
let ocultarFABsTimeout = null;
/** AbortController para cancelar event listeners al cambiar de vista */
let clickAbortControllerT = null;

// ============================================================
// RENDER PRINCIPAL - Vista de gestión de trabajadores
// Limpia el DOM, crea estructura base, configura eventos,
// y carga los datos desde IndexedDB.
// ============================================================

export async function renderGestionTrabajadores() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  // Cancelar listeners de la vista anterior para evitar memory leaks.
  if (clickAbortControllerT) {
    clickAbortControllerT.abort();
    clickAbortControllerT = null;
  }
  clickAbortControllerT = new AbortController();

  const container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  app.appendChild(container);

  container.innerHTML = `
    <section class="trabajadores-header-section">
      <h2 class="trabajadores-section-title">Agregar nuevo trabajador</h2>
      <form id="form-nuevo-trabajador" class="trabajadores-form" autocomplete="off">
        <div class="trabajadores-form-row">
          <input
            type="text"
            id="input-nombre-trabajador"
            class="form-input trabajadores-form-input"
            placeholder="Nombre completo"
            autocomplete="off"
            maxlength="60"
            required
          />
          <button type="submit" class="btn btn--primary btn--icon trabajadores-add-btn" aria-label="Agregar trabajador">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <p id="error-nombre" class="form-error" hidden></p>
      </form>
    </section>
    <section aria-label="Lista de trabajadores">
      <div id="lista-trabajadores-container">
        <div class="spinner"></div>
      </div>
    </section>
  `;

  document.getElementById("form-nuevo-trabajador").addEventListener("submit", manejarSubmit);
  document.addEventListener("click", manejarClickDocumento, { signal: clickAbortControllerT.signal });

  await cargarTrabajadores();
}

// ============================================================
// CÁLCULO DE GANANCIAS - Total ganado por trabajador
// Itera todos los cortes, sus tareas y asignaciones para
// calcular cuánto ha ganado cada trabajador acumulado.
// ============================================================

async function calcularGanancias() {
  const ganancias = {};
  try {
    const cortes = await db.cortes.toArray();
    for (const corte of cortes) {
      if (!corte.tareas) continue;
      for (const tarea of corte.tareas) {
        if (!tarea.asignaciones) continue;
        for (const asig of tarea.asignaciones) {
          const tid = asig.trabajadorId;
          if (!ganancias[tid]) ganancias[tid] = 0;
          // cantidad * precioUnitario (ambos en centavos)
          ganancias[tid] += (asig.cantidad || 0) * (tarea.precioUnitario || 0);
        }
      }
    }
  } catch (err) {
    console.error("Error calculando ganancias:", err);
  }
  return ganancias;
}

// ============================================================
// LISTA DE TRABAJADORES - Render y eventos
// Ordena por ganancias (mayor primero) para destacar a los
// que más han trabajado. Muestra spinner mientras carga.
// ============================================================

async function cargarTrabajadores() {
  const container = document.getElementById("lista-trabajadores-container");
  if (!container) return;

  try {
    const trabajadores = await db.trabajadores.toArray();
    const ganancias = await calcularGanancias();

    if (trabajadores.length === 0) {
      container.innerHTML = estadoVacioHTML("Sin trabajadores", "Agrega el primer trabajador usando el formulario de arriba");
      return;
    }

    // Ordenar por ganancias descendente (quien más ganó va primero).
    const ordenados = [...trabajadores].sort((a, b) => {
      return (ganancias[b.id] || 0) - (ganancias[a.id] || 0);
    });

    container.innerHTML = `
      <ul class="trabajadores-lista" id="trabajadores-lista" role="list">
        ${ordenados.map((t, i) => {
          const total = ganancias[t.id] || 0;
          const nombreEscapado = escaparHTML(t.nombre);
          return `
            <li class="trabajador-card" data-id="${t.id}" data-nombre="${nombreEscapado}" role="listitem" style="animation-delay: ${i * 50}ms" tabindex="0">
              <div class="trabajador-card__contenido">
                <span class="trabajador-card__nombre">${nombreEscapado}</span>
                <span class="trabajador-card__ganancias">${formatBs(total)}</span>
              </div>
              <div class="trabajador-card__acciones">
                <button class="btn btn--ghost btn--sm btn-editar-trabajador" data-id="${t.id}" data-nombre="${nombreEscapado}" aria-label="Editar ${nombreEscapado}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="btn btn--ghost btn--sm btn-eliminar-trabajador" data-id="${t.id}" data-nombre="${nombreEscapado}" aria-label="Eliminar ${nombreEscapado}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </li>
          `;
        }).join("")}
      </ul>
    `;
  } catch (err) {
    console.error("Error cargando trabajadores:", err);
    container.innerHTML = estadoVacioHTML("Error al cargar", "Intenta recargar la pagina");
  }
}

// ============================================================
// SELECCIÓN DE CARD + FABs (Floating Action Buttons)
// Al hacer click en una card se muestran los FABs de acción.
// Click fuera o en otra card deselecciona la actual.
// ============================================================

/** Trabajador actualmente seleccionado (o null) */
let trabajadorSeleccionado = null;

function manejarClickDocumento(e) {
  const fueInlineEdit = e.target.closest(".btn-editar-trabajador");
  const fueInlineDelete = e.target.closest(".btn-eliminar-trabajador");

  if (fueInlineEdit) {
    abrirModalEditar(parseInt(fueInlineEdit.dataset.id), fueInlineEdit.dataset.nombre);
    return;
  }
  if (fueInlineDelete) {
    confirmarEliminar(parseInt(fueInlineDelete.dataset.id), fueInlineDelete.dataset.nombre);
    return;
  }

  const fueCard = e.target.closest(".trabajador-card");
  const fueFAB = e.target.closest(".fab-btn");

  if (fueFAB && trabajadorSeleccionado) {
    if (fueFAB.classList.contains("fab-edit")) {
      abrirModalEditar(trabajadorSeleccionado.id, trabajadorSeleccionado.nombre);
    } else if (fueFAB.classList.contains("fab-delete")) {
      confirmarEliminar(trabajadorSeleccionado.id, trabajadorSeleccionado.nombre);
    }
    return;
  }

  if (fueCard) {
    const id = parseInt(fueCard.dataset.id);
    if (trabajadorSeleccionado && trabajadorSeleccionado.id === id) {
      return;
    }
    seleccionarTrabajador(id, fueCard.dataset.nombre);
    return;
  }

  if (trabajadorSeleccionado) {
    deseleccionarTrabajador();
  }
}

function seleccionarTrabajador(id, nombre) {
  deseleccionarTrabajador();

  trabajadorSeleccionado = { id, nombre };

  const card = document.querySelector(`.trabajador-card[data-id="${id}"]`);
  if (card) {
    card.classList.add("selected");
  }

  mostrarFABs();
}

function deseleccionarTrabajador() {
  const cardSeleccionada = document.querySelector(".trabajador-card.selected");
  if (cardSeleccionada) {
    cardSeleccionada.classList.remove("selected");
  }
  trabajadorSeleccionado = null;
  ocultarFABs();
}

// Los FABs se crean una sola vez y se muestran/ocultan con CSS.
// Esto evita recrear elementos del DOM constantemente.
function mostrarFABs() {
  if (ocultarFABsTimeout) {
    clearTimeout(ocultarFABsTimeout);
    ocultarFABsTimeout = null;
  }

  let fabContainer = document.getElementById(FAB_CONTAINER_ID);

  if (!fabContainer) {
    fabContainer = document.createElement("div");
    fabContainer.id = FAB_CONTAINER_ID;
    fabContainer.className = "fab-container";
    fabContainer.innerHTML = `
      <button class="fab-btn fab-edit" aria-label="Editar trabajador">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="fab-btn fab-delete" aria-label="Eliminar trabajador">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `;
    document.body.appendChild(fabContainer);
  }

  fabContainer.classList.remove("visible");
  // requestAnimationFrame permite que el navegador pinte el
  // elemento antes de aplicar la clase que dispara la animación.
  requestAnimationFrame(() => {
    fabContainer.classList.add("visible");
  });
}

// Ocultar con delay permite que la animación de salida complete
// antes de remover el elemento del DOM.
function ocultarFABs() {
  const fabContainer = document.getElementById(FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarFABsTimeout = setTimeout(() => {
    const contenedor = document.getElementById(FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarFABsTimeout = null;
  }, 300);
}

// ============================================================
// FORMULARIO - Agregar nuevo trabajador
// Validaciones: nombre no vacío, no duplicado.
// ============================================================

async function manejarSubmit(e) {
  e.preventDefault();
  const input = document.getElementById("input-nombre-trabajador");
  const errorEl = document.getElementById("error-nombre");
  const nombre = input.value.trim();

  errorEl.hidden = true;
  input.classList.remove("form-input--error");

  if (!nombre) {
    errorEl.textContent = "El nombre no puede estar vacio";
    errorEl.hidden = false;
    input.classList.add("form-input--error");
    input.focus();
    return;
  }

  try {
    const existe = await db.trabajadores.where("nombre").equals(nombre).first();
    if (existe) {
      errorEl.textContent = "Ya existe un trabajador con ese nombre";
      errorEl.hidden = false;
      input.classList.add("form-input--error");
      input.focus();
      return;
    }

    await db.trabajadores.add({ nombre });
    input.value = "";
    input.classList.remove("form-input--error");
    await cargarTrabajadores();
    mostrarToast("Trabajador agregado", "success");
  } catch (err) {
    console.error("Error al crear trabajador:", err);
    mostrarToast("Error al guardar", "error");
  }
}

// ============================================================
// MODAL EDITAR - Actualizar nombre de trabajador
// Permite cambiar el nombre manteniendo el mismo ID.
// Valida nombre único (excluye el trabajador actual).
// ============================================================

function abrirModalEditar(id, nombreActual) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-edit-titulo");

  overlay.innerHTML = `
    <div class="modal modal--sm modal-edit">
      <div class="modal__header">
        <h3 id="modal-edit-titulo" class="modal__title">Editar trabajador</h3>
      </div>
      <div class="modal__body">
        <form id="form-editar-trabajador" autocomplete="off">
          <div class="form-group">
            <label for="input-edit-nombre" class="form-label">Nombre</label>
            <input
              type="text"
              id="input-edit-nombre"
              class="form-input"
              value="${escaparHTML(nombreActual)}"
              maxlength="60"
              required
              autocomplete="off"
            />
            <p id="error-edit-nombre" class="form-error" hidden></p>
          </div>
        </form>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary modal-cancelar">Cancelar</button>
        <button class="btn btn--primary modal-guardar">Guardar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const input = overlay.querySelector("#input-edit-nombre");
  const errorEl = overlay.querySelector("#error-edit-nombre");

  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });

  const cerrar = () => {
    overlay.classList.add("closing");
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  const guardar = async () => {
    const nuevoNombre = input.value.trim();
    errorEl.hidden = true;
    input.classList.remove("form-input--error");

    if (!nuevoNombre) {
      errorEl.textContent = "El nombre no puede estar vacio";
      errorEl.hidden = false;
      input.classList.add("form-input--error");
      input.focus();
      return;
    }

    try {
      // Verificar duplicado excluyendo el ID actual.
      const existe = await db.trabajadores.where("nombre").equals(nuevoNombre).first();
      if (existe && existe.id !== id) {
        errorEl.textContent = "Ya existe un trabajador con ese nombre";
        errorEl.hidden = false;
        input.classList.add("form-input--error");
        input.focus();
        return;
      }

      await db.trabajadores.update(id, { nombre: nuevoNombre });
      cerrar();
      await cargarTrabajadores();
      mostrarToast("Trabajador actualizado", "success");

      // Actualizar el estado local si era el trabajador seleccionado.
      if (trabajadorSeleccionado && trabajadorSeleccionado.id === id) {
        trabajadorSeleccionado.nombre = nuevoNombre;
        const card = document.querySelector(`.trabajador-card[data-id="${id}"]`);
        if (card) {
          card.dataset.nombre = nuevoNombre;
          card.querySelector(".trabajador-card__nombre").textContent = nuevoNombre;
        }
      }
    } catch (err) {
      console.error("Error al actualizar:", err);
      mostrarToast("Error al actualizar", "error");
    }
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", guardar);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cerrar();
  });

  const form = overlay.querySelector("#form-editar-trabajador");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    guardar();
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
// CONFIRMAR ELIMINAR - Verificar asignaciones activas
// No se puede eliminar un trabajador que tenga asignaciones
// en cortes activos. Se verifica iterando todos los cortes.
// ============================================================

async function confirmarEliminar(id, nombre) {
  let tieneAsignaciones = false;

  try {
    const cortes = await db.cortes.toArray();
    for (const corte of cortes) {
      if (!corte.tareas) continue;
      for (const tarea of corte.tareas) {
        if (tarea.asignaciones) {
          const asig = tarea.asignaciones.find((a) => a.trabajadorId === id);
          if (asig) {
            tieneAsignaciones = true;
            break;
          }
        }
      }
      if (tieneAsignaciones) break;
    }
  } catch (err) {
    console.error("Error verificando asignaciones:", err);
  }

  const mensaje = tieneAsignaciones
    ? `No se puede eliminar a ${nombre} porque tiene asignaciones activas en cortes.`
    : `Estas seguro de eliminar a ${nombre}? Esta accion no se puede deshacer.`;

  mostrarModalConfirmar(
    "Eliminar Trabajador",
    mensaje,
    tieneAsignaciones ? "warning" : "danger",
    async () => {
      if (tieneAsignaciones) return;
      try {
        await db.trabajadores.delete(id);
        deseleccionarTrabajador();
        await cargarTrabajadores();
        mostrarToast("Trabajador eliminado", "success");
      } catch (err) {
        console.error("Error al eliminar:", err);
        mostrarToast("Error al eliminar", "error");
      }
    }
  );
}
// ============================================================
// TAB ASIGNAR - Formulario de asignacion de tareas a trabajadores
// Permite seleccionar trabajador y tarea, ingresar cantidades
// por talla (con toggle click 0/max), crear nuevas tareas
// inline on-the-fly, y ver el historial de asignaciones
// agrupado por trabajador+tarea con eliminacion masiva.
// Si el corte esta finalizado, bloquea nuevas asignaciones.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast } from "../shared.js";

// ============================================================
// CONSTANTES DEL MODULO
// ============================================================

/** ID del contenedor de FABs para historial */
const ASIGNAR_FAB_CONTAINER_ID = "at-asignar-fab-container";

/** Datos de la fila de historial seleccionada { trabajadorId, tareaIdx } */
let historialSeleccionado = null;

/** Timeout para ocultar FABs con animacion */
let ocultarAsignarFABsTimeout = null;

/** AbortController para limpiar listener de click-outside */
let outsideClickAbortControllerAT = null;

// ============================================================
// HELPERS DE DISPONIBILIDAD
// ============================================================

/**
 * Devuelve las tareas del corte que aun NO tienen asignaciones
 * del trabajador indicado. Se usa para poblar el select de tarea
 * cuando se elige un trabajador.
 * @param {Object} corte - Corte con array tareas[] y asignaciones[]
 * @param {number} trabajadorId
 * @returns {Array} - Tareas disponibles para ese trabajador
 */
function getTareasNoAsignadasATrabajador(corte, trabajadorId) {
  return (corte.tareas || []).filter(function (tarea) {
    return !(tarea.asignaciones || []).some(function (a) {
      return a.trabajadorId === trabajadorId;
    });
  });
}

/**
 * Calcula cuantas unidades de cada talla quedan libres para una tarea.
 * Parte del total del corte por talla y resta lo ya asignado por
 * cualquier trabajador en esa tarea.
 * @param {Object} corte - Corte con array tallas[]
 * @param {Object} tarea - Tarea con array asignaciones[]
 * @returns {Object} - Mapa { nombreTalla: cantidadDisponible }
 */
function getTallasDisponiblesParaTarea(corte, tarea) {
  const disponibles = {};

  // Inicializar con el total del corte por talla
  (corte.tallas || []).forEach(function (t) {
    disponibles[t.talla] = t.cantidad;
  });

  // Restar lo ya asignado en esta tarea
  (tarea.asignaciones || []).forEach(function (a) {
    if (a.talla && disponibles.hasOwnProperty(a.talla)) {
      disponibles[a.talla] -= a.cantidad || 0;
    }
  });

  return disponibles;
}

/**
 * Determina si una tarea tiene al menos una talla con cantidad disponible.
 * Se usa para filtrar el select de tareas: solo mostrar tareas que aun
 * pueden recibir asignaciones.
 * @param {Object} corte - Corte con array tallas[]
 * @param {Object} tarea - Tarea con array asignaciones[]
 * @returns {boolean}
 */
function tieneAlgunaTallaDisponible(corte, tarea) {
  let disponibles = getTallasDisponiblesParaTarea(corte, tarea);
  return Object.keys(disponibles).some(function (talla) {
    return disponibles[talla] > 0;
  });
}

/**
 * Agrupa las asignaciones del corte por (trabajadorId, indiceTarea)
 * para mostrar en el historial con el formato: M(5), L(3).
 * @param {Object} corte - Corte con array tareas[]
 * @param {Object} trabajadoresMap - Mapa id -> nombre
 * @returns {Array} - Grupos [{ trabajadorId, tareaIdx, trabajadorNombre, tareaNombre, tallasStr }]
 */
function agruparAsignacionesPorTrabajador(corte, trabajadoresMap) {
  let grupos = [];

  (corte.tareas || []).forEach(function (tarea, tareaIdx) {
    // Agrupar asignaciones de esta tarea por trabajador
    let porTrabajador = {};
    (tarea.asignaciones || []).forEach(function (a) {
      let key = a.trabajadorId;
      if (!porTrabajador[key]) {
        porTrabajador[key] = [];
      }
      porTrabajador[key].push(a);
    });

    Object.keys(porTrabajador).forEach(function (tId) {
      let trabajadorId = parseInt(tId, 10);
      let asignaciones = porTrabajador[tId];

      // Construir cadena de tallas apiladas: S (10), M (5)
      let tallasStr = asignaciones
        .map(function (a) {
          if (a.talla) {
            return '<span class="at-asignar__historial-talla">' + escaparHTML(a.talla) + ' (' + a.cantidad + ')</span>';
          }
          return '<span class="at-asignar__historial-talla">x' + a.cantidad + '</span>';
        })
        .join("");

      grupos.push({
        trabajadorId: trabajadorId,
        trabajadorNombre:
          trabajadoresMap[trabajadorId] || "Trab. " + trabajadorId,
        tareaIdx: tareaIdx,
        tareaNombre: tarea.nombre || "Sin nombre",
        tallasStr: tallasStr,
      });
    });
  });

  return grupos;
}

// ============================================================
// RENDERIZADO DE INPUTS DE TALLAS (dinamico segun modo)
// ============================================================

/**
 * Renderiza el HTML de los inputs de talla para modo "crear".
 * Pre-rellena cada input con el maximo disponible del corte.
 * @param {Object} corte
 * @returns {string} HTML
 */
function renderizarHTMLTallasModoCrear(corte) {
  // Solo mostrar tallas que tengan cantidad > 0 en el corte
  let tallasVisibles = (corte.tallas || []).filter(function (t) {
    return t.cantidad > 0;
  });

  if (tallasVisibles.length === 0) {
    return '<p class="form-hint">Todas las tallas estan asignadas en este corte</p>';
  }

  var sumaTotal = tallasVisibles.reduce(function (s, t) {
    return s + t.cantidad;
  }, 0);

  return (
    '<label class="form-label" id="contador-tallas-label">Tallas: ' +
    tallasVisibles.length +
    " | Cantidad: " +
    sumaTotal +
    "</label>" +
    '<div class="at-asignar__tallas-grid">' +
    tallasVisibles
      .map(function (talla) {
        let nombreEscapado = escaparHTML(talla.talla);
        return (
          '<div class="at-asignar__talla-fila">' +
          '<button type="button" class="at-asignar__talla-label" data-talla="' +
          nombreEscapado +
          '" data-max="' +
          talla.cantidad +
          '" title="Click para toggle 0/' +
          talla.cantidad +
          '">' +
          nombreEscapado +
          "</button>" +
          '<input type="number" id="input-talla-' +
          nombreEscapado.replace(/\s+/g, "-") +
          '" class="form-input at-asignar__talla-input" placeholder="0" min="0" max="' +
          talla.cantidad +
          '" step="1" autocomplete="off" value="' +
          talla.cantidad +
          '" />' +
          '<span class="at-asignar__talla-disponible">/' +
          talla.cantidad +
          "</span>" +
          "</div>"
        );
      })
      .join("") +
    "</div>"
  );
}

/**
 * Renderiza el HTML de los inputs de talla para modo "tarea existente".
 * Usa las cantidades disponibles (restando lo ya asignado).
 * @param {Object} corte
 * @param {Object} disponibles - Mapa { talla: cantidadDisponible }
 * @returns {string} HTML
 */
function renderizarHTMLTallasModoExistente(corte, disponibles) {
  // Solo mostrar tallas que tengan cantidad disponible > 0
  let tallasVisibles = (corte.tallas || []).filter(function (t) {
    return (disponibles[t.talla] || 0) > 0;
  });

  if (tallasVisibles.length === 0) {
    return '<p class="form-hint">No hay tallas disponibles para esta tarea</p>';
  }

  var numTallasDisp = tallasVisibles.length;
  var sumaDisp = tallasVisibles.reduce(function (s, t) {
    return s + (disponibles[t.talla] || 0);
  }, 0);

  return (
    '<label class="form-label" id="contador-tallas-label">Tallas: ' +
    numTallasDisp +
    " | Cantidad: " +
    sumaDisp +
    "</label>" +
    '<div class="at-asignar__tallas-grid">' +
    tallasVisibles
      .map(function (talla) {
        let nombreEscapado = escaparHTML(talla.talla);
        let disponible = disponibles[talla.talla] || 0;
        return (
          '<div class="at-asignar__talla-fila">' +
          '<button type="button" class="at-asignar__talla-label" data-talla="' +
          nombreEscapado +
          '" data-max="' +
          disponible +
          '" title="Click para toggle 0/' +
          disponible +
          '">' +
          nombreEscapado +
          "</button>" +
          '<input type="number" id="input-talla-' +
          nombreEscapado.replace(/\s+/g, "-") +
          '" class="form-input at-asignar__talla-input" placeholder="0" min="0" max="' +
          disponible +
          '" step="1" autocomplete="off" value="' +
          disponible +
          '" />' +
          '<span class="at-asignar__talla-disponible">/' +
          disponible +
          "</span>" +
          "</div>"
        );
      })
      .join("") +
    "</div>"
  );
}

/**
 * Renderiza el input de cantidad global (cuando el corte no tiene tallas).
 * @param {number} maxDisponible - Maximo permitido
 * @returns {string} HTML
 */
function renderizarHTMLCantidadGlobal(maxDisponible) {
  return (
    '<div class="form-group">' +
    '<label for="input-asignar-cantidad-global" class="form-label">Cantidad</label>' +
    '<input type="number" id="input-asignar-cantidad-global" class="form-input at-asignar__input-global" placeholder="0" min="1" max="' +
    (maxDisponible || 9999) +
    '" step="1" autocomplete="off" />' +
    '<p class="form-hint">Cantidad total de prendas a asignar (' +
    (maxDisponible || 0) +
    " disponibles)</p>" +
    "</div>"
  );
}

// ============================================================
// OCULTAR / MOSTRAR CAMPOS
// ============================================================

/**
 * Oculta todos los campos dinamicos del formulario (nombre, precio, tallas).
 * Se llama al cambiar de trabajador o al resetear seleccion.
 */
function ocultarCamposAsignacion() {
  let grupoNombre = document.getElementById("grupo-nombre-tarea-asignar");
  let grupoPrecio = document.getElementById("grupo-precio-asignar");
  let tallasContainer = document.getElementById("asignar-tallas-container");
  let errorEl = document.getElementById("error-asignacion");

  if (grupoNombre) grupoNombre.style.display = "none";
  if (grupoPrecio) grupoPrecio.style.display = "none";
  if (tallasContainer) tallasContainer.innerHTML = "";
  if (errorEl) errorEl.hidden = true;
}

/**
 * Configura el modo "crear nueva tarea" inline.
 * Muestra input de nombre, precio vacio, y tallas con max del corte.
 * @param {Object} corte
 * @param {number} trabajadorId - ID del trabajador seleccionado
 */
function modoCrearInine(corte, trabajadorId) {
  // Mostrar input de nombre
  let grupoNombre = document.getElementById("grupo-nombre-tarea-asignar");
  let inputNombre = document.getElementById("input-asignar-nombre-tarea");
  grupoNombre.style.display = "";
  inputNombre.value = "";
  inputNombre.focus();

  // Enter en nombre pasa al precio
  inputNombre.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("input-asignar-precio").focus();
    }
  });

  // Mostrar input de precio (vacio)
  let grupoPrecio = document.getElementById("grupo-precio-asignar");
  let inputPrecio = document.getElementById("input-asignar-precio");
  grupoPrecio.style.display = "";
  inputPrecio.value = "";

  // Renderizar tallas o cantidad global
  let tallasContainer = document.getElementById("asignar-tallas-container");
  if (corte.tallas && corte.tallas.length > 0) {
    tallasContainer.innerHTML = renderizarHTMLTallasModoCrear(corte);
    configurarToggleTallas();
  } else {
    tallasContainer.innerHTML = renderizarHTMLCantidadGlobal(
      corte.cantidadPrendas || 0,
    );
  }

  document.getElementById("error-asignacion").hidden = true;
}

/**
 * Configura el modo "tarea existente".
 * Oculta nombre, muestra precio pre-rellenado, tallas con disponibles.
 * @param {Object} corte
 * @param {Object} tarea - La tarea seleccionada
 * @param {number} trabajadorId - ID del trabajador seleccionado
 */
function modoExistente(corte, tarea, trabajadorId) {
  // Ocultar input de nombre
  let grupoNombre = document.getElementById("grupo-nombre-tarea-asignar");
  grupoNombre.style.display = "none";

  // Mostrar precio pre-rellenado con el de la tarea
  let grupoPrecio = document.getElementById("grupo-precio-asignar");
  let inputPrecio = document.getElementById("input-asignar-precio");
  grupoPrecio.style.display = "";
  inputPrecio.value = tarea.precioUnitario || 0;

  // Renderizar tallas con disponibles o cantidad global
  let tallasContainer = document.getElementById("asignar-tallas-container");
  if (corte.tallas && corte.tallas.length > 0) {
    let disponibles = getTallasDisponiblesParaTarea(corte, tarea);
    tallasContainer.innerHTML = renderizarHTMLTallasModoExistente(
      corte,
      disponibles,
    );
    configurarToggleTallas();
  } else {
    let totalDisponible =
      (tarea.unidadesTotales || 0) -
      (tarea.asignaciones || []).reduce(function (s, a) {
        return s + (a.cantidad || 0);
      }, 0);
    tallasContainer.innerHTML = renderizarHTMLCantidadGlobal(
      Math.max(0, totalDisponible),
    );
  }

  document.getElementById("error-asignacion").hidden = true;
}

/**
 * Actualiza el contador de tallas/cantidad en tiempo real
 * segun los valores actuales de los inputs de talla.
 */
function actualizarContadorTallas() {
  var label = document.getElementById("contador-tallas-label");
  if (!label) return;
  var inputs = document.querySelectorAll(".at-asignar__talla-input");
  var numTallas = 0;
  var suma = 0;
  inputs.forEach(function (input) {
    var val = parseInt(input.value, 10) || 0;
    if (val > 0) {
      numTallas++;
      suma += val;
    }
  });
  label.textContent = "Tallas: " + numTallas + " | Cantidad: " + suma;
}

/**
 * Registra los event listeners de toggle en los botones de talla.
 * Cada click alterna entre 0 y el maximo configurado en data-max.
 * Tambien registra listeners de input para actualizar el contador.
 */
function configurarToggleTallas() {
  let labels = document.querySelectorAll(".at-asignar__talla-label");
  labels.forEach(function (label) {
    label.addEventListener("click", function () {
      let max = parseInt(label.dataset.max, 10) || 0;
      let tallaNombre = label.dataset.talla;
      let inputId = "input-talla-" + tallaNombre.replace(/\s+/g, "-");
      let input = document.getElementById(inputId);
      if (!input) return;

      let currentVal = parseInt(input.value, 10) || 0;
      if (currentVal === 0 && max > 0) {
        input.value = max;
        label.classList.add("at-asignar__talla-label--filled");
      } else {
        input.value = 0;
        label.classList.remove("at-asignar__talla-label--filled");
      }
      actualizarContadorTallas();
    });
  });

  let inputs = document.querySelectorAll(".at-asignar__talla-input");
  inputs.forEach(function (input) {
    input.addEventListener("input", function () {
      let tallaNombre = this.id.replace("input-talla-", "").replace(/-/g, " ");
      let labelBtn = document.querySelector(
        '.at-asignar__talla-label[data-talla="' + tallaNombre + '"]',
      );
      if (labelBtn) {
        let val = parseInt(this.value, 10) || 0;
        let max = parseInt(labelBtn.dataset.max, 10) || 0;

        if (val > max && max > 0) {
          mostrarToast(
            "La cantidad excede el maximo disponible (" + max + ")",
            "warning",
          );
          this.value = 0;
          val = 0;
          labelBtn.classList.remove("at-asignar__talla-label--filled");
        } else if (val > 0 && val === max) {
          labelBtn.classList.add("at-asignar__talla-label--filled");
        } else {
          labelBtn.classList.remove("at-asignar__talla-label--filled");
        }
      }
      actualizarContadorTallas();
    });
  });
}

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabAsignar(corte, container, opciones) {
  let trabajadoresMap = opciones.trabajadoresMap;
  let onDataChange = opciones.onDataChange;

  // Limpiar estado y listeners previos
  document.getElementById(ASIGNAR_FAB_CONTAINER_ID)?.remove();
  if (outsideClickAbortControllerAT) {
    outsideClickAbortControllerAT.abort();
    outsideClickAbortControllerAT = null;
  }
  historialSeleccionado = null;
  if (ocultarAsignarFABsTimeout) {
    clearTimeout(ocultarAsignarFABsTimeout);
    ocultarAsignarFABsTimeout = null;
  }

  let esTerminado = corte.estado === "terminado";

  // Opciones del select de trabajador
  let opcionesTrabajadores =
    '<option value="">Seleccionar trabajador...</option>' +
    Object.entries(trabajadoresMap)
      .map(function (entry) {
        return (
          '<option value="' +
          entry[0] +
          '">' +
          escaparHTML(entry[1]) +
          "</option>"
        );
      })
      .join("");

  // Opciones iniciales del select de tarea (se repobla al elegir trabajador)
  let opcionesTareas =
    '<option value="">Seleccionar tarea...</option>' +
    '<option value="__nueva__">＋ Crear nueva tarea</option>' +
    (corte.tareas || [])
      .map(function (tarea) {
        return (
          '<option value="' +
          tarea.id +
          '">' +
          escaparHTML(tarea.nombre || "Sin nombre") +
          "</option>"
        );
      })
      .join("");

  // Construir historial agrupado
  let historialHTML = construirHistorialHTML(corte, trabajadoresMap);

  container.innerHTML =
    '<section class="at-asignar">' +
    // Aviso si esta finalizado
    (esTerminado
      ? '<div class="at-asignar__finalizado-aviso">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        "Este corte esta finalizado. No se pueden agregar nuevas asignaciones." +
        "</div>"
      : "") +
    // Formulario de asignacion
    '<div class="at-asignar__form">' +
    // Select trabajador
    '<div class="at-asignar__form-row">' +
    '<select id="select-asignar-trabajador" class="form-select" ' +
    (esTerminado ? "disabled" : "") +
    ">" +
    opcionesTrabajadores +
    "</select>" +
    "</div>" +
    // Select tarea + boton rapido
    '<div class="at-asignar__form-row">' +
    '<select id="select-asignar-tarea" class="form-select" ' +
    (esTerminado ? "disabled" : "") +
    ">" +
    opcionesTareas +
    "</select>" +
    (esTerminado
      ? ""
      : '<button type="button" class="btn btn--outline btn--icon" id="btn-nueva-tarea-asignar" aria-label="Crear nueva tarea" title="Crear nueva tarea rapida">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
        "</button>") +
    "</div>" +
    // Input de nombre de nueva tarea (oculto, solo en modo crear)
    '<div class="form-group" id="grupo-nombre-tarea-asignar" style="display:none">' +
    '<label for="input-asignar-nombre-tarea" class="form-label">Nombre de la tarea</label>' +
    '<input type="text" id="input-asignar-nombre-tarea" class="form-input" placeholder="Ej: Bordado, Etiquetas" maxlength="60" autocomplete="off" />' +
    '<p id="error-asignar-nombre" class="form-error" hidden></p>' +
    "</div>" +
    // Input de precio (oculto hasta elegir tarea)
    '<div class="form-group" id="grupo-precio-asignar" style="display:none">' +
    '<label for="input-asignar-precio" class="form-label">Precio Unitario (centavos)</label>' +
    '<input type="number" id="input-asignar-precio" class="form-input" placeholder="0" min="0" max="9999" step="1" autocomplete="off" />' +
    "</div>" +
    // Contenedor de tallas o input global (poblado dinamicamente)
    '<div id="asignar-tallas-container"></div>' +
    // Boton submit
    (esTerminado
      ? ""
      : '<button type="button" class="btn btn--success at-asignar__submit" id="btn-submit-asignacion">Asignar Tareas</button>') +
    '<p id="error-asignacion" class="form-error" hidden></p>' +
    "</div>" +
    // Historial de asignaciones
    '<div class="at-asignar__historial-titulo">Historial de asignaciones</div>' +
    '<div id="at-asignar-historial">' +
    historialHTML +
    "</div>" +
    "</section>";

  // ---- EVENT LISTENERS (solo si el corte no esta finalizado) ----

  if (!esTerminado) {
    // Select trabajador: al cambiar, repoblar tareas disponibles y ocultar campos
    document
      .getElementById("select-asignar-trabajador")
      .addEventListener("change", function () {
        let trabajadorId = this.value ? parseInt(this.value, 10) : null;
        let selectTarea = document.getElementById("select-asignar-tarea");

        if (!trabajadorId) {
          selectTarea.innerHTML =
            '<option value="">Seleccionar tarea...</option>';
          ocultarCamposAsignacion();
          return;
        }

        // Repoblar solo con tareas NO asignadas a este trabajador
        // y que aun tengan al menos una talla con cantidad disponible
        let tareasDisponibles = getTareasNoAsignadasATrabajador(
          corte,
          trabajadorId,
        ).filter(function (t) {
          return tieneAlgunaTallaDisponible(corte, t);
        });
        selectTarea.innerHTML =
          '<option value="">Seleccionar tarea...</option>' +
          '<option value="__nueva__">＋ Crear nueva tarea</option>' +
          tareasDisponibles
            .map(function (t) {
              return (
                '<option value="' +
                t.id +
                '">' +
                escaparHTML(t.nombre || "Sin nombre") +
                "</option>"
              );
            })
            .join("");

        ocultarCamposAsignacion();
      });

    // Select tarea: al cambiar, mostrar campos segun modo (crear o existente)
    document
      .getElementById("select-asignar-tarea")
      .addEventListener("change", function () {
        let value = this.value;
        let trabajadorId = document.getElementById("select-asignar-trabajador")
          .value
          ? parseInt(
              document.getElementById("select-asignar-trabajador").value,
              10,
            )
          : null;

        if (!value) {
          ocultarCamposAsignacion();
          return;
        }

        if (!trabajadorId) {
          // Seguridad: sin trabajador no deberia estar aqui
          this.value = "";
          ocultarCamposAsignacion();
          return;
        }

        if (value === "__nueva__") {
          modoCrearInine(corte, trabajadorId);
        } else {
          let tareaId = parseInt(value, 10);
          let tarea = (corte.tareas || []).find(function (t) {
            return t.id === tareaId;
          });
          if (tarea) {
            modoExistente(corte, tarea, trabajadorId);
          }
        }
      });

    // Boton + : atajo para seleccionar "__nueva__" en el dropdown (modo crear inline)
    document
      .getElementById("btn-nueva-tarea-asignar")
      .addEventListener("click", function () {
        let selectTarea = document.getElementById("select-asignar-tarea");
        let selectTrabajador = document.getElementById(
          "select-asignar-trabajador",
        );

        if (!selectTrabajador.value) {
          mostrarToast("Primero selecciona un trabajador", "warning");
          return;
        }

        selectTarea.value = "__nueva__";
        selectTarea.dispatchEvent(new Event("change", { bubbles: true }));
      });

    // Boton submit: procesar asignacion
    document
      .getElementById("btn-submit-asignacion")
      .addEventListener("click", function () {
        procesarAsignacion(corte, onDataChange);
      });
  }

  // Delegacion de clicks en el historial (seleccion + eliminar inline)
  let historialContainer = document.getElementById("at-asignar-historial");
  if (historialContainer) {
    historialContainer.addEventListener("click", function (e) {
      // Boton eliminar inline (prioridad sobre seleccion de fila)
      let deleteBtn = e.target.closest(".at-asignar__historial-delete");
      if (deleteBtn) {
        let sel = {
          trabajadorId: parseInt(deleteBtn.dataset.trabajadorId, 10),
          tareaIdx: parseInt(deleteBtn.dataset.tareaIdx, 10),
        };
        confirmarEliminarAsignacion(corte, sel, onDataChange);
        return;
      }

      // Seleccion de fila para FAB (mobile)
      let row = e.target.closest(".at-asignar__historial-row");
      if (row) {
        seleccionarHistorial(row, corte, onDataChange);
      }
    });
  }

  // Click-outside: deseleccionar y ocultar FAB al clickear fuera del historial
  configurarClickOutsideAsignar(corte, onDataChange);
}

// ============================================================
// HISTORIAL - Construye la tabla agrupada por trabajador+tarea
// ============================================================

function construirHistorialHTML(corte, trabajadoresMap) {
  let grupos = agruparAsignacionesPorTrabajador(corte, trabajadoresMap);

  if (grupos.length === 0) {
    return '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm);padding:var(--space-4) 0;text-align:center;">Sin asignaciones registradas</p>';
  }

  return (
    '<div class="at-asignar__historial-tabla">' +
    '<div class="at-asignar__historial-header">' +
    "<span>Trabajador</span>" +
    "<span>Tarea</span>" +
    "<span>Tallas</span>" +
    '<span class="at-asignar__historial-header-accion">Accion</span>' +
    "</div>" +
    grupos
      .map(function (g, idx) {
        return (
          '<div class="at-asignar__historial-row" data-trabajador-id="' +
          g.trabajadorId +
          '" data-tarea-idx="' +
          g.tareaIdx +
          '" data-idx="' +
          idx +
          '">' +
          '<span class="at-asignar__historial-trabajador">' +
          escaparHTML(g.trabajadorNombre) +
          "</span>" +
          '<span class="at-asignar__historial-tarea">' +
          escaparHTML(g.tareaNombre) +
          "</span>" +
          '<div class="at-asignar__historial-tallas">' +
          g.tallasStr +
          '</div>' +
          '<button type="button" class="at-asignar__historial-delete" data-trabajador-id="' +
          g.trabajadorId +
          '" data-tarea-idx="' +
          g.tareaIdx +
          '" aria-label="Eliminar asignaciones del trabajador" title="Eliminar asignaciones">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          "</button>" +
          "</div>"
        );
      })
      .join("") +
    "</div>"
  );
}

// ============================================================
// SELECCION DE FILA EN HISTORIAL + FAB ELIMINAR
// ============================================================

function seleccionarHistorial(row, corte, onDataChange) {
  // Deseleccionar anterior
  let prevSelected = document.querySelector(
    ".at-asignar__historial-row.selected",
  );
  if (prevSelected) prevSelected.classList.remove("selected");

  // Si ya estaba seleccionada, deseleccionar
  if (row.classList.contains("selected")) {
    row.classList.remove("selected");
    ocultarAsignarFAB();
    historialSeleccionado = null;
    return;
  }

  row.classList.add("selected");
  historialSeleccionado = {
    trabajadorId: parseInt(row.dataset.trabajadorId, 10),
    tareaIdx: parseInt(row.dataset.tareaIdx, 10),
  };

  mostrarAsignarFAB(corte, onDataChange);
}

function mostrarAsignarFAB(corte, onDataChange) {
  if (ocultarAsignarFABsTimeout) {
    clearTimeout(ocultarAsignarFABsTimeout);
    ocultarAsignarFABsTimeout = null;
  }

  // Solo mostrar si el corte no esta finalizado
  if (corte.estado === "terminado") return;

  // En pantallas grandes (tablet+) no mostrar FAB: hay botones inline
  if (window.innerWidth >= 768) return;

  let fabContainer = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);
  if (!fabContainer) {
    fabContainer = document.createElement("div");
    fabContainer.id = ASIGNAR_FAB_CONTAINER_ID;
    fabContainer.className = "tareas-fab-container";
    fabContainer.innerHTML =
      '<button class="tarea-fab-btn tarea-fab-delete" aria-label="Eliminar asignaciones del trabajador">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      "</button>";
    document.body.appendChild(fabContainer);

    fabContainer
      .querySelector(".tarea-fab-delete")
      .addEventListener("click", function () {
        if (historialSeleccionado) {
          confirmarEliminarAsignacion(
            corte,
            historialSeleccionado,
            onDataChange,
          );
        }
      });
  }

  fabContainer.classList.remove("visible");
  requestAnimationFrame(function () {
    fabContainer.classList.add("visible");
  });
}

function ocultarAsignarFAB() {
  let fabContainer = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarAsignarFABsTimeout = setTimeout(function () {
    let contenedor = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarAsignarFABsTimeout = null;
  }, 300);
}

// ============================================================
// CLICK OUTSIDE - Deselecciona historial al clickear fuera
// ============================================================

function configurarClickOutsideAsignar(corte, onDataChange) {
  if (outsideClickAbortControllerAT) {
    outsideClickAbortControllerAT.abort();
  }
  outsideClickAbortControllerAT = new AbortController();

  document.addEventListener(
    "click",
    function (e) {
      if (!historialSeleccionado) return;

      let historialEl = document.getElementById("at-asignar-historial");
      let fabEl = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);

      // Si el click esta dentro del historial o del FAB, ignorar
      if (historialEl && historialEl.contains(e.target)) return;
      if (fabEl && fabEl.contains(e.target)) return;

      // Click fuera: deseleccionar
      let selected = document.querySelector(
        ".at-asignar__historial-row.selected",
      );
      if (selected) selected.classList.remove("selected");
      ocultarAsignarFAB();
      historialSeleccionado = null;
    },
    { signal: outsideClickAbortControllerAT.signal },
  );
}

// ============================================================
// PROCESAR ASIGNACION - Valida, crea tarea si es nueva, y guarda
// ============================================================

/**
 * Recolecta las cantidades por talla desde los inputs del DOM.
 * @param {Object} corte
 * @param {number} trabajadorId
 * @param {string} fecha - Fecha ISO para las asignaciones
 * @returns {Array} - Asignaciones con { trabajadorId, cantidad, talla, fecha }
 */
function recogerAsignacionesPorTalla(corte, trabajadorId, fecha) {
  let asignaciones = [];
  corte.tallas.forEach(function (talla) {
    let inputId = "input-talla-" + talla.talla.replace(/\s+/g, "-");
    let input = document.getElementById(inputId);
    let cantidad = input ? parseInt(input.value, 10) || 0 : 0;
    if (cantidad > 0) {
      asignaciones.push({
        trabajadorId: trabajadorId,
        cantidad: cantidad,
        talla: talla.talla,
        fecha: fecha,
      });
    }
  });
  return asignaciones;
}

async function procesarAsignacion(corte, onDataChange) {
  let selectTrabajador = document.getElementById("select-asignar-trabajador");
  let selectTarea = document.getElementById("select-asignar-tarea");
  let errorEl = document.getElementById("error-asignacion");

  if (!selectTrabajador || !selectTarea) return;

  let trabajadorId = selectTrabajador.value
    ? parseInt(selectTrabajador.value, 10)
    : null;
  let tareaValue = selectTarea.value;

  // Resetear errores
  errorEl.hidden = true;

  if (!trabajadorId) {
    errorEl.textContent = "Selecciona un trabajador";
    errorEl.hidden = false;
    selectTrabajador.focus();
    return;
  }
  if (!tareaValue) {
    errorEl.textContent = "Selecciona una tarea";
    errorEl.hidden = false;
    selectTarea.focus();
    return;
  }

  let esCrear = tareaValue === "__nueva__";
  let tieneTallas = corte.tallas && corte.tallas.length > 0;
  let fecha = new Date().toISOString();
  let tareasActualizadas;

  if (esCrear) {
    // ---- MODO CREAR NUEVA TAREA ----

    let inputNombre = document.getElementById("input-asignar-nombre-tarea");
    let nombre = inputNombre ? inputNombre.value.trim() : "";
    let errorNombre = document.getElementById("error-asignar-nombre");

    // Validar nombre
    if (!nombre) {
      errorNombre.textContent = "El nombre no puede estar vacio";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    // Verificar duplicado
    let duplicado = (corte.tareas || []).some(function (t) {
      return (t.nombre || "").trim().toLowerCase() === nombre.toLowerCase();
    });
    if (duplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    // Validar precio
    let inputPrecio = document.getElementById("input-asignar-precio");
    let precio = inputPrecio ? parseInt(inputPrecio.value, 10) || 0 : 0;

    if (precio <= 0) {
      errorEl.textContent = "El precio debe ser mayor a 0";
      errorEl.hidden = false;
      inputPrecio.classList.add("form-input--error");
      inputPrecio.focus();
      return;
    }

    // Calcular id unico para la nueva tarea
    let cantidadPrendas = corte.tallas.reduce(function (s, t) {
      return s + t.cantidad;
    }, 0);
    let nuevoId =
      ((corte.tareas || []).length > 0
        ? Math.max.apply(
            null,
            corte.tareas.map(function (t) {
              return t.id || 0;
            }),
          )
        : 0) + 1;

    let nuevaTarea = {
      id: nuevoId,
      nombre: nombre,
      precioUnitario: precio,
      unidadesTotales: cantidadPrendas,
      asignaciones: [],
    };

    // Recolectar asignaciones (por talla o global)
    if (tieneTallas) {
      let nuevasAsignaciones = recogerAsignacionesPorTalla(
        corte,
        trabajadorId,
        fecha,
      );
      if (nuevasAsignaciones.length === 0) {
        errorEl.textContent = "Ingresa al menos una cantidad por talla";
        errorEl.hidden = false;
        return;
      }
      nuevaTarea.asignaciones = nuevasAsignaciones;
    } else {
      let inputCantidad = document.getElementById(
        "input-asignar-cantidad-global",
      );
      let cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) || 0 : 0;
      if (!cantidad || cantidad < 1) {
        errorEl.textContent = "Ingresa una cantidad valida";
        errorEl.hidden = false;
        if (inputCantidad) inputCantidad.focus();
        return;
      }
      nuevaTarea.asignaciones = [
        {
          trabajadorId: trabajadorId,
          cantidad: cantidad,
          talla: null,
          fecha: fecha,
        },
      ];
    }

    tareasActualizadas = (corte.tareas || []).concat([nuevaTarea]);
  } else {
    // ---- MODO TAREA EXISTENTE ----

    let tareaId = parseInt(tareaValue, 10);
    let tareaIdx = (corte.tareas || []).findIndex(function (t) {
      return t.id === tareaId;
    });

    if (tareaIdx < 0) {
      errorEl.textContent = "Tarea no encontrada";
      errorEl.hidden = false;
      return;
    }

    let tarea = corte.tareas[tareaIdx];

    // Detectar si el precio fue modificado
    let inputPrecio = document.getElementById("input-asignar-precio");
    let nuevoPrecio = inputPrecio
      ? parseInt(inputPrecio.value, 10) || 0
      : tarea.precioUnitario || 0;

    // Recolectar asignaciones (por talla o global)
    let nuevasAsignaciones;
    if (tieneTallas) {
      nuevasAsignaciones = recogerAsignacionesPorTalla(
        corte,
        trabajadorId,
        fecha,
      );
      if (nuevasAsignaciones.length === 0) {
        errorEl.textContent = "Ingresa al menos una cantidad por talla";
        errorEl.hidden = false;
        return;
      }
    } else {
      let inputCantidad = document.getElementById(
        "input-asignar-cantidad-global",
      );
      let cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) || 0 : 0;
      if (!cantidad || cantidad < 1) {
        errorEl.textContent = "Ingresa una cantidad valida";
        errorEl.hidden = false;
        if (inputCantidad) inputCantidad.focus();
        return;
      }
      nuevasAsignaciones = [
        {
          trabajadorId: trabajadorId,
          cantidad: cantidad,
          talla: null,
          fecha: fecha,
        },
      ];
    }

    // Actualizar la tarea con nuevas asignaciones y precio (si cambio)
    tareasActualizadas = (corte.tareas || []).map(function (t, i) {
      if (i === tareaIdx) {
        return Object.assign({}, t, {
          precioUnitario: nuevoPrecio,
          asignaciones: (t.asignaciones || []).concat(nuevasAsignaciones),
        });
      }
      return t;
    });
  }

  // Persistir en IndexedDB
  try {
    await db.cortes.update(corte.id, { tareas: tareasActualizadas });
    mostrarToast("Asignacion guardada", "success");
    if (onDataChange) await onDataChange();
  } catch (err) {
    console.error("Error al guardar asignacion:", err);
    mostrarToast("Error al guardar", "error");
  }
}

// ============================================================
// ELIMINAR ASIGNACIONES - Borra TODAS las asignaciones de un
// trabajador en una tarea especifica (eliminacion masiva).
// ============================================================

function confirmarEliminarAsignacion(corte, seleccion, onDataChange) {
  let tarea = (corte.tareas || [])[seleccion.tareaIdx];
  let tareaNombre = tarea ? tarea.nombre || "Sin nombre" : "desconocida";

  mostrarModalConfirmar(
    "Eliminar Asignaciones",
    'Se eliminaran TODAS las asignaciones de este trabajador en la tarea "' +
      tareaNombre +
      '".',
    "danger",
    async function () {
      try {
        // Filtrar TODAS las asignaciones de ese trabajador en esa tarea
        let tareasActualizadas = (corte.tareas || []).map(function (t, i) {
          if (i === seleccion.tareaIdx) {
            let nuevasAsignaciones = (t.asignaciones || []).filter(
              function (a) {
                return a.trabajadorId !== seleccion.trabajadorId;
              },
            );
            return Object.assign({}, t, { asignaciones: nuevasAsignaciones });
          }
          return t;
        });

        await db.cortes.update(corte.id, { tareas: tareasActualizadas });
        ocultarAsignarFAB();
        historialSeleccionado = null;
        mostrarToast("Asignaciones eliminadas", "success");
        if (onDataChange) await onDataChange();
      } catch (err) {
        console.error("Error al eliminar asignaciones:", err);
        mostrarToast("Error al eliminar", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

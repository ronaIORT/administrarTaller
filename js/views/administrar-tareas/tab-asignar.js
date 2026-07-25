// ============================================================
// TAB ASIGNAR - Formulario de asignacion de tareas a trabajadores
// Permite seleccionar trabajador y tarea (de cualquier componente),
// ingresar cantidades por talla (con toggle click 0/max), crear
// nuevas tareas inline on-the-fly, y ver el historial de
// asignaciones agrupado por trabajador+tarea con eliminacion masiva.
// Si el corte esta finalizado, bloquea nuevas asignaciones.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBsCtv } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast } from "../shared.js";

// ============================================================
// CONSTANTES DEL MODULO
// ============================================================

/** ID del contenedor de FABs para historial */
var ASIGNAR_FAB_CONTAINER_ID = "at-asignar-fab-container";

/** Datos de la fila de historial seleccionada { trabajadorId, componenteIdx, tareaIdx } */
var historialSeleccionado = null;

/** Timeout para ocultar FABs con animacion */
var ocultarAsignarFABsTimeout = null;

/** AbortController para limpiar listener de click-outside */
var outsideClickAbortControllerAT = null;

/** Precio unitario de la tarea actualmente seleccionada (en centavos) */
var precioActualCtv = 0;

/** Filtro de componente activo para el select de tareas ("__todas" o nombre de componente) */
var componenteFiltroAsignar = "__todas";

// ============================================================
// HELPERS DE DISPONIBILIDAD
// ============================================================

/**
 * Devuelve las tareas que aun tienen al menos una talla con unidades
 * disponibles (global, sin importar trabajador). Itera los componentes
 * y sus tareas anidadas. Se usa para poblar el select de tareas:
 * solo tareas que no estan completamente asignadas.
 * @param {Object} corte - Corte con array tallas[] y componentes[]
 * @returns {Array} - [{ tarea, componenteIdx, tareaIdx, compNombre }]
 */
function getTareasDisponibles(corte, compFiltro) {
  var result = [];
  (corte.componentes || []).forEach(function (comp, componenteIdx) {
    if (compFiltro && compFiltro !== "__todas" && comp.nombre !== compFiltro) return;
    (comp.tareas || []).forEach(function (tarea, tareaIdx) {
      var asignadas = {};
      (tarea.asignaciones || []).forEach(function (a) {
        if (a.talla) {
          asignadas[a.talla] = (asignadas[a.talla] || 0) + (a.cantidad || 0);
        }
      });
      var hayDisponible = (corte.tallas || []).some(function (t) {
        var restante = t.cantidad - (asignadas[t.talla] || 0);
        return restante > 0;
      });
      if (hayDisponible) {
        result.push({
          tarea: tarea,
          componenteIdx: componenteIdx,
          tareaIdx: tareaIdx,
          compNombre: comp.nombre,
        });
      }
    });
  });
  return result;
}

/**
 * Reconstruye el select de tareas segun el filtro de componente activo.
 * Limpia la seleccion y oculta los campos dinamicos.
 * @param {Object} corte
 */
function rebuildTareaSelectOptions(corte) {
  var select = document.getElementById("select-asignar-tarea");
  if (!select) return;
  var lista = getTareasDisponibles(corte, componenteFiltroAsignar);
  select.innerHTML =
    '<option value="">Seleccionar tarea...</option>' +
    '<option value="__nueva__">＋ Crear nueva tarea</option>' +
    lista.map(function (item) {
      return '<option value="' + item.componenteIdx + "-" + item.tareaIdx + '">' +
        escaparHTML(item.tarea.nombre || "Sin nombre") +
        " (" + escaparHTML(item.compNombre) + ")" +
        "</option>";
    }).join("");
  select.value = "";
  ocultarCamposAsignacion();
  var btn = document.getElementById("btn-submit-asignacion");
  if (btn) btn.disabled = true;
}

/**
 * Calcula las unidades disponibles por talla para un trabajador
 * especifico en una tarea. Resta del total del corte todas las
 * asignaciones existentes (de todos los trabajadores) en esa tarea.
 * @param {Object} corte - Corte con array tallas[]
 * @param {Object} tarea - Tarea con array asignaciones[]
 * @returns {Object} - Mapa { nombreTalla: cantidadDisponible }
 */
function getTallasDisponiblesParaTarea(corte, tarea) {
  var asignadas = {};
  (tarea.asignaciones || []).forEach(function (a) {
    if (a.talla) {
      asignadas[a.talla] = (asignadas[a.talla] || 0) + (a.cantidad || 0);
    }
  });
  var disponibles = {};
  (corte.tallas || []).forEach(function (t) {
    disponibles[t.talla] = Math.max(0, t.cantidad - (asignadas[t.talla] || 0));
  });
  return disponibles;
}

/**
 * Agrupa las asignaciones del corte por (trabajadorId, componenteIdx, tareaIdx)
 * para mostrar en el historial con el formato: M(5), L(3).
 * Itera los componentes y sus tareas anidadas.
 * @param {Object} corte - Corte con array componentes[]
 * @param {Object} trabajadoresMap - Mapa id -> nombre
 * @returns {Array} - Grupos [{ trabajadorId, componenteIdx, tareaIdx, trabajadorNombre, tareaNombre, compNombre, tallasStr }]
 */
function agruparAsignacionesPorTrabajador(corte, trabajadoresMap) {
  var grupos = [];

  (corte.componentes || []).forEach(function (comp, componenteIdx) {
    (comp.tareas || []).forEach(function (tarea, tareaIdx) {
      var porTrabajador = {};
      (tarea.asignaciones || []).forEach(function (a) {
        var key = a.trabajadorId;
        if (!porTrabajador[key]) {
          porTrabajador[key] = [];
        }
        porTrabajador[key].push(a);
      });

      Object.keys(porTrabajador).forEach(function (tId) {
        var trabajadorId = parseInt(tId, 10);
        var asignaciones = porTrabajador[tId];

        var tallasStr = asignaciones
          .map(function (a) {
            if (a.talla) {
              return '<span class="at-asignar__historial-talla">' + escaparHTML(a.talla) + ' (' + a.cantidad + ')</span>';
            }
            return '<span class="at-asignar__historial-talla">x' + a.cantidad + '</span>';
          })
          .join("");

        // Fecha mas reciente entre todas las asignaciones del grupo
        var fechaMasReciente = asignaciones.reduce(function (max, a) {
          return (a.fecha || "") > max ? a.fecha : max;
        }, "");

        grupos.push({
          trabajadorId: trabajadorId,
          trabajadorNombre:
            trabajadoresMap[trabajadorId] || "Trab. " + trabajadorId,
          componenteIdx: componenteIdx,
          tareaIdx: tareaIdx,
          tareaNombre: tarea.nombre || "Sin nombre",
          compNombre: comp.nombre,
          tallasStr: tallasStr,
          fechaMasReciente: fechaMasReciente,
        });
      });
    });
  });

  // Ordenar por asignacion mas reciente primero
  grupos.sort(function (a, b) {
    return b.fechaMasReciente > a.fechaMasReciente ? 1 :
           b.fechaMasReciente < a.fechaMasReciente ? -1 : 0;
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
  var tallasVisibles = (corte.tallas || []).filter(function (t) {
    return t.cantidad > 0;
  });

  if (tallasVisibles.length === 0) {
    return '<p class="form-hint">Todas las tallas estan asignadas en este corte</p>';
  }

  var sumaTotal = tallasVisibles.reduce(function (s, t) {
    return s + t.cantidad;
  }, 0);
  var totalCtvCrear = sumaTotal * precioActualCtv;

  return (
    '<label class="form-label" id="contador-tallas-label">Tallas: ' +
    tallasVisibles.length +
    " | Cantidad: " +
    sumaTotal +
    " | Total: " +
    formatBsCtv(totalCtvCrear) +
    "</label>" +
    '<div class="at-asignar__tallas-grid">' +
    tallasVisibles
      .map(function (talla) {
        var nombreEscapado = escaparHTML(talla.talla);
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
  var tallasVisibles = (corte.tallas || []).filter(function (t) {
    return (disponibles[t.talla] || 0) > 0;
  });

  if (tallasVisibles.length === 0) {
    return '<p class="form-hint">No hay tallas disponibles para esta tarea</p>';
  }

  var numTallasDisp = tallasVisibles.length;
  var sumaDisp = tallasVisibles.reduce(function (s, t) {
    return s + (disponibles[t.talla] || 0);
  }, 0);
  var totalCtvExistente = sumaDisp * precioActualCtv;

  return (
    '<label class="form-label" id="contador-tallas-label">Tallas: ' +
    numTallasDisp +
    " | Cantidad: " +
    sumaDisp +
    " | Total: " +
    formatBsCtv(totalCtvExistente) +
    "</label>" +
    '<div class="at-asignar__tallas-grid">' +
    tallasVisibles
      .map(function (talla) {
        var nombreEscapado = escaparHTML(talla.talla);
        var disponible = disponibles[talla.talla] || 0;
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
  var grupoNombre = document.getElementById("grupo-nombre-tarea-asignar");
  var grupoPrecio = document.getElementById("grupo-precio-asignar");
  var grupoComponente = document.getElementById("grupo-componente-asignar");
  var tallasContainer = document.getElementById("asignar-tallas-container");
  var errorEl = document.getElementById("error-asignacion");

  if (grupoNombre) grupoNombre.style.display = "none";
  if (grupoPrecio) grupoPrecio.style.display = "none";
  if (grupoComponente) grupoComponente.style.display = "none";
  if (tallasContainer) tallasContainer.innerHTML = "";
  if (errorEl) errorEl.hidden = true;
  precioActualCtv = 0;
}

/**
 * Centraliza la logica de mostrar/ocultar campos de asignacion
 * segun los selects de trabajador y tarea.
 * Si ambos selects tienen valor, muestra los campos correspondientes.
 * Si falta alguno, oculta todo y resetea el boton submit.
 * El select de tarea usa valores compuestos "compIdx-tareaIdx".
 */
function actualizarCamposAsignacion(corte) {
  var selectTrabajador = document.getElementById("select-asignar-trabajador");
  var selectTarea = document.getElementById("select-asignar-tarea");
  var btnSubmit = document.getElementById("btn-submit-asignacion");

  var trabajadorId = selectTrabajador && selectTrabajador.value
    ? parseInt(selectTrabajador.value, 10) : null;
  var tareaValue = selectTarea ? selectTarea.value : "";

  if (!trabajadorId || !tareaValue) {
    ocultarCamposAsignacion();
    if (btnSubmit) btnSubmit.disabled = true;
    return;
  }

  if (btnSubmit) btnSubmit.disabled = false;

  if (tareaValue === "__nueva__") {
    modoCrearInine(corte, trabajadorId);
  } else {
    // Parsear valor compuesto "compIdx-tareaIdx"
    var partes = tareaValue.split("-");
    var componenteIdx = parseInt(partes[0], 10);
    var tareaIdx = parseInt(partes[1], 10);
    var comp = (corte.componentes || [])[componenteIdx];
    if (comp) {
      var tarea = (comp.tareas || [])[tareaIdx];
      if (tarea) {
        modoExistente(corte, tarea, trabajadorId);
      }
    }
  }
}

/**
 * Configura el modo "crear nueva tarea" inline.
 * Muestra select de componente, input de nombre, precio vacio,
 * y tallas con max del corte.
 * @param {Object} corte
 * @param {number} trabajadorId - ID del trabajador seleccionado
 */
function modoCrearInine(corte, trabajadorId) {
  precioActualCtv = 0;

  var grupoNombre = document.getElementById("grupo-nombre-tarea-asignar");
  var inputNombre = document.getElementById("input-asignar-nombre-tarea");
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
  var grupoPrecio = document.getElementById("grupo-precio-asignar");
  var inputPrecio = document.getElementById("input-asignar-precio");
  grupoPrecio.style.display = "";
  inputPrecio.value = "";

  // Mostrar select de componente o pre-seleccionar si hay filtro activo
  var grupoComponente = document.getElementById("grupo-componente-asignar");
  var compSelect = document.getElementById("input-asignar-componente");
  if (grupoComponente && compSelect) {
    if (componenteFiltroAsignar !== "__todas") {
      compSelect.value = componenteFiltroAsignar;
      grupoComponente.style.display = "none";
    } else {
      grupoComponente.style.display = "";
    }
  }

  // Renderizar tallas o cantidad global
  var tallasContainer = document.getElementById("asignar-tallas-container");
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
 * Oculta nombre y componente, muestra precio pre-rellenado, tallas con disponibles.
 * @param {Object} corte
 * @param {Object} tarea - La tarea seleccionada
 * @param {number} trabajadorId - ID del trabajador seleccionado
 */
function modoExistente(corte, tarea, trabajadorId) {
  var grupoNombre = document.getElementById("grupo-nombre-tarea-asignar");
  grupoNombre.style.display = "none";

  var grupoComponente = document.getElementById("grupo-componente-asignar");
  if (grupoComponente) grupoComponente.style.display = "none";

  var grupoPrecio = document.getElementById("grupo-precio-asignar");
  var inputPrecio = document.getElementById("input-asignar-precio");
  grupoPrecio.style.display = "";
  inputPrecio.value = tarea.precioUnitario || 0;
  precioActualCtv = tarea.precioUnitario || 0;

  var tallasContainer = document.getElementById("asignar-tallas-container");
  if (corte.tallas && corte.tallas.length > 0) {
    var disponibles = getTallasDisponiblesParaTarea(corte, tarea);
    tallasContainer.innerHTML = renderizarHTMLTallasModoExistente(corte, disponibles);
    configurarToggleTallas();
  } else {
    var asignadasGlobal = (tarea.asignaciones || []).reduce(function (s, a) {
      return s + (a.cantidad || 0);
    }, 0);
    var totalDisponible = Math.max(0, (tarea.unidadesTotales || 0) - asignadasGlobal);
    tallasContainer.innerHTML = renderizarHTMLCantidadGlobal(totalDisponible);
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
  var totalCtv = suma * precioActualCtv;
  label.textContent = "Tallas: " + numTallas + " | Cantidad: " + suma + " | Total: " + formatBsCtv(totalCtv);
}

/**
 * Registra los event listeners de toggle en los botones de talla.
 * Cada click alterna entre 0 y el maximo configurado en data-max.
 * Tambien registra listeners de input para actualizar el contador.
 */
function configurarToggleTallas() {
  var labels = document.querySelectorAll(".at-asignar__talla-label");
  labels.forEach(function (label) {
    label.addEventListener("click", function () {
      var max = parseInt(label.dataset.max, 10) || 0;
      var tallaNombre = label.dataset.talla;
      var inputId = "input-talla-" + tallaNombre.replace(/\s+/g, "-");
      var input = document.getElementById(inputId);
      if (!input) return;

      var currentVal = parseInt(input.value, 10) || 0;
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

  var inputs = document.querySelectorAll(".at-asignar__talla-input");
  inputs.forEach(function (input) {
    input.addEventListener("input", function () {
      var tallaNombre = this.id.replace("input-talla-", "").replace(/-/g, " ");
      var labelBtn = document.querySelector(
        '.at-asignar__talla-label[data-talla="' + tallaNombre + '"]',
      );
      if (labelBtn) {
        var val = parseInt(this.value, 10) || 0;
        var max = parseInt(labelBtn.dataset.max, 10) || 0;

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
  var trabajadoresMap = opciones.trabajadoresMap;
  var onDataChange = opciones.onDataChange;

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
  componenteFiltroAsignar = "__todas";

  var esTerminado = corte.estado === "terminado";

  // Opciones del select de trabajador
  var opcionesTrabajadores =
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

  // Opciones del select de tarea — filtra por componente activo
  // Cada option tiene valor compuesto "compIdx-tareaIdx"
  var tareasDisponibles = getTareasDisponibles(corte, componenteFiltroAsignar);
  var opcionesTareas =
    '<option value="">Seleccionar tarea...</option>' +
    '<option value="__nueva__">＋ Crear nueva tarea</option>' +
    tareasDisponibles
      .map(function (item) {
        return (
          '<option value="' +
          item.componenteIdx +
          "-" +
          item.tareaIdx +
          '">' +
          escaparHTML(item.tarea.nombre || "Sin nombre") +
          " (" + escaparHTML(item.compNombre) + ")" +
          "</option>"
        );
      })
      .join("");

  // Filter-chips de componente
  var compsNombres = (corte.componentes || []).map(function (c) { return c.nombre; });
  var compsData = compsNombres.length > 0 ? compsNombres : [];
  var componenteChipsHTML = '<button class="filter-chip' + (componenteFiltroAsignar === "__todas" ? " active" : "") + '" data-componente="__todas">Todas</button>';
  compsData.forEach(function (c) {
    var activo = componenteFiltroAsignar === c ? " active" : "";
    componenteChipsHTML += '<button class="filter-chip' + activo + '" data-componente="' + escaparHTML(c) + '">' + escaparHTML(c) + '</button>';
  });

  // Construir historial agrupado
  var historialHTML = construirHistorialHTML(corte, trabajadoresMap);

  // Opciones del select de componente para modo crear
  var opcionesComponente =
    '<option value="">Seleccionar componente...</option>' +
    ((corte.componentes || []).length > 0
      ? (corte.componentes || []).map(function (c) {
          return '<option value="' + escaparHTML(c.nombre) + '">' + escaparHTML(c.nombre) + '</option>';
        }).join("")
      : '<option value="General">General</option>');

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
    // Filtro por componente
    '<div class="filter-chips" id="asignar-componente-filter-chips">' + componenteChipsHTML + '</div>' +
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
    // Select de componente para nueva tarea (oculto, solo en modo crear)
    '<div class="form-group" id="grupo-componente-asignar" style="display:none">' +
    '<label for="input-asignar-componente" class="form-label">Componente</label>' +
    '<select id="input-asignar-componente" class="form-select">' +
    opcionesComponente +
    "</select>" +
    '<p id="error-asignar-componente" class="form-error" hidden></p>' +
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
      : '<button type="button" class="btn btn--success at-asignar__submit" id="btn-submit-asignacion" disabled>Asignar Tareas</button>') +
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
    // Select trabajador: al cambiar, actualizar campos
    document
      .getElementById("select-asignar-trabajador")
      .addEventListener("change", function () {
        actualizarCamposAsignacion(corte);
      });

    // Select tarea: al cambiar, actualizar campos segun ambos selects
    document
      .getElementById("select-asignar-tarea")
      .addEventListener("change", function () {
        actualizarCamposAsignacion(corte);
      });

    // Filtro por componente: actualizar las opciones del select de tarea
    document.getElementById("asignar-componente-filter-chips").addEventListener("click", function (e) {
      var chip = e.target.closest(".filter-chip");
      if (!chip) return;
      componenteFiltroAsignar = chip.dataset.componente;
      this.querySelectorAll(".filter-chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
      rebuildTareaSelectOptions(corte);
    });

    // Input precio: sincronizar precioActualCtv y actualizar contador
    document
      .getElementById("input-asignar-precio")
      .addEventListener("input", function () {
        precioActualCtv = parseInt(this.value, 10) || 0;
        actualizarContadorTallas();
      });

    // Boton + : atajo para seleccionar "__nueva__" en el dropdown (modo crear inline)
    document
      .getElementById("btn-nueva-tarea-asignar")
      .addEventListener("click", function () {
        var selectTarea = document.getElementById("select-asignar-tarea");
        var selectTrabajador = document.getElementById(
          "select-asignar-trabajador",
        );

        if (!selectTrabajador.value) {
          mostrarToast("Primero selecciona un trabajador", "warning");
          return;
        }

        selectTarea.value = "__nueva__";
        actualizarCamposAsignacion(corte);
      });

    // Boton submit: procesar asignacion
    document
      .getElementById("btn-submit-asignacion")
      .addEventListener("click", function () {
        procesarAsignacion(corte, onDataChange);
      });
  }

  // Delegacion de clicks en el historial (seleccion + eliminar inline)
  var historialContainer = document.getElementById("at-asignar-historial");
  if (historialContainer) {
    historialContainer.addEventListener("click", function (e) {
      // Boton eliminar inline (prioridad sobre seleccion de fila)
      var deleteBtn = e.target.closest(".at-asignar__historial-delete");
      if (deleteBtn) {
        var sel = {
          trabajadorId: parseInt(deleteBtn.dataset.trabajadorId, 10),
          componenteIdx: parseInt(deleteBtn.dataset.componente, 10),
          tareaIdx: parseInt(deleteBtn.dataset.tarea, 10),
        };
        confirmarEliminarAsignacion(corte, sel, onDataChange);
        return;
      }

      // Seleccion de fila para FAB (mobile)
      var row = e.target.closest(".at-asignar__historial-row");
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
  var grupos = agruparAsignacionesPorTrabajador(corte, trabajadoresMap);

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
          '" data-componente="' +
          g.componenteIdx +
          '" data-tarea="' +
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
          '" data-componente="' +
          g.componenteIdx +
          '" data-tarea="' +
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
  var prevSelected = document.querySelector(
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
    componenteIdx: parseInt(row.dataset.componente, 10),
    tareaIdx: parseInt(row.dataset.tarea, 10),
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

  var fabContainer = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);
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
  var fabContainer = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarAsignarFABsTimeout = setTimeout(function () {
    var contenedor = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);
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

      var historialEl = document.getElementById("at-asignar-historial");
      var fabEl = document.getElementById(ASIGNAR_FAB_CONTAINER_ID);

      // Si el click esta dentro del historial o del FAB, ignorar
      if (historialEl && historialEl.contains(e.target)) return;
      if (fabEl && fabEl.contains(e.target)) return;

      // Click fuera: deseleccionar
      var selected = document.querySelector(
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
  var asignaciones = [];
  corte.tallas.forEach(function (talla) {
    var inputId = "input-talla-" + talla.talla.replace(/\s+/g, "-");
    var input = document.getElementById(inputId);
    var cantidad = input ? parseInt(input.value, 10) || 0 : 0;
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
  var selectTrabajador = document.getElementById("select-asignar-trabajador");
  var selectTarea = document.getElementById("select-asignar-tarea");
  var errorEl = document.getElementById("error-asignacion");

  if (!selectTrabajador || !selectTarea) return;

  var trabajadorId = selectTrabajador.value
    ? parseInt(selectTrabajador.value, 10)
    : null;
  var tareaValue = selectTarea.value;

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

  var esCrear = tareaValue === "__nueva__";
  var tieneTallas = corte.tallas && corte.tallas.length > 0;
  var fecha = new Date().toISOString();
  var componentesActualizados;

  if (esCrear) {
    // ---- MODO CREAR NUEVA TAREA ----

    var inputNombre = document.getElementById("input-asignar-nombre-tarea");
    var nombre = inputNombre ? inputNombre.value.trim() : "";
    var errorNombre = document.getElementById("error-asignar-nombre");

    // Validar nombre
    if (!nombre) {
      errorNombre.textContent = "El nombre no puede estar vacio";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    // Verificar duplicado (en todos los componentes)
    var duplicado = false;
    (corte.componentes || []).forEach(function (comp) {
      (comp.tareas || []).forEach(function (t) {
        if ((t.nombre || "").trim().toLowerCase() === nombre.toLowerCase()) {
          duplicado = true;
        }
      });
    });
    if (duplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    // Validar precio
    var inputPrecio = document.getElementById("input-asignar-precio");
    var precio = inputPrecio ? parseInt(inputPrecio.value, 10) || 0 : 0;

    if (precio <= 0) {
      errorEl.textContent = "El precio debe ser mayor a 0";
      errorEl.hidden = false;
      inputPrecio.classList.add("form-input--error");
      inputPrecio.focus();
      return;
    }

    // Obtener el componente seleccionado
    var componenteSelect = document.getElementById("input-asignar-componente");
    var componenteNombre = componenteSelect ? componenteSelect.value : "";
    var errorComponente = document.getElementById("error-asignar-componente");

    if (!componenteNombre) {
      errorComponente.textContent = "Selecciona un componente";
      errorComponente.hidden = false;
      if (componenteSelect) componenteSelect.focus();
      return;
    }

    // Calcular id unico para la nueva tarea (max entre todos los componentes)
    var todosIds = [];
    (corte.componentes || []).forEach(function (comp) {
      (comp.tareas || []).forEach(function (t) {
        todosIds.push(t.id || 0);
      });
    });
    var nuevoId = todosIds.length > 0 ? Math.max.apply(null, todosIds) + 1 : 1;

    // Calcular cantidad de prendas desde las tallas
    var cantidadPrendas = (corte.tallas || []).reduce(function (s, t) {
      return s + t.cantidad;
    }, 0);

    var nuevaTarea = {
      id: nuevoId,
      nombre: nombre,
      precioUnitario: precio,
      unidadesTotales: cantidadPrendas,
      asignaciones: [],
    };

    // Recolectar asignaciones (por talla o global)
    if (tieneTallas) {
      var nuevasAsignaciones = recogerAsignacionesPorTalla(
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
      var inputCantidad = document.getElementById(
        "input-asignar-cantidad-global",
      );
      var cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) || 0 : 0;
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

    // Buscar el componente por nombre; si no existe, crearlo
    var componentes = corte.componentes || [];
    var idxComponente = -1;
    for (var ci = 0; ci < componentes.length; ci++) {
      if (componentes[ci].nombre === componenteNombre) {
        idxComponente = ci;
        break;
      }
    }

    if (idxComponente >= 0) {
      // Agregar tarea al componente existente
      componentesActualizados = componentes.map(function (c, i) {
        if (i === idxComponente) {
          return Object.assign({}, c, {
            tareas: (c.tareas || []).concat([nuevaTarea]),
          });
        }
        return c;
      });
    } else {
      // Crear nuevo componente "General" o el nombre elegido
      componentesActualizados = componentes.concat([
        {
          nombre: componenteNombre,
          tareas: [nuevaTarea],
        },
      ]);
    }
  } else {
    // ---- MODO TAREA EXISTENTE ----

    // Parsear valor compuesto "compIdx-tareaIdx"
    var partes = tareaValue.split("-");
    var componenteIdx = parseInt(partes[0], 10);
    var tareaIdx = parseInt(partes[1], 10);

    var comp = (corte.componentes || [])[componenteIdx];
    if (!comp || !(comp.tareas || [])[tareaIdx]) {
      errorEl.textContent = "Tarea no encontrada";
      errorEl.hidden = false;
      return;
    }

    var tarea = comp.tareas[tareaIdx];

    // Detectar si el precio fue modificado
    var nuevoPrecio = inputPrecio
      ? parseInt(inputPrecio.value, 10) || 0
      : tarea.precioUnitario || 0;

    // Recolectar asignaciones (por talla o global)
    var nuevasAsignaciones;
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
      var inputCantidad = document.getElementById(
        "input-asignar-cantidad-global",
      );
      var cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) || 0 : 0;
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
    componentesActualizados = (corte.componentes || []).map(function (c, ci) {
      if (ci === componenteIdx) {
        var tareasActualizadas = (c.tareas || []).map(function (t, ti) {
          if (ti === tareaIdx) {
            return Object.assign({}, t, {
              precioUnitario: nuevoPrecio,
              asignaciones: (t.asignaciones || []).concat(nuevasAsignaciones),
            });
          }
          return t;
        });
        return Object.assign({}, c, { tareas: tareasActualizadas });
      }
      return c;
    });
  }

  // Persistir en IndexedDB
  try {
    await db.cortes.update(corte.id, { componentes: componentesActualizados });
    mostrarToast("Asignacion guardada", "success");
    if (onDataChange) await onDataChange();
  } catch (err) {
    console.error("Error al guardar asignacion:", err);
    mostrarToast("Error al guardar", "error");
  }
}

// ============================================================
// ELIMINAR ASIGNACIONES - Borra TODAS las asignaciones de un
// trabajador en una tarea de un componente (eliminacion masiva).
// ============================================================

function confirmarEliminarAsignacion(corte, seleccion, onDataChange) {
  var comp = (corte.componentes || [])[seleccion.componenteIdx];
  var tarea = comp && (comp.tareas || [])[seleccion.tareaIdx];
  var tareaNombre = tarea ? tarea.nombre || "Sin nombre" : "desconocida";

  mostrarModalConfirmar(
    "Eliminar Asignaciones",
    'Se eliminaran TODAS las asignaciones de este trabajador en la tarea "' +
      tareaNombre +
      '".',
    "danger",
    async function () {
      try {
        // Filtrar TODAS las asignaciones de ese trabajador en esa tarea especifica
        var componentesActualizados = (corte.componentes || []).map(function (c, ci) {
          if (ci === seleccion.componenteIdx) {
            var tareasActualizadas = (c.tareas || []).map(function (t, ti) {
              if (ti === seleccion.tareaIdx) {
                var nuevasAsignaciones = (t.asignaciones || []).filter(
                  function (a) {
                    return a.trabajadorId !== seleccion.trabajadorId;
                  },
                );
                return Object.assign({}, t, { asignaciones: nuevasAsignaciones });
              }
              return t;
            });
            return Object.assign({}, c, { tareas: tareasActualizadas });
          }
          return c;
        });

        await db.cortes.update(corte.id, { componentes: componentesActualizados });
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

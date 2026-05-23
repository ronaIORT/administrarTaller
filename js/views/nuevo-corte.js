import { db } from "../db.js";
import { escaparHTML, formatCtv, formatCostoTotal, centavosABolivianos } from "../utils.js";
import { mostrarModalConfirmar, mostrarToast, crearHeader, estadoVacioHTML } from "./shared.js";

// ============================================================
// CONSTANTES Y ESTADO DEL MODULO
// ============================================================

/** ID del contenedor de FABs para acciones de tarea */
const TASK_FAB_CONTAINER_ID = "nc-tareas-fab-container";

/** ID de la prenda actualmente seleccionada en el dropdown */
let prendaSeleccionadaId = null;

/** Array local de tareas (clonadas de la prenda o agregadas manualmente) */
let tareasData = [];

/** Array local de tallas agregadas por el usuario */
let tallasData = [];

/** Indice de la fila de tarea actualmente seleccionada (o null) */
let filaTareaSeleccionada = null;

/** Timeout para ocultar FABs con delay (permite animacion CSS de salida) */
let ocultarTareasFABsTimeout = null;

/** AbortController para cancelar event listeners del documento al cambiar de vista */
let clickAbortControllerNC = null;

// ============================================================
// RENDER PRINCIPAL - Formulario de creacion de corte
// Limpia el DOM, carga prendas, construye el formulario y
// adjunta todos los event listeners.
// ============================================================

export async function renderNuevoCorte() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.remove("app--sidebar");

  if (clickAbortControllerNC) {
    clickAbortControllerNC.abort();
    clickAbortControllerNC = null;
  }
  clickAbortControllerNC = new AbortController();

  prendaSeleccionadaId = null;
  tareasData = [];
  tallasData = [];
  filaTareaSeleccionada = null;

  const header = crearHeader("Nuevo Corte", "#gestion-cortes");
  app.appendChild(header);

  const container = document.createElement("div");
  container.className = "app-container";
  app.appendChild(container);

  let prendas = [];
  try {
    prendas = await db.prendas.orderBy("nombre").toArray();
  } catch (err) {
    console.error("Error cargando prendas:", err);
  }

  const estadoPrendasVacio = prendas.length === 0;
  const opcionesPrendas = estadoPrendasVacio
    ? '<option value="">-- Sin prendas disponibles --</option>'
    : '<option value="">Seleccionar tipo de prenda...</option>' +
      prendas.map(function (p) {
        var nombre = escaparHTML(p.nombre);
        return '<option value="' + p.id + '">' + nombre + ' (' + (p.tareas ? p.tareas.length : 0) + ' tareas)</option>';
      }).join("");

  var htmlFormulario =
    '<form id="form-nuevo-corte" novalidate>' +
    '<div class="form-group">' +
    '<label class="form-label" for="select-prenda">Tipo de Prenda</label>' +
    '<div class="prendas-selector-row">' +
    '<select id="select-prenda" class="form-select" required>' +
    opcionesPrendas +
    '</select>' +
    '<button type="button" class="btn btn--outline btn--icon" id="btn-nueva-prenda-inline" aria-label="Crear nueva prenda" title="Crear nueva prenda">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    '</button>' +
    '</div>' +
    (estadoPrendasVacio ? '<p class="form-hint">No hay prendas. Crea una primero o usa el boton + para crear una rapida.</p>' : '') +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="input-nombre-corte">Nombre del Corte</label>' +
    '<input type="text" id="input-nombre-corte" class="form-input" placeholder="Ej: Corte #005, Lote Marzo" maxlength="100" required autocomplete="off" />' +
    '<p id="error-nombre-corte" class="form-error" hidden></p>' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="input-precio-venta">Precio de Venta Unitario (Bs)</label>' +
    '<input type="number" id="input-precio-venta" class="form-input" placeholder="0.00" min="0" step="0.01" required autocomplete="off" />' +
    '<p id="error-precio-venta" class="form-error" hidden></p>' +
    '</div>' +
    '<div class="form-group">' +
    '<div class="tallas-section-header">' +
    '<span class="section-title--sm">Tallas</span>' +
    '</div>' +
    '<div class="tallas-input-row">' +
    '<input type="text" id="input-talla-nombre" class="form-input" placeholder="Ej: S, M, L" maxlength="10" autocomplete="off" />' +
    '<input type="number" id="input-talla-cantidad" class="form-input" placeholder="Cant" min="1" max="9999" step="1" autocomplete="off" enterkeyhint="done" />' +
    '<button type="button" class="btn btn--outline btn--icon" id="btn-agregar-talla" aria-label="Agregar talla">' +
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    '</button>' +
    '</div>' +
    '<p id="error-talla-nombre" class="form-error" hidden></p>' +
    '<p id="error-talla-cantidad" class="form-error" hidden></p>' +
    '<div id="tallas-lista" class="tallas-lista">' +
    (tallasData.length === 0 ? estadoVacioHTML("Sin tallas", "Agrega tallas usando los campos de arriba") : "") +
    '</div>' +
    '<p class="tallas-total" id="tallas-total-p" style="display:none;">Total: <span class="tallas-total__numero" id="tallas-total-num">0</span> prendas</p>' +
    '</div>' +
    '<div class="form-group">' +
    '<div class="tareas-section-header">' +
    '<span class="section-title">Tareas</span>' +
    '</div>' +
    '<div id="tareas-tabla-container">' +
    renderTareasTabla(tareasData) +
    '</div>' +
    '</div>' +
    '<div class="form-group" id="nc-form-agregar-tarea">' +
    '<div class="agregar-tarea-row">' +
    '<input type="text" id="input-nc-nombre-tarea" class="form-input" placeholder="Nombre de la tarea" maxlength="60" autocomplete="off" />' +
    '<div class="input-precio-ctv-wrapper">' +
    '<input type="number" id="input-nc-precio-tarea" class="form-input" placeholder="0" min="0" max="9999" step="1" autocomplete="off" />' +
    '<span class="input-precio-ctv-sufijo">ctv</span>' +
    '</div>' +
    '<button type="button" class="btn btn--outline btn--sm" id="btn-nc-agregar-tarea">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    '</button>' +
    '</div>' +
    '<p id="error-nc-nombre-tarea" class="form-error" hidden></p>' +
    '<p id="error-nc-precio-tarea" class="form-error" hidden></p>' +
    '</div>' +
    '<div class="form-group" id="resumen-costos-container" style="display:none;">' +
    '<div class="resumen-costos">' +
    renderResumenCostosHTML() +
    '</div>' +
    '</div>' +
    '<div class="form-actions">' +
    '<button type="button" class="btn btn--secondary" id="btn-cancelar-corte">Cancelar</button>' +
    '<button type="submit" class="btn btn--primary" id="btn-guardar-corte">Guardar Corte</button>' +
    '</div>' +
    '</form>';

  container.innerHTML = htmlFormulario;

  document.getElementById("select-prenda").addEventListener("change", onPrendaChange);
  document.getElementById("btn-nueva-prenda-inline").addEventListener("click", abrirModalNuevaPrenda);
  document.getElementById("btn-agregar-talla").addEventListener("click", agregarTalla);
  document.getElementById("btn-cancelar-corte").addEventListener("click", function () {
    mostrarModalConfirmar(
      "Descartar cambios",
      "Estas seguro de descartar los cambios? Los datos no guardados se perderan.",
      "warning",
      function () {
        location.hash = "#gestion-cortes";
      }
    );
  });
  document.getElementById("form-nuevo-corte").addEventListener("submit", function (e) {
    e.preventDefault();
    guardarCorte();
  });

  document.getElementById("btn-nc-agregar-tarea").addEventListener("click", function () {
    var inputNombre = document.getElementById("input-nc-nombre-tarea");
    var inputPrecio = document.getElementById("input-nc-precio-tarea");
    var errorNombre = document.getElementById("error-nc-nombre-tarea");
    var errorPrecio = document.getElementById("error-nc-precio-tarea");
    var nombre = inputNombre.value.trim();
    var precio = parseInt(inputPrecio.value) || 0;

    errorNombre.hidden = true;
    errorPrecio.hidden = true;
    inputNombre.classList.remove("form-input--error");
    inputPrecio.classList.remove("form-input--error");

    if (!nombre) {
      errorNombre.textContent = "El nombre no puede estar vacio";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }
    if (precio < 0) {
      errorPrecio.textContent = "El precio no puede ser negativo";
      errorPrecio.hidden = false;
      inputPrecio.classList.add("form-input--error");
      inputPrecio.focus();
      return;
    }
    var nombreDuplicado = tareasData.some(function (t) {
      return t.nombre.trim().toLowerCase() === nombre.toLowerCase();
    });
    if (nombreDuplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    tareasData.push({ nombre: nombre, precioUnitario: precio });
    inputNombre.value = "";
    inputPrecio.value = "";
    refrescarTareasTabla();
  });

  document.getElementById("input-nc-nombre-tarea").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("input-nc-precio-tarea").focus();
    }
  });
  document.getElementById("input-nc-precio-tarea").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("btn-nc-agregar-tarea").click();
    }
  });

  document.getElementById("input-talla-nombre").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      document.getElementById("input-talla-cantidad").focus();
    }
  });
  document.getElementById("input-talla-cantidad").addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.keyCode === 13) {
      e.preventDefault();
      agregarTalla();
    }
  });

  container.addEventListener("click", function (e) {
    var row = e.target.closest(".tarea-tabla-row");
    if (row && !e.target.closest("button")) {
      seleccionarFilaTarea(parseInt(row.dataset.idx));
      return;
    }
    if (e.target.closest(".btn-eliminar-tarea-row")) {
      row = e.target.closest(".tarea-tabla-row");
      eliminarTarea(parseInt(row.dataset.idx));
      return;
    }
    if (e.target.closest(".btn-editar-tarea-row")) {
      row = e.target.closest(".tarea-tabla-row");
      abrirModalEditarTarea(parseInt(row.dataset.idx));
      return;
    }
    if (e.target.closest(".btn-agregar-debajo-row")) {
      row = e.target.closest(".tarea-tabla-row");
      abrirModalAgregarTarea(parseInt(row.dataset.idx));
      return;
    }
  });

  document.addEventListener("click", manejarClickDocumentoNC, { signal: clickAbortControllerNC.signal });

  var btnVolver = header.querySelector("[data-nav-back]");
  if (btnVolver) {
    btnVolver.addEventListener("click", function (e) {
      e.preventDefault();
      location.hash = "#gestion-cortes";
    });
  }

  deseleccionarFilaTarea();
}

// ============================================================
// SELECTOR DE PRENDA - Al cambiar la prenda seleccionada
// clona sus tareas al estado local y refresca la tabla.
// ============================================================

function onPrendaChange() {
  var select = document.getElementById("select-prenda");
  var id = select.value ? parseInt(select.value) : null;
  if (!id) {
    prendaSeleccionadaId = null;
    tareasData = [];
    refrescarTareasTabla();
    actualizarResumenCostos();
    return;
  }
  prendaSeleccionadaId = id;
  db.prendas.get(id).then(function (prenda) {
    if (prenda && prenda.tareas) {
      tareasData = prenda.tareas.map(function (t) {
        return { nombre: t.nombre, precioUnitario: t.precioUnitario };
      });
    } else {
      tareasData = [];
    }
    refrescarTareasTabla();
    actualizarResumenCostos();
  }).catch(function (err) {
    console.error("Error al cargar prenda:", err);
  });
}

// ============================================================
// GESTION DE TALLAS - Agregar, eliminar y renderizar badges
// Valida nombre no vacio, cantidad > 0, y no duplicados.
// ============================================================

function agregarTalla() {
  var inputNombre = document.getElementById("input-talla-nombre");
  var inputCantidad = document.getElementById("input-talla-cantidad");
  var errorNombre = document.getElementById("error-talla-nombre");
  var errorCantidad = document.getElementById("error-talla-cantidad");

  errorNombre.hidden = true;
  errorCantidad.hidden = true;
  inputNombre.classList.remove("form-input--error");
  inputCantidad.classList.remove("form-input--error");

  var nombre = inputNombre.value.trim();
  var cantidad = parseInt(inputCantidad.value) || 0;

  if (!nombre) {
    errorNombre.textContent = "El nombre de la talla no puede estar vacio";
    errorNombre.hidden = false;
    inputNombre.classList.add("form-input--error");
    inputNombre.focus();
    return;
  }
  if (cantidad < 1) {
    errorCantidad.textContent = "La cantidad debe ser mayor a 0";
    errorCantidad.hidden = false;
    inputCantidad.classList.add("form-input--error");
    inputCantidad.focus();
    return;
  }
  var duplicada = tallasData.some(function (t) {
    return t.talla.toLowerCase() === nombre.toLowerCase();
  });
  if (duplicada) {
    errorNombre.textContent = "Ya existe una talla con ese nombre";
    errorNombre.hidden = false;
    inputNombre.classList.add("form-input--error");
    inputNombre.focus();
    return;
  }

  tallasData.push({ talla: nombre, cantidad: cantidad });
  inputNombre.value = "";
  inputCantidad.value = "";
  renderTallasBadges();
  actualizarResumenCostos();
  inputNombre.focus();
}

function eliminarTalla(index) {
  tallasData.splice(index, 1);
  renderTallasBadges();
  actualizarResumenCostos();
}

function renderTallasBadges() {
  var container = document.getElementById("tallas-lista");
  var totalP = document.getElementById("tallas-total-p");
  var totalNum = document.getElementById("tallas-total-num");
  if (!container) return;

  if (tallasData.length === 0) {
    container.innerHTML = estadoVacioHTML("Sin tallas", "Agrega tallas usando los campos de arriba");
    if (totalP) totalP.style.display = "none";
    return;
  }

  var total = tallasData.reduce(function (s, t) { return s + t.cantidad; }, 0);
  if (totalP) totalP.style.display = "block";
  if (totalNum) totalNum.textContent = total;

  container.innerHTML = tallasData.map(function (t, i) {
    return '<span class="talla-badge" style="animation-delay:' + (i * 40) + 'ms">' +
      '<span class="talla-badge__nombre">' + escaparHTML(t.talla) + '</span>' +
      '<span class="talla-badge__cantidad">x' + t.cantidad + '</span>' +
      '<button type="button" class="talla-badge__remove" data-talla-idx="' + i + '" aria-label="Eliminar talla ' + escaparHTML(t.talla) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>' +
      '</span>';
  }).join("");

  container.querySelectorAll(".talla-badge__remove").forEach(function (btn) {
    btn.addEventListener("click", function () {
      eliminarTalla(parseInt(btn.dataset.tallaIdx));
    });
  });
}

// ============================================================
// TABLA DE TAREAS - Render, refresh, seleccion de fila y FABs
// Mismo patron que gestion-prendas.js: tabla con header, filas
// con botones inline, y FABs flotantes al seleccionar fila.
// ============================================================

function eliminarTarea(idx) {
  tareasData.splice(idx, 1);
  refrescarTareasTabla();
  deseleccionarFilaTarea();
  mostrarToast("Tarea eliminada", "success");
}

function renderTareasTabla(tareas) {
  if (!tareas || tareas.length === 0) {
    return estadoVacioHTML("Sin tareas", "Selecciona una prenda para heredar sus tareas o agrega tareas manualmente");
  }
  return '<div class="tareas-tabla">' +
    '<div class="tareas-tabla-header">' +
    '<span class="tareas-tabla-header__nombre">Tarea</span>' +
    '<span class="tareas-tabla-header__precio">Precio (ctv)</span>' +
    '<span class="tareas-tabla-header__acciones"></span>' +
    '</div>' +
    tareas.map(function (t, idx) { return crearFilaTareaHTML(t, idx); }).join("") +
    '</div>';
}

function crearFilaTareaHTML(tarea, idx) {
  var nombre = escaparHTML(tarea.nombre || "");
  var precio = tarea.precioUnitario || 0;
  return '<div class="tarea-tabla-row" data-idx="' + idx + '" tabindex="0">' +
    '<span class="tarea-tabla-nombre">' + (nombre || "<em>Sin nombre</em>") + '</span>' +
    '<span class="tarea-tabla-precio">' + formatCtv(precio) + '</span>' +
    '<div class="tarea-tabla-acciones">' +
    '<button type="button" class="btn btn--ghost btn--sm btn-editar-tarea-row" data-idx="' + idx + '" aria-label="Editar tarea">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
    '</button>' +
    '<button type="button" class="btn btn--ghost btn--sm btn-agregar-debajo-row" data-idx="' + idx + '" aria-label="Agregar tarea debajo">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
    '</button>' +
    '<button type="button" class="btn btn--ghost btn--sm btn-eliminar-tarea-row" data-idx="' + idx + '" aria-label="Eliminar tarea">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
    '</button>' +
    '</div>' +
    '</div>';
}

function refrescarTareasTabla() {
  var container = document.getElementById("tareas-tabla-container");
  if (!container) return;

  var rowSeleccionada = container.querySelector(".tarea-tabla-row.selected");
  var idxSeleccionado = rowSeleccionada ? parseInt(rowSeleccionada.dataset.idx) : -1;

  container.innerHTML = renderTareasTabla(tareasData);
  actualizarResumenCostos();

  if (idxSeleccionado >= 0 && idxSeleccionado < tareasData.length) {
    var nuevaRow = container.querySelector('.tarea-tabla-row[data-idx="' + idxSeleccionado + '"]');
    if (nuevaRow) nuevaRow.classList.add("selected");
  }
}

// ============================================================
// RESUMEN DE COSTOS - Calculo en tiempo real
// costoUnitario = suma de precios de tareas (centavos)
// costoTotal = costoUnitario en Bs * cantidadPrendas
// ventaTotal = precioVentaUnitario * cantidadPrendas
// gananciaEstimada = ventaTotal - costoTotal (verde si positivo)
// ============================================================

function actualizarResumenCostos() {
  var container = document.getElementById("resumen-costos-container");
  if (!container) return;

  if (tareasData.length === 0 || tallasData.length === 0) {
    container.style.display = "none";
    return;
  }

  var costoUnitarioCentavos = tareasData.reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
  var cantidadPrendas = tallasData.reduce(function (s, t) { return s + t.cantidad; }, 0);
  var precioVentaInput = document.getElementById("input-precio-venta");
  var precioVentaUnitario = precioVentaInput ? (parseFloat(precioVentaInput.value) || 0) : 0;

  var costoTotalBs = centavosABolivianos(costoUnitarioCentavos) * cantidadPrendas;
  var ventaTotalBs = precioVentaUnitario * cantidadPrendas;
  var gananciaBs = ventaTotalBs - costoTotalBs;

  var costosDiv = container.querySelector(".resumen-costos");
  if (costosDiv) {
    costosDiv.innerHTML = renderResumenCostosHTMLInterno(costoUnitarioCentavos, costoTotalBs, ventaTotalBs, gananciaBs);
  }
  container.style.display = "block";
}

function renderResumenCostosHTML() {
  return renderResumenCostosHTMLInterno(0, 0, 0, 0);
}

function renderResumenCostosHTMLInterno(costoUnitarioCtv, costoTotalBs, ventaTotalBs, gananciaBs) {
  var claseGanancia = "resumen-costos__valor--ganancia";
  claseGanancia += gananciaBs >= 0 ? " resumen-costos__valor--positivo" : " resumen-costos__valor--negativo";

  return '<div class="resumen-costos__fila">' +
    '<span class="resumen-costos__label">Costo unitario</span>' +
    '<span class="resumen-costos__valor">' + formatCostoTotal(costoUnitarioCtv) + '</span>' +
    '</div>' +
    '<div class="resumen-costos__fila">' +
    '<span class="resumen-costos__label">Costo total</span>' +
    '<span class="resumen-costos__valor">' + costoTotalBs.toFixed(2) + ' Bs</span>' +
    '</div>' +
    '<div class="resumen-costos__divisor"></div>' +
    '<div class="resumen-costos__fila">' +
    '<span class="resumen-costos__label">Precio venta total</span>' +
    '<span class="resumen-costos__valor">' + ventaTotalBs.toFixed(2) + ' Bs</span>' +
    '</div>' +
    '<div class="resumen-costos__fila">' +
    '<span class="resumen-costos__label">Ganancia estimada</span>' +
    '<span class="' + claseGanancia + '">' + gananciaBs.toFixed(2) + ' Bs</span>' +
    '</div>';
}

// ============================================================
// FABs DE TAREA - Seleccionar fila y mostrar acciones flotantes
// ============================================================

function seleccionarFilaTarea(idx) {
  deseleccionarFilaTarea();
  filaTareaSeleccionada = idx;
  var row = document.querySelector('.tarea-tabla-row[data-idx="' + idx + '"]');
  if (row) row.classList.add("selected");
  mostrarTareaFABs();
}

function deseleccionarFilaTarea() {
  var row = document.querySelector(".tarea-tabla-row.selected");
  if (row) row.classList.remove("selected");
  filaTareaSeleccionada = null;
  ocultarTareaFABs();
}

function mostrarTareaFABs() {
  if (ocultarTareasFABsTimeout) {
    clearTimeout(ocultarTareasFABsTimeout);
    ocultarTareasFABsTimeout = null;
  }

  var fabContainer = document.getElementById(TASK_FAB_CONTAINER_ID);
  if (!fabContainer) {
    fabContainer = document.createElement("div");
    fabContainer.id = TASK_FAB_CONTAINER_ID;
    fabContainer.className = "tareas-fab-container";
    fabContainer.innerHTML =
      '<button class="tarea-fab-btn tarea-fab-edit" aria-label="Editar tarea">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
      '</button>' +
      '<button class="tarea-fab-btn tarea-fab-add" aria-label="Agregar tarea debajo">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      '</button>' +
      '<button class="tarea-fab-btn tarea-fab-delete" aria-label="Eliminar tarea">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>';
    document.body.appendChild(fabContainer);
  }

  fabContainer.classList.remove("visible");
  requestAnimationFrame(function () {
    fabContainer.classList.add("visible");
  });
}

function ocultarTareaFABs() {
  var fabContainer = document.getElementById(TASK_FAB_CONTAINER_ID);
  if (!fabContainer) return;

  fabContainer.classList.remove("visible");
  ocultarTareasFABsTimeout = setTimeout(function () {
    var contenedor = document.getElementById(TASK_FAB_CONTAINER_ID);
    if (contenedor) contenedor.remove();
    ocultarTareasFABsTimeout = null;
  }, 300);
}

function manejarClickDocumentoNC(e) {
  var fueTareaFab = e.target.closest(".tarea-fab-btn");
  var fueTareaRow = e.target.closest(".tarea-tabla-row");

  if (fueTareaFab && filaTareaSeleccionada !== null && filaTareaSeleccionada !== undefined) {
    var idx = filaTareaSeleccionada;
    if (fueTareaFab.classList.contains("tarea-fab-edit")) {
      abrirModalEditarTarea(idx);
    } else if (fueTareaFab.classList.contains("tarea-fab-add")) {
      abrirModalAgregarTarea(idx);
    } else if (fueTareaFab.classList.contains("tarea-fab-delete")) {
      eliminarTarea(idx);
    }
    return;
  }

  if (fueTareaRow || fueTareaFab) return;

  if (filaTareaSeleccionada !== null && filaTareaSeleccionada !== undefined) {
    deseleccionarFilaTarea();
  }
}

function obtenerTareasData() {
  var filas = document.querySelectorAll(".tarea-tabla-row");
  if (filas.length === 0) return null;

  var result = [];
  filas.forEach(function (fila) {
    var nombre = fila.querySelector(".tarea-tabla-nombre") ? fila.querySelector(".tarea-tabla-nombre").textContent : "";
    var precio = parseInt(fila.querySelector(".tarea-tabla-precio") ? fila.querySelector(".tarea-tabla-precio").textContent : "0") || 0;
    result.push({ nombre: nombre, precioUnitario: precio });
  });
  return result;
}

// ============================================================
// MODALES DE TAREA - Editar, agregar y crear nueva prenda inline
// ============================================================

function abrirModalEditarTarea(idx) {
  if (idx >= tareasData.length) return;
  var tarea = tareasData[idx];

  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-nc-tarea-titulo");

  overlay.innerHTML =
    '<div class="modal modal--sm modal-edit">' +
    '<div class="modal__header">' +
    '<h3 id="modal-nc-tarea-titulo" class="modal__title">Editar Tarea</h3>' +
    '</div>' +
    '<div class="modal__body">' +
    '<form id="form-nc-editar-tarea" autocomplete="off">' +
    '<div class="form-group">' +
    '<label for="input-nc-tarea-nombre" class="form-label">Nombre de la tarea</label>' +
    '<input type="text" id="input-nc-tarea-nombre" class="form-input" value="' + escaparHTML(tarea.nombre || "") + '" maxlength="60" required autocomplete="off" />' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="input-nc-tarea-precio" class="form-label">Precio (ctv)</label>' +
    '<input type="number" id="input-nc-tarea-precio" class="form-input" value="' + (tarea.precioUnitario || 0) + '" min="0" max="9999" step="1" autocomplete="off" />' +
    '</div>' +
    '</form>' +
    '</div>' +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--primary modal-guardar">Guardar</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  var inputNombre = overlay.querySelector("#input-nc-tarea-nombre");
  var inputPrecio = overlay.querySelector("#input-nc-tarea-precio");

  requestAnimationFrame(function () {
    inputNombre.focus();
  });

  inputNombre.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputPrecio.focus();
    }
  });
  inputPrecio.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      overlay.querySelector(".modal-guardar").click();
    }
  });

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var guardar = function () {
    var nuevoNombre = inputNombre.value.trim();
    var nuevoPrecio = parseInt(inputPrecio.value) || 0;

    if (!nuevoNombre) {
      mostrarToast("El nombre no puede estar vacio", "warning");
      inputNombre.focus();
      return;
    }

    if (idx < tareasData.length) {
      tareasData[idx].nombre = nuevoNombre;
      tareasData[idx].precioUnitario = nuevoPrecio;
      refrescarTareasTabla();
    }
    cerrar();
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", guardar);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
  });

  var form = overlay.querySelector("#form-nc-editar-tarea");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    guardar();
  });

  var escHandler = function (e) {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

function abrirModalAgregarTarea(idx) {
  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-nc-agregar-tarea-titulo");

  overlay.innerHTML =
    '<div class="modal modal--sm modal-edit">' +
    '<div class="modal__header">' +
    '<h3 id="modal-nc-agregar-tarea-titulo" class="modal__title">Agregar Tarea</h3>' +
    '</div>' +
    '<div class="modal__body">' +
    '<form id="form-nc-agregar-tarea-modal" autocomplete="off">' +
    '<div class="form-group">' +
    '<label for="input-nc-agregar-tarea-nombre" class="form-label">Nombre de la tarea</label>' +
    '<input type="text" id="input-nc-agregar-tarea-nombre" class="form-input" placeholder="Ej: Costura, Corte" maxlength="60" required autocomplete="off" />' +
    '<p id="error-nc-agregar-tarea-nombre" class="form-error" hidden></p>' +
    '</div>' +
    '<div class="form-group">' +
    '<label for="input-nc-agregar-tarea-precio" class="form-label">Precio (ctv)</label>' +
    '<input type="number" id="input-nc-agregar-tarea-precio" class="form-input" placeholder="0" min="0" max="9999" step="1" autocomplete="off" />' +
    '<p id="error-nc-agregar-tarea-precio" class="form-error" hidden></p>' +
    '</div>' +
    '</form>' +
    '</div>' +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--primary modal-guardar">Agregar</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  var inputNombre = overlay.querySelector("#input-nc-agregar-tarea-nombre");
  var inputPrecio = overlay.querySelector("#input-nc-agregar-tarea-precio");
  var errorNombre = overlay.querySelector("#error-nc-agregar-tarea-nombre");
  var errorPrecio = overlay.querySelector("#error-nc-agregar-tarea-precio");

  requestAnimationFrame(function () {
    inputNombre.focus();
  });

  inputNombre.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputPrecio.focus();
    }
  });
  inputPrecio.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      overlay.querySelector(".modal-guardar").click();
    }
  });

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var agregar = function () {
    var nombre = inputNombre.value.trim();
    var precio = parseInt(inputPrecio.value) || 0;

    errorNombre.hidden = true;
    errorPrecio.hidden = true;
    inputNombre.classList.remove("form-input--error");
    inputPrecio.classList.remove("form-input--error");

    if (!nombre) {
      errorNombre.textContent = "El nombre no puede estar vacio";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }
    if (precio < 0) {
      errorPrecio.textContent = "El precio no puede ser negativo";
      errorPrecio.hidden = false;
      inputPrecio.classList.add("form-input--error");
      inputPrecio.focus();
      return;
    }
    var nombreDuplicado = tareasData.some(function (t) {
      return t.nombre.trim().toLowerCase() === nombre.toLowerCase();
    });
    if (nombreDuplicado) {
      errorNombre.textContent = "Ya existe una tarea con ese nombre";
      errorNombre.hidden = false;
      inputNombre.classList.add("form-input--error");
      inputNombre.focus();
      return;
    }

    tareasData.splice(idx + 1, 0, { nombre: nombre, precioUnitario: precio });
    refrescarTareasTabla();
    seleccionarFilaTarea(idx + 1);
    mostrarToast("Tarea agregada", "success");
    cerrar();
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", agregar);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
  });

  var form = overlay.querySelector("#form-nc-agregar-tarea-modal");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    agregar();
  });

  var escHandler = function (e) {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

function abrirModalNuevaPrenda() {
  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-nueva-prenda-titulo");

  overlay.innerHTML =
    '<div class="modal modal--sm modal-edit">' +
    '<div class="modal__header">' +
    '<h3 id="modal-nueva-prenda-titulo" class="modal__title">Nueva Prenda</h3>' +
    '</div>' +
    '<div class="modal__body">' +
    '<form id="form-nc-nueva-prenda" autocomplete="off">' +
    '<div class="form-group">' +
    '<label for="input-nc-nueva-prenda-nombre" class="form-label">Nombre de la prenda</label>' +
    '<input type="text" id="input-nc-nueva-prenda-nombre" class="form-input" placeholder="Ej: Camisa, Pantalon" maxlength="60" required autocomplete="off" />' +
    '<p id="error-nc-nueva-prenda" class="form-error" hidden></p>' +
    '</div>' +
    '</form>' +
    '</div>' +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--primary modal-guardar">Crear</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  var input = overlay.querySelector("#input-nc-nueva-prenda-nombre");
  var errorEl = overlay.querySelector("#error-nc-nueva-prenda");

  requestAnimationFrame(function () {
    input.focus();
  });

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var crear = async function () {
    var nombre = input.value.trim();
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
      var existe = await db.prendas.where("nombre").equals(nombre).first();
      if (existe) {
        errorEl.textContent = "Ya existe una prenda con ese nombre";
        errorEl.hidden = false;
        input.classList.add("form-input--error");
        input.focus();
        return;
      }

      var nuevaId = await db.prendas.add({ nombre: nombre, tareas: [] });
      cerrar();
      mostrarToast("Prenda creada", "success");

      var select = document.getElementById("select-prenda");
      if (select) {
        var option = document.createElement("option");
        option.value = nuevaId;
        option.textContent = nombre + " (0 tareas)";
        select.appendChild(option);
        select.value = String(nuevaId);
        select.dispatchEvent(new Event("change"));
      }
    } catch (err) {
      console.error("Error al crear prenda:", err);
      mostrarToast("Error al crear prenda", "error");
    }
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-guardar").addEventListener("click", crear);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
  });

  var form = overlay.querySelector("#form-nc-nueva-prenda");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    crear();
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      crear();
    }
  });

  var escHandler = function (e) {
    if (e.key === "Escape") {
      cerrar();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

// ============================================================
// PERSISTIR EN DB - Guardar corte con todos sus datos
// Valida todos los campos requeridos, construye el objeto corte
// con tareas embebidas (id, unidadesTotales, asignaciones vacias)
// y navega de vuelta a la lista de cortes.
// ============================================================

async function guardarCorte() {
  var select = document.getElementById("select-prenda");
  var inputNombre = document.getElementById("input-nombre-corte");
  var inputPrecio = document.getElementById("input-precio-venta");
  var errorNombre = document.getElementById("error-nombre-corte");
  var errorPrecio = document.getElementById("error-precio-venta");

  errorNombre.hidden = true;
  if (errorPrecio) errorPrecio.hidden = true;
  inputNombre.classList.remove("form-input--error");
  if (inputPrecio) inputPrecio.classList.remove("form-input--error");

  var prendaId = select && select.value ? parseInt(select.value) : null;
  var nombreCorte = inputNombre ? inputNombre.value.trim() : "";
  var precioVentaUnitario = inputPrecio ? parseFloat(inputPrecio.value) : 0;

  if (!prendaId) {
    mostrarToast("Selecciona un tipo de prenda", "warning");
    if (select) select.focus();
    return;
  }
  if (!nombreCorte) {
    errorNombre.textContent = "El nombre del corte no puede estar vacio";
    errorNombre.hidden = false;
    inputNombre.classList.add("form-input--error");
    inputNombre.focus();
    return;
  }
  if (!precioVentaUnitario || precioVentaUnitario <= 0) {
    if (errorPrecio) {
      errorPrecio.textContent = "El precio de venta debe ser mayor a 0";
      errorPrecio.hidden = false;
    }
    if (inputPrecio) {
      inputPrecio.classList.add("form-input--error");
      inputPrecio.focus();
    }
    return;
  }
  if (tallasData.length === 0) {
    mostrarToast("Agrega al menos una talla", "warning");
    document.getElementById("input-talla-nombre").focus();
    return;
  }
  var cantidadPrendas = tallasData.reduce(function (s, t) { return s + t.cantidad; }, 0);

  try {
    await db.cortes.add({
      estado: "activo",
      fechaCreacion: new Date().toISOString(),
      fechaFinalizacion: null,
      nombreCorte: nombreCorte,
      cantidadPrendas: cantidadPrendas,
      precioVentaUnitario: precioVentaUnitario,
      prendaId: prendaId,
      tallas: tallasData.map(function (t) { return { talla: t.talla, cantidad: t.cantidad }; }),
      tareas: tareasData.map(function (t, i) {
        return {
          id: i + 1,
          nombre: t.nombre,
          precioUnitario: t.precioUnitario,
          unidadesTotales: cantidadPrendas,
          asignaciones: []
        };
      })
    });

    mostrarToast("Corte creado exitosamente", "success");
    location.hash = "#gestion-cortes";
  } catch (err) {
    console.error("Error al guardar corte:", err);
    mostrarToast("Error al guardar el corte", "error");
  }
}

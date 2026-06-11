// ============================================================
// TAB GASTOS - Registro de gastos operativos del taller
// Categorias: Hilos, Aceite/Mantenimiento, Repuestos,
// Servicios, Otros. Solo formulario de registro.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs } from "../../utils.js";
import { mostrarToast } from "../shared.js";

// ============================================================
// CATEGORIAS DE GASTOS
// ============================================================

var CATEGORIAS = [
  { id: "hilos", label: "Hilos" },
  { id: "aceite", label: "Aceite / Mantenimiento" },
  { id: "repuestos", label: "Repuestos" },
  { id: "servicios", label: "Servicios" },
  { id: "otros", label: "Otros" },
];

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabGastos(container, opciones) {
  var onDataChange = opciones.onDataChange;
  var today = new Date().toISOString().split("T")[0];

  var opcionesCategorias =
    '<option value="">Seleccionar categoria...</option>' +
    CATEGORIAS.map(function (c) {
      return '<option value="' + c.id + '">' + escaparHTML(c.label) + "</option>";
    }).join("");

  container.innerHTML =
    '<section class="gastos-form-section">' +
    '<h2 class="form-title">Registrar Gasto</h2>' +
    '<form id="gastos-form" class="gastos-form" autocomplete="off">' +
    '<div class="form-group">' +
    '<label for="gastos-categoria" class="form-label">Categoria</label>' +
    '<select id="gastos-categoria" class="form-select" required>' +
    opcionesCategorias +
    "</select>" +
    '<p id="gastos-error-categoria" class="form-error" hidden></p>' +
    "</div>" +
    '<div class="form-group">' +
    '<label for="gastos-nombre" class="form-label">Nombre del gasto</label>' +
    '<input type="text" id="gastos-nombre" class="form-input" ' +
    'placeholder="Ej: Hilo poliester negro, Aceite maquina industrial" ' +
    'maxlength="100" autocomplete="off" required />' +
    '<p id="gastos-error-nombre" class="form-error" hidden></p>' +
    "</div>" +
    '<div class="form-row">' +
    '<div class="form-group">' +
    '<label for="gastos-monto" class="form-label">Monto (Bs)</label>' +
    '<input type="number" id="gastos-monto" class="form-input" ' +
    'placeholder="0.00" min="0.01" step="0.01" autocomplete="off" required />' +
    '<p id="gastos-error-monto" class="form-error" hidden></p>' +
    "</div>" +
    '<div class="form-group">' +
    '<label for="gastos-fecha" class="form-label">Fecha</label>' +
    '<input type="date" id="gastos-fecha" class="form-input" ' +
    'value="' + today + '" />' +
    "</div>" +
    "</div>" +
    '<div class="form-group">' +
    '<label for="gastos-nota" class="form-label">Nota (opcional)</label>' +
    '<textarea id="gastos-nota" class="form-input" rows="2" ' +
    'placeholder="Detalles adicionales..." maxlength="200" autocomplete="off"></textarea>' +
    "</div>" +
    '<button type="submit" class="btn btn--success" id="gastos-submit">Registrar Gasto</button>' +
    "</form>" +
    "</section>";

  document.getElementById("gastos-form").addEventListener("submit", function (e) {
    e.preventDefault();
    procesarGasto(onDataChange);
  });
}

// ============================================================
// PROCESAR GASTO - Valida y guarda en IndexedDB
// ============================================================

async function procesarGasto(onDataChange) {
  var selectCat = document.getElementById("gastos-categoria");
  var inputNombre = document.getElementById("gastos-nombre");
  var inputMonto = document.getElementById("gastos-monto");
  var inputFecha = document.getElementById("gastos-fecha");
  var inputNota = document.getElementById("gastos-nota");

  var errorCat = document.getElementById("gastos-error-categoria");
  var errorNombre = document.getElementById("gastos-error-nombre");
  var errorMonto = document.getElementById("gastos-error-monto");

  // Resetear errores
  errorCat.hidden = true;
  errorNombre.hidden = true;
  errorMonto.hidden = true;
  selectCat.classList.remove("form-input--error");
  inputNombre.classList.remove("form-input--error");
  inputMonto.classList.remove("form-input--error");

  var categoria = selectCat.value;
  var nombre = inputNombre.value.trim();
  var monto = parseFloat(inputMonto.value);
  var fecha = inputFecha.value || new Date().toISOString().split("T")[0];
  var nota = inputNota.value.trim() || null;

  // Validaciones
  var valido = true;

  if (!categoria) {
    errorCat.textContent = "Selecciona una categoria";
    errorCat.hidden = false;
    selectCat.classList.add("form-input--error");
    valido = false;
  }

  if (!nombre) {
    errorNombre.textContent = "El nombre no puede estar vacio";
    errorNombre.hidden = false;
    inputNombre.classList.add("form-input--error");
    valido = false;
  }

  if (!monto || monto <= 0) {
    errorMonto.textContent = "Ingresa un monto valido mayor a 0";
    errorMonto.hidden = false;
    inputMonto.classList.add("form-input--error");
    valido = false;
  }

  if (!valido) return;

  // Redondear a 2 decimales
  monto = Math.round(monto * 100) / 100;

  try {
    await db.gastos.add({
      categoria: categoria,
      descripcion: nombre,
      monto: monto,
      fecha: fecha,
      nota: nota,
    });

    // Limpiar formulario
    selectCat.value = "";
    inputNombre.value = "";
    inputMonto.value = "";
    inputFecha.value = new Date().toISOString().split("T")[0];
    inputNota.value = "";

    mostrarToast("Gasto registrado: " + formatBs(monto), "success");
    if (onDataChange) await onDataChange();
  } catch (err) {
    console.error("Error al registrar gasto:", err);
    mostrarToast("Error al registrar gasto", "error");
  }
}

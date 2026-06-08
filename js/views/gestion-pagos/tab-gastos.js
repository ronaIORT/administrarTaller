// ============================================================
// TAB GASTOS - Formulario de registro de gastos operativos
// Solo el formulario; la lista de gastos se muestra en el
// tab Historial (filtro Gastos).
// Categorías: Hilos, Aceite/Mantenimiento, Repuestos,
// Servicios, Otros.
// Los montos se almacenan en Bolivianos (decimal redondeado).
// ============================================================

import { db } from "../../db.js";
import { escaparHTML } from "../../utils.js";
import { mostrarToast } from "../shared.js";

var CATEGORIAS = [
  { id: "hilos", label: "Hilos" },
  { id: "aceite", label: "Aceite/Mantenimiento" },
  { id: "repuestos", label: "Repuestos" },
  { id: "servicios", label: "Servicios" },
  { id: "otros", label: "Otros" }
];

export function renderTabGastos(gastos, container, opciones) {
  container.innerHTML = "";

  var onGastoRegistrado = opciones ? opciones.onGastoRegistrado : null;

  var optionsHTML = "";
  CATEGORIAS.forEach(function (cat) {
    optionsHTML += '<option value="' + cat.id + '">' + escaparHTML(cat.label) + '</option>';
  });

  container.innerHTML =
    '<div class="pg-gastos">' +
    '<form id="pg-gastos-form" class="pg-gastos__form">' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-cat">Categoria</label>' +
    '<select id="pg-gastos-cat" class="form-select" required>' +
    '<option value="">Seleccionar categoria</option>' +
    optionsHTML +
    '</select>' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-desc">Descripcion</label>' +
    '<input type="text" id="pg-gastos-desc" class="form-input" placeholder="Ej: Hilo negro poliester..." required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-monto">Monto (Bs)</label>' +
    '<input type="number" id="pg-gastos-monto" class="form-input" step="0.01" min="0.01" placeholder="0.00" required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-fecha">Fecha</label>' +
    '<input type="date" id="pg-gastos-fecha" class="form-input" required />' +
    '</div>' +
    '<div class="form-group">' +
    '<label class="form-label" for="pg-gastos-notas">Notas (opcional)</label>' +
    '<textarea id="pg-gastos-notas" class="form-input" rows="2" placeholder="Detalles adicionales..."></textarea>' +
    '</div>' +
    '<button type="submit" class="btn btn--accent btn--full" id="pg-btn-registrar-gasto">Registrar Gasto</button>' +
    '</form>' +
    '</div>';

  var inputFecha = document.getElementById("pg-gastos-fecha");
  var hoy = new Date();
  var fechaStr = hoy.getFullYear() + "-" + String(hoy.getMonth() + 1).padStart(2, "0") + "-" + String(hoy.getDate()).padStart(2, "0");
  inputFecha.value = fechaStr;

  var form = document.getElementById("pg-gastos-form");
  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    var cat = document.getElementById("pg-gastos-cat").value;
    var descripcion = document.getElementById("pg-gastos-desc").value.trim();
    var montoBs = Math.round(parseFloat(document.getElementById("pg-gastos-monto").value) * 100) / 100;
    var fecha = document.getElementById("pg-gastos-fecha").value;
    var notas = document.getElementById("pg-gastos-notas").value.trim();

    if (!cat) {
      mostrarToast("Selecciona una categoria", "warning");
      return;
    }

    if (!descripcion) {
      mostrarToast("Ingresa una descripcion", "warning");
      return;
    }

    if (isNaN(montoBs) || montoBs <= 0) {
      mostrarToast("Ingresa un monto mayor a 0", "warning");
      return;
    }

    if (!fecha) {
      mostrarToast("Selecciona una fecha", "warning");
      return;
    }

    try {
      await db.gastos.add({
        cat: cat,
        descripcion: descripcion,
        monto: montoBs,
        fecha: fecha,
        notas: notas
      });

      mostrarToast("Gasto registrado correctamente", "success");
      form.reset();
      inputFecha.value = fechaStr;

      if (onGastoRegistrado) {
        await onGastoRegistrado();
      }
    } catch (err) {
      console.error("Error registrando gasto:", err);
      mostrarToast("Error al registrar gasto", "error");
    }
  });
}
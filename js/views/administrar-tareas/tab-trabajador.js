// ============================================================
// TAB TRABAJADOR - Asignaciones agrupadas por trabajador
// Cada bloque muestra: nombre, tabla de tareas con tallas y
// totales, subtotal, y botones Copiar/Compartir.
// El texto generado usa emojis y formato para WhatsApp/Telegram.
// ============================================================

import {
  escaparHTML,
  formatBs,
  formatCtv,
  centavosABolivianos,
} from "../../utils.js";
import { mostrarToast } from "../shared.js";

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabTrabajador(corte, container, opciones) {
  const { trabajadoresMap } = opciones;

  // Agrupar asignaciones por trabajadorId y luego por tarea
  // Estructura: { trabajadorId: { tareas: [{ tareaNombre, precioUnitario, tallas: [{ nombre, cantidadAsignada, totalCorte }], totalCtv }], totalCtv } }
  const agrupado = {};
  let totalGeneralCtv = 0;

  (corte.tareas || []).forEach(function (tarea) {
    (tarea.asignaciones || []).forEach(function (a) {
      const tid = a.trabajadorId;
      if (!agrupado[tid]) {
        agrupado[tid] = { tareas: [], totalCtv: 0 };
      }

      // Buscar si ya existe esta tarea agrupada para este trabajador
      let tareaAgrupada = agrupado[tid].tareas.find(function (ta) {
        return ta.tareaNombre === (tarea.nombre || "Sin nombre");
      });

      if (!tareaAgrupada) {
        tareaAgrupada = {
          tareaNombre: tarea.nombre || "Sin nombre",
          precioUnitario: tarea.precioUnitario || 0,
          tallas: [],
          totalCtv: 0,
        };
        agrupado[tid].tareas.push(tareaAgrupada);
      }

      const subtotal = (a.cantidad || 0) * (tarea.precioUnitario || 0);
      const totalCorte =
        (
          (corte.tallas || []).find(function (ct) {
            return ct.talla === a.talla;
          }) || {}
        ).cantidad || 0;

      tareaAgrupada.tallas.push({
        nombre: a.talla || "-",
        cantidadAsignada: a.cantidad || 0,
        totalCorte: totalCorte,
      });
      tareaAgrupada.totalCtv += subtotal;
      agrupado[tid].totalCtv += subtotal;
      totalGeneralCtv += subtotal;
    });
  });

  const trabajadoresIds = Object.keys(agrupado);

  // Si no hay asignaciones
  if (trabajadoresIds.length === 0) {
    container.innerHTML =
      '<section class="at-trabajador">' +
      '<div class="at-trabajador__sin-asignaciones">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-text-muted);margin-bottom:8px;">' +
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' +
      "</svg>" +
      "<p>Sin asignaciones registradas</p>" +
      '<p style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:4px;">Ve al tab "Asignar" para agregar tareas a los trabajadores</p>' +
      "</div>" +
      "</section>";
    return;
  }

  // Construir bloques por trabajador
  let bloquesHTML = "";

  trabajadoresIds.forEach(function (tid) {
    const datos = agrupado[tid];
    const nombreTrab = escaparHTML(
      trabajadoresMap[parseInt(tid)] || "Trabajador " + tid,
    );
    const totalTrabBs = centavosABolivianos(datos.totalCtv);

    // Tabla de tareas del trabajador
    const filasTarea = datos.tareas
      .map(function (tarea) {
        const tallasHTML = tarea.tallas
          .map(function (t) {
            return (
              '<span class="at-trabajador__talla-linea">' +
              escaparHTML(t.nombre) +
              " || " +
              t.cantidadAsignada +
              "/" +
              t.totalCorte +
              "</span>"
            );
          })
          .join("");

        return (
          '<div class="at-trabajador__tabla-row">' +
          "<span>" +
          escaparHTML(tarea.tareaNombre) +
          "</span>" +
          '<div class="at-trabajador__tallas">' +
          tallasHTML +
          "</div>" +
          '<span class="at-trabajador__total-tarea">' +
          formatBs(tarea.totalCtv) +
          "</span>" +
          "</div>"
        );
      })
      .join("");

    bloquesHTML +=
      '<div class="at-trabajador__bloque">' +
      '<div class="at-trabajador__bloque-header">' +
      '<span class="at-trabajador__nombre">' +
      nombreTrab +
      "</span>" +
      '<span class="at-trabajador__subtotal">' +
      totalTrabBs.toFixed(2) +
      " Bs</span>" +
      "</div>" +
      '<div class="at-trabajador__tabla">' +
      '<div class="at-trabajador__tabla-header">' +
      "<span>Tareas</span>" +
      "<span>Tallas</span>" +
      "<span>Total</span>" +
      "</div>" +
      filasTarea +
      "</div>" +
      '<div class="at-trabajador__acciones">' +
      '<button class="btn btn--outline btn--sm btn-copiar-trab" data-trabajador-id="' +
      tid +
      '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
      " Copiar</button>" +
      '<button class="btn btn--outline btn--sm btn-compartir-trab" data-trabajador-id="' +
      tid +
      '">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
      " Compartir</button>" +
      "</div>" +
      "</div>";
  });

  container.innerHTML =
    '<section class="at-trabajador">' +
    // Bloques por trabajador
    bloquesHTML +
    // Total general
    '<div class="at-trabajador__total-general">' +
    '<span class="at-trabajador__total-general-label">Total mano de obra</span>' +
    '<span class="at-trabajador__total-general-valor">' +
    centavosABolivianos(totalGeneralCtv).toFixed(2) +
    " Bs</span>" +
    "</div>" +
    "</section>";

  // Event listeners para Copiar y Compartir
  container.querySelectorAll(".btn-copiar-trab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tid = parseInt(btn.dataset.trabajadorId);
      copiarAlPortapapeles(corte, agrupado[tid], trabajadoresMap[tid]);
    });
  });

  container.querySelectorAll(".btn-compartir-trab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const tid = parseInt(btn.dataset.trabajadorId);
      compartirWebShare(corte, agrupado[tid], trabajadoresMap[tid]);
    });
  });
}

// ============================================================
// COPIAR AL PORTAPAPELES - Genera texto formateado y lo copia
// ============================================================

function copiarAlPortapapeles(corte, datosTrab, nombreTrab) {
  const texto = generarTextoFormateado(corte, datosTrab, nombreTrab);
  navigator.clipboard
    .writeText(texto)
    .then(function () {
      mostrarToast("Copiado al portapapeles", "success");
    })
    .catch(function () {
      mostrarToast("Error al copiar", "error");
    });
}

// ============================================================
// COMPARTIR via Web Share API
// Si el dispositivo no soporta la API, copia al portapapeles.
// ============================================================

function compartirWebShare(corte, datosTrab, nombreTrab) {
  const texto = generarTextoFormateado(corte, datosTrab, nombreTrab);

  if (navigator.share) {
    navigator
      .share({
        title: "Asignacion de tareas - " + (corte.nombreCorte || "Corte"),
        text: texto,
      })
      .catch(function (err) {
        if (err.name !== "AbortError") {
          copiarAlPortapapeles(corte, datosTrab, nombreTrab);
        }
      });
  } else {
    copiarAlPortapapeles(corte, datosTrab, nombreTrab);
  }
}

// ============================================================
// TEXTO FORMATEADO - Construye mensaje con emojis para compartir
// Disenado para WhatsApp/Telegram con negritas Markdown.
// ============================================================

function generarTextoFormateado(corte, datosTrab, nombreTrab) {
  const nombreCorte = corte.nombreCorte || "Sin nombre";
  const totalBs = centavosABolivianos(datosTrab.totalCtv);

  let texto = "🧵 *Corte: " + nombreCorte + "*\n";
  texto += "👤 *Trabajador: " + (nombreTrab || "Sin nombre") + "*\n";
  texto += "📋 Tareas asignadas:\n";

  datosTrab.tareas.forEach(function (tarea) {
    tarea.tallas.forEach(function (t) {
      const subtotalTalla = t.cantidadAsignada * tarea.precioUnitario;
      texto +=
        "  • " +
        tarea.tareaNombre +
        " — " +
        t.cantidadAsignada +
        "/" +
        t.totalCorte +
        " unid. × " +
        tarea.precioUnitario +
        " ctv = " +
        subtotalTalla +
        " ctv";
      if (t.nombre && t.nombre !== "-") {
        texto += " (" + t.nombre + ")";
      }
      texto += "\n";
    });
  });

  texto +=
    "💰 Total: " + datosTrab.totalCtv + " ctv (" + totalBs.toFixed(2) + " Bs)";

  return texto;
}

// ============================================================
// TAB RESUMEN - Dashboard financiero del corte
// Muestra KPIs (unidades, fecha, progreso), tallas, resumen de
// costos con Mano de Obra Real y Ganancia Real.
// Botones: Exportar PDF y Finalizar Corte.
// ============================================================

import { db } from "../../db.js";
import { escaparHTML, formatBs, formatCtv, formatCostoTotal, centavosABolivianos } from "../../utils.js";
import { mostrarModalConfirmar, mostrarToast } from "../shared.js";

// ============================================================
// RENDER PRINCIPAL
// ============================================================

export function renderTabResumen(corte, container, opciones) {
  const { prenda } = opciones;

  const cantidadPrendas = corte.tallas.reduce(function (s, t) { return s + t.cantidad; }, 0);
  const esTerminado = corte.estado === "terminado";
  const progreso = calcularProgreso(corte);
  const nombreCorte = escaparHTML(corte.nombreCorte || "Sin nombre");
  const nombrePrenda = escaparHTML(prenda ? prenda.nombre : "Sin prenda");

  // Calculos financieros
  // costoUnitario: suma de precios de todas las tareas (centavos)
  const costoUnitarioCtv = (corte.tareas || []).reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);

  // ventaTotal: precio de venta por cantidad de prendas
  const ventaTotalBs = (corte.precioVentaUnitario || 0) * cantidadPrendas;

  // manoObraReal: suma de cada asignacion * precioUnitario de su tarea (centavos)
  let manoObraRealCtv = 0;
  (corte.tareas || []).forEach(function (t) {
    (t.asignaciones || []).forEach(function (a) {
      manoObraRealCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
    });
  });
  const manoObraRealBs = centavosABolivianos(manoObraRealCtv);

  // gananciaReal = ventaTotal - manoObraReal (ambos en Bs)
  // costoTotalBs es informativo: costoUnitario en Bs * cantidad
  const costoTotalBs = centavosABolivianos(costoUnitarioCtv) * cantidadPrendas;
  const gananciaRealBs = ventaTotalBs - manoObraRealBs;

  // Construccion de tallas
  let tallasHTML = "";
  if (corte.tallas && corte.tallas.length > 0) {
    tallasHTML = corte.tallas.map(function (t) {
      return '<span class="talla-badge" style="animation-delay:0ms">' +
        '<span class="talla-badge__nombre">' + escaparHTML(t.talla) + '</span>' +
        '<span class="talla-badge__cantidad">x' + t.cantidad + '</span>' +
        '</span>';
    }).join("");
  }

  // Badge de estado
  const badgeEstado = esTerminado
    ? '<span class="badge badge--success">Finalizado</span>'
    : '<span class="badge badge--info">Activo</span>';

  // Clase para ganancia
  const claseGanancia = gananciaRealBs >= 0
    ? "at-resumen__financiero-valor--positivo"
    : "at-resumen__financiero-valor--negativo";

  container.innerHTML =
    '<section class="at-resumen">' +

    // Cabecera: nombre + badge de estado
    '<div class="at-resumen__cabecera">' +
    '<h2 class="at-resumen__nombre">' + nombreCorte + '</h2>' +
    badgeEstado +
    '</div>' +

    // Barra de progreso
    '<div class="at-resumen__progreso">' +
    '<div class="progress-bar">' +
    '<div class="progress-bar__fill' + (esTerminado ? ' progress-bar__fill--completo' : '') + '" style="width:' + progreso + '%"></div>' +
    '</div>' +
    '<span class="at-resumen__progreso-label">' + progreso + '% completado</span>' +
    '</div>' +

    // KPIs grid: unidades, fecha inicio, tipo de prenda, cantidad tallas
    '<div class="at-kpi-grid">' +
    '<div class="at-kpi">' +
    '<span class="at-kpi__label">Unidades</span>' +
    '<span class="at-kpi__valor">' + cantidadPrendas + '</span>' +
    '</div>' +
    '<div class="at-kpi">' +
    '<span class="at-kpi__label">Tipo</span>' +
    '<span class="at-kpi__valor" style="font-size:var(--font-size-md);">' + nombrePrenda + '</span>' +
    '</div>' +
    '<div class="at-kpi">' +
    '<span class="at-kpi__label">Inicio</span>' +
    '<span class="at-kpi__valor" style="font-size:var(--font-size-sm);">' + formatearFecha(corte.fechaCreacion) + '</span>' +
    '</div>' +
    '<div class="at-kpi">' +
    '<span class="at-kpi__label">Finalizacion</span>' +
    '<span class="at-kpi__valor" style="font-size:var(--font-size-sm);">' + (esTerminado && corte.fechaFinalizacion ? formatearFecha(corte.fechaFinalizacion) : "En curso") + '</span>' +
    '</div>' +
    '</div>' +

    // Tallas
    (tallasHTML ? '<div class="at-resumen__seccion">' +
    '<span class="at-resumen__seccion-titulo">Tallas (' + (corte.tallas ? corte.tallas.length : 0) + ')</span>' +
    '<div class="at-resumen__tallas">' + tallasHTML + '</div>' +
    '</div>' : "") +

    // Resumen financiero
    '<div class="at-resumen__financiero">' +
    '<div class="at-resumen__financiero-fila">' +
    '<span class="at-resumen__financiero-label">Costo por prenda</span>' +
    '<span class="at-resumen__financiero-valor">' + formatCostoTotal(costoUnitarioCtv) + '</span>' +
    '</div>' +
    '<div class="at-resumen__financiero-fila">' +
    '<span class="at-resumen__financiero-label">Precio venta unitario</span>' +
    '<span class="at-resumen__financiero-valor">' + (corte.precioVentaUnitario || 0).toFixed(2) + ' Bs</span>' +
    '</div>' +
    '<div class="at-resumen__financiero-fila">' +
    '<span class="at-resumen__financiero-label">Venta total</span>' +
    '<span class="at-resumen__financiero-valor">' + ventaTotalBs.toFixed(2) + ' Bs</span>' +
    '</div>' +
    '<div class="at-resumen__financiero-divisor"></div>' +
    '<div class="at-resumen__financiero-fila">' +
    '<span class="at-resumen__financiero-label">Mano de obra REAL</span>' +
    '<span class="at-resumen__financiero-valor">' + manoObraRealBs.toFixed(2) + ' Bs</span>' +
    '</div>' +
    '<div class="at-resumen__financiero-fila">' +
    '<span class="at-resumen__financiero-label">Ganancia REAL</span>' +
    '<span class="' + claseGanancia + '">' + gananciaRealBs.toFixed(2) + ' Bs</span>' +
    '</div>' +
    '</div>' +

    // Botones de accion
    '<div class="at-resumen__acciones">' +
    '<button class="btn btn--primary" id="btn-exportar-pdf-resumen">Exportar PDF</button>' +
    (esTerminado
      ? '<button class="btn btn--secondary" disabled>Ya finalizado</button>'
      : '<button class="btn btn--success" id="btn-finalizar-corte-resumen">Finalizar Corte</button>') +
    '</div>' +

    '</section>';

  // Event listeners
  document.getElementById("btn-exportar-pdf-resumen").addEventListener("click", function () {
    exportarPDF(corte, prenda);
  });

  if (!esTerminado) {
    document.getElementById("btn-finalizar-corte-resumen").addEventListener("click", function () {
      confirmarFinalizarCorte(corte, opciones.onFinalizar);
    });
  }
}

// ============================================================
// EXPORTAR PDF - Genera reporte con jsPDF + AutoTable
// ============================================================

function exportarPDF(corte, prenda) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const nombrePrenda = prenda ? prenda.nombre : "Sin prenda";
    const nombreCorte = corte.nombreCorte || "Sin nombre";
    const cantidadPrendas = corte.tallas.reduce(function (s, t) { return s + t.cantidad; }, 0);

    // Encabezado
    doc.setFontSize(16);
    doc.text("Reporte de Corte", 14, 20);
    doc.setFontSize(11);
    doc.text(nombrePrenda + " — " + nombreCorte, 14, 28);
    doc.text("Unidades: " + cantidadPrendas + " | Estado: " + (corte.estado === "terminado" ? "Finalizado" : "Activo"), 14, 35);

    // Tabla de tareas
    const body = [];
    (corte.tareas || []).forEach(function (t) {
      const asignados = (t.asignaciones || []).reduce(function (s, a) { return s + (a.cantidad || 0); }, 0);
      body.push([
        t.nombre || "-",
        formatBs(t.precioUnitario || 0),
        String(asignados) + " / " + String(t.unidadesTotales || 0)
      ]);
    });

    doc.autoTable({
      head: [["Tarea", "Precio/Unidad", "Asignado / Total"]],
      body: body,
      startY: 42,
      theme: "grid",
      styles: { fontSize: 9 }
    });

    // Resumen financiero
    const costoUnitarioCtv = (corte.tareas || []).reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
    const ventaTotalBs = (corte.precioVentaUnitario || 0) * cantidadPrendas;

    let manoObraRealCtv = 0;
    (corte.tareas || []).forEach(function (t) {
      (t.asignaciones || []).forEach(function (a) {
        manoObraRealCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
      });
    });
    const gananciaRealBs = ventaTotalBs - centavosABolivianos(manoObraRealCtv);

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text("Venta total: " + ventaTotalBs.toFixed(2) + " Bs", 14, finalY);
    doc.text("Mano de obra: " + centavosABolivianos(manoObraRealCtv).toFixed(2) + " Bs", 14, finalY + 7);
    doc.text("Ganancia: " + gananciaRealBs.toFixed(2) + " Bs", 14, finalY + 14);

    doc.save("corte-" + (corte.nombreCorte || "reporte").replace(/\s+/g, "-") + ".pdf");
    mostrarToast("PDF exportado", "success");
  } catch (err) {
    console.error("Error exportando PDF:", err);
    mostrarToast("Error al exportar PDF", "error");
  }
}

// ============================================================
// FINALIZAR CORTE - Confirmacion y cambio de estado
// ============================================================

function confirmarFinalizarCorte(corte, onFinalizar) {
  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "modal-finalizar-titulo");

  overlay.innerHTML =
    '<div class="modal modal--sm modal-edit">' +
    '<div class="modal__header">' +
    '<h3 id="modal-finalizar-titulo" class="modal__title">Finalizar Corte</h3>' +
    '</div>' +
    '<div class="modal__body">' +
    '<p>Al finalizar el corte se marcara como terminado y no se podran agregar mas asignaciones. Esta accion se puede revertir desde la base de datos.</p>' +
    '</div>' +
    '<div class="modal__footer">' +
    '<button class="btn btn--secondary modal-cancelar">Cancelar</button>' +
    '<button class="btn btn--success modal-confirmar">Finalizar Corte</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  var cerrar = function () {
    overlay.classList.add("closing");
    setTimeout(function () {
      overlay.remove();
      document.body.style.overflow = "auto";
    }, 250);
  };

  var confirmar = async function () {
    try {
      await db.cortes.update(corte.id, {
        estado: "terminado",
        fechaFinalizacion: new Date().toISOString()
      });
      mostrarToast("Corte finalizado", "success");
      if (onFinalizar) await onFinalizar();
    } catch (err) {
      console.error("Error al finalizar corte:", err);
      mostrarToast("Error al finalizar", "error");
    }
    cerrar();
  };

  overlay.querySelector(".modal-cancelar").addEventListener("click", cerrar);
  overlay.querySelector(".modal-confirmar").addEventListener("click", confirmar);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) cerrar();
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
// CALCULO DE PROGRESO - Reutilizado de gestion-cortes.js
// ============================================================

function calcularProgreso(corte) {
  if (corte.estado === "terminado") return 100;
  if (!corte.tareas || corte.tareas.length === 0) return 0;
  let total = 0;
  let completado = 0;
  corte.tareas.forEach(function (t) {
    total += t.unidadesTotales || 0;
    if (t.asignaciones) {
      t.asignaciones.forEach(function (a) {
        completado += a.cantidad || 0;
      });
    }
  });
  if (total === 0) return 0;
  return Math.round((completado / total) * 100);
}

// ============================================================
// FORMATEO DE FECHA
// ============================================================

function formatearFecha(fechaISO) {
  if (!fechaISO) return "-";
  const fecha = new Date(fechaISO);
  const dia = String(fecha.getDate()).padStart(2, "0");
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const anio = fecha.getFullYear();
  return dia + "/" + mes + "/" + anio;
}

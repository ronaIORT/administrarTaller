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
  const { prenda, trabajadoresMap } = opciones;

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
    exportarPDF(corte, prenda, trabajadoresMap);
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

function exportarPDF(corte, prenda, trabajadoresMap) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const nombrePrenda = prenda ? prenda.nombre : "Sin prenda";
    const nombreCorte = corte.nombreCorte || "Sin nombre";
    const cantidadPrendas = (corte.tallas || []).reduce(function (s, t) { return s + t.cantidad; }, 0);
    const esTerminado = corte.estado === "terminado";

    // --- Encabezado ---
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text("REPORTE DE CORTE", 14, 20);
    doc.setFontSize(11);
    doc.setFont(undefined, "normal");
    doc.text(nombrePrenda + " \u2014 " + nombreCorte, 14, 30);
    doc.setFontSize(10);
    doc.text("Estado: " + (esTerminado ? "Finalizado" : "Activo"), 14, 38);
    doc.text("Fecha inicio: " + formatearFecha(corte.fechaCreacion), 14, 45);
    doc.text("Fecha fin: " + (esTerminado && corte.fechaFinalizacion ? formatearFecha(corte.fechaFinalizacion) : "En curso"), 14, 52);

    const progreso = calcularProgreso(corte);
    doc.text("Progreso: " + progreso + "%", 14, 59);

    var y = 65;
    doc.setDrawColor(180);
    doc.line(14, y, 196, y);
    y += 6;

    // --- Seccion Tallas ---
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("TALLAS (" + (corte.tallas ? corte.tallas.length : 0) + ")", 14, y);
    y += 7;

    if (corte.tallas && corte.tallas.length > 0) {
      const tallasBody = corte.tallas.map(function (t) {
        return [t.talla, String(t.cantidad)];
      });
      doc.autoTable({
        head: [["Talla", "Cantidad"]],
        body: tallasBody,
        startY: y,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 35 } },
        margin: { left: 14 },
        tableWidth: 70,
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // --- Separador ---
    doc.setDrawColor(180);
    doc.line(14, y, 196, y);
    y += 6;

    // --- Seccion Tareas (formato tab-corte.js) ---
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("TAREAS", 14, y);
    y += 7;

    const tareasBodyCorte = [];
    (corte.tareas || []).forEach(function (tarea) {
      const lineasTallas = [];
      const lineasTrabajadores = [];

      (tarea.asignaciones || []).forEach(function (a) {
        const totalCorte = ((corte.tallas || []).find(function (ct) { return ct.talla === a.talla; }) || {}).cantidad || 0;
        const nombreTrab = trabajadoresMap[a.trabajadorId] || "Trab. " + a.trabajadorId;
        lineasTallas.push((a.talla || "-") + " || " + (a.cantidad || 0) + "/" + totalCorte);
        lineasTrabajadores.push(nombreTrab);
      });

      const celdaTarea = (tarea.nombre || "Sin nombre") + "\n" + formatCtv(tarea.precioUnitario || 0);
      const celdaTallas = lineasTallas.length > 0 ? lineasTallas.join("\n") : "Sin asignar";
      const celdaTrabajadores = lineasTrabajadores.length > 0 ? lineasTrabajadores.join("\n") : "Sin asignar";

      tareasBodyCorte.push([celdaTarea, celdaTallas, celdaTrabajadores]);
    });

    doc.autoTable({
      head: [["Tarea", "Tallas", "Trabajadores"]],
      body: tareasBodyCorte.length > 0 ? tareasBodyCorte : [["Sin tareas registradas", "", ""]],
      startY: y,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 70 },
        2: { cellWidth: 60 },
      },
    });
    y = doc.lastAutoTable.finalY + 6;

    // --- Calculos financieros ---
    const costoUnitarioCtv = (corte.tareas || []).reduce(function (s, t) { return s + (t.precioUnitario || 0); }, 0);
    const ventaTotalBs = (corte.precioVentaUnitario || 0) * cantidadPrendas;

    let manoObraRealCtv = 0;
    (corte.tareas || []).forEach(function (t) {
      (t.asignaciones || []).forEach(function (a) {
        manoObraRealCtv += (a.cantidad || 0) * (t.precioUnitario || 0);
      });
    });
    const manoObraRealBs = centavosABolivianos(manoObraRealCtv);
    const gananciaRealBs = ventaTotalBs - manoObraRealBs;

    // --- Separador ---
    doc.setDrawColor(180);
    doc.line(14, y, 196, y);
    y += 6;

    // --- Seccion Resumen Financiero ---
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("RESUMEN FINANCIERO", 14, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont(undefined, "normal");

    function dibujarFilaFinanciera(label, valor, esDestacado) {
      doc.setFont(undefined, "normal");
      doc.text(label, 14, y);
      if (esDestacado) {
        doc.setFont(undefined, "bold");
        if (gananciaRealBs >= 0) {
          doc.setTextColor(34, 139, 34);
        } else {
          doc.setTextColor(220, 38, 38);
        }
      } else {
        doc.setTextColor(0, 0, 0);
      }
      doc.text(valor, 100, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, "normal");
      y += 7;
    }

    dibujarFilaFinanciera("Costo por prenda:", formatCostoTotal(costoUnitarioCtv));
    dibujarFilaFinanciera("Precio venta unitario:", (corte.precioVentaUnitario || 0).toFixed(2) + " Bs");
    dibujarFilaFinanciera("Venta total:", ventaTotalBs.toFixed(2) + " Bs");
    y += 3;
    doc.setDrawColor(180);
    doc.line(14, y, 120, y);
    y += 5;
    dibujarFilaFinanciera("Mano de obra REAL:", manoObraRealBs.toFixed(2) + " Bs");
    dibujarFilaFinanciera("Ganancia REAL:", gananciaRealBs.toFixed(2) + " Bs", true);

    y += 3;

    // --- Agrupar asignaciones por trabajador ---
    const agrupado = {};
    (corte.tareas || []).forEach(function (tarea) {
      (tarea.asignaciones || []).forEach(function (a) {
        const tid = a.trabajadorId;
        if (!agrupado[tid]) {
          agrupado[tid] = { tareas: [], totalCtv: 0 };
        }
        var tareaAgrupada = agrupado[tid].tareas.find(function (ta) {
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
        const totalCorte = ((corte.tallas || []).find(function (ct) { return ct.talla === a.talla; }) || {}).cantidad || 0;
        tareaAgrupada.tallas.push({
          nombre: a.talla || "-",
          cantidadAsignada: a.cantidad || 0,
          totalCorte: totalCorte,
        });
        tareaAgrupada.totalCtv += subtotal;
        agrupado[tid].totalCtv += subtotal;
      });
    });

    const trabajadoresIds = Object.keys(agrupado);

    if (trabajadoresIds.length > 0) {
      if (y > 230) {
        doc.addPage();
        y = 20;
      }

      // --- Separador ---
      doc.setDrawColor(180);
      doc.line(14, y, 196, y);
      y += 6;

      // --- Seccion Desglose por Trabajador ---
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      doc.text("DESGLOSE POR TRABAJADOR", 14, y);
      y += 8;

      trabajadoresIds.forEach(function (tid) {
        const datos = agrupado[tid];
        const nombreTrab = trabajadoresMap[parseInt(tid)] || "Trabajador " + tid;
        const totalTrabBs = centavosABolivianos(datos.totalCtv);

        if (y > 240) {
          doc.addPage();
          y = 20;
        }

        doc.setFontSize(10);
        doc.setFont(undefined, "bold");
        doc.text(nombreTrab + " \u2014 Total: " + totalTrabBs.toFixed(2) + " Bs", 14, y);
        y += 7;

        const tareasBody = datos.tareas.map(function (tarea) {
          const tallasLineas = tarea.tallas.map(function (t) {
            return t.nombre + " || " + t.cantidadAsignada + "/" + t.totalCorte;
          });

          return [tarea.tareaNombre, tallasLineas.join("\n"), formatBs(tarea.totalCtv)];
        });

        doc.autoTable({
          head: [["Tareas", "Tallas", "Total"]],
          body: tareasBody,
          startY: y,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
          columnStyles: {
            0: { cellWidth: 55 },
            1: { cellWidth: 80 },
            2: { cellWidth: 35, halign: "right" },
          },
          margin: { left: 14 },
        });
        y = doc.lastAutoTable.finalY + 5;
      });

      // Total general de mano de obra
      var totalGeneralCtv = 0;
      trabajadoresIds.forEach(function (tid) {
        totalGeneralCtv += agrupado[tid].totalCtv;
      });

      if (y > 265) {
        doc.addPage();
        y = 20;
      }

      doc.setDrawColor(180);
      doc.line(14, y, 196, y);
      y += 5;

      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      doc.text("Total mano de obra: " + centavosABolivianos(totalGeneralCtv).toFixed(2) + " Bs", 14, y);
      y += 10;
    }

    // --- Footer ---
    doc.setDrawColor(180);
    doc.line(14, y, 196, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.setTextColor(130);
    doc.text("Generado el " + formatearFecha(new Date().toISOString()) + " \u2014 App de Gestion de Cortes", 14, y);

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

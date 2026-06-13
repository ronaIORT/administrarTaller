// ============================================================
// IMPORTS Y CONSTANTES DEL MODULO
// ============================================================

import { db } from "../db.js";
import { escaparHTML, formatBs } from "../utils.js";
import { mostrarModalConfirmar, mostrarToast, estadoVacioHTML } from "./shared.js";

/** ID del FAB flotante para crear nuevo corte */
const FAB_ID = "crear-corte-fab";

/** AbortController para cancelar event listeners al cambiar de vista */
let clickAbortControllerC = null;

/** Cache local de todos los cortes para filtrar sin consultar DB */
let todosLosCortes = [];

/** Mapa prendaId -> nombre para lookup O(1) en el render */
let prendasMapa = {};

/** Filtro activo actual: "todos" | "activo" | "terminado" | "semana" */
let filtroActivo = "todos";

/** Texto de busqueda actual */
let busquedaTexto = "";

// ============================================================
// RENDER PRINCIPAL - Vista de gestion de cortes
// Construye la barra de filtros + busqueda, el contenedor de
// lista, el FAB flotante, y carga los datos desde IndexedDB.
// ============================================================

export async function renderGestionCortes() {
  const app = document.getElementById("app");
  app.innerHTML = "";
  app.classList.add("app--sidebar");

  if (clickAbortControllerC) {
    clickAbortControllerC.abort();
    clickAbortControllerC = null;
  }
  clickAbortControllerC = new AbortController();

  filtroActivo = "todos";
  busquedaTexto = "";

  const container = document.createElement("div");
  container.className = "app-container app-container--no-header";
  app.appendChild(container);

  container.innerHTML =
    '<section class="cortes-filter-bar">' +
    '<input type="text" id="input-buscar-corte" class="form-input" placeholder="Buscar corte..." autocomplete="off" />' +
    '<button class="btn btn--outline btn--sm" id="btn-importar-corte">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
    'Importar</button>' +
    '<div class="filter-chips" id="filter-chips">' +
    '<button class="filter-chip active" data-filtro="todos">Todos</button>' +
    '<button class="filter-chip" data-filtro="activo">Activos</button>' +
    '<button class="filter-chip" data-filtro="terminado">Terminados</button>' +
    '<button class="filter-chip" data-filtro="semana">Semana</button>' +
    '</div>' +
    '</section>' +
    '<section aria-label="Lista de cortes" id="lista-cortes-container">' +
    '<div class="spinner"></div>' +
    '</section>';

  var inputBuscar = document.getElementById("input-buscar-corte");
  inputBuscar.addEventListener("input", function () {
    busquedaTexto = inputBuscar.value.trim();
    filtrarCortes();
  });

  var filterChips = document.getElementById("filter-chips");
  filterChips.addEventListener("click", function (e) {
    var chip = e.target.closest(".filter-chip");
    if (!chip) return;
    filtroActivo = chip.dataset.filtro;
    filterChips.querySelectorAll(".filter-chip").forEach(function (c) {
      c.classList.remove("active");
    });
    chip.classList.add("active");
    filtrarCortes();
  });

  var btnImportar = document.getElementById("btn-importar-corte");
  btnImportar.addEventListener("click", function () {
    abrirImportadorCorte();
  });

  document.addEventListener("click", manejarClickDocumentoC, { signal: clickAbortControllerC.signal });

  var fab = document.createElement("button");
  fab.id = FAB_ID;
  fab.className = "btn btn--fab";
  fab.setAttribute("aria-label", "Crear nuevo corte");
  fab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  fab.addEventListener("click", function () {
    location.hash = "#nuevo-corte";
  }, { signal: clickAbortControllerC.signal });
  document.body.appendChild(fab);

  await cargarCortes();
}

// ============================================================
// CARGA DE DATOS - Obtiene todos los cortes y construye un
// mapa de prendaId -> nombre en una sola query batch.
// Ordena por fecha de creacion descendente (mas reciente primero).
// ============================================================

async function cargarCortes() {
  var container = document.getElementById("lista-cortes-container");
  if (!container) return;

  try {
    todosLosCortes = await db.cortes.orderBy("fechaCreacion").reverse().toArray();

    var prendaIdsUnicos = [];
    var idsVistos = {};
    todosLosCortes.forEach(function (c) {
      if (c.prendaId && !idsVistos[c.prendaId]) {
        idsVistos[c.prendaId] = true;
        prendaIdsUnicos.push(c.prendaId);
      }
    });

    prendasMapa = {};
    if (prendaIdsUnicos.length > 0) {
      var prendas = await db.prendas.where("id").anyOf(prendaIdsUnicos).toArray();
      prendas.forEach(function (p) {
        prendasMapa[p.id] = p.nombre;
      });
    }

    filtrarCortes();
  } catch (err) {
    console.error("Error cargando cortes:", err);
    container.innerHTML = estadoVacioHTML("Error al cargar", "Intenta recargar la pagina");
  }
}

// ============================================================
// FILTROS - Aplica el filtro activo y texto de busqueda
// sobre el array cacheado localmente (sin consultar DB).
// ============================================================

function filtrarCortes() {
  var cortes = todosLosCortes;

  if (filtroActivo === "activo") {
    cortes = cortes.filter(function (c) { return c.estado === "activo"; });
  } else if (filtroActivo === "terminado") {
    cortes = cortes.filter(function (c) { return c.estado === "terminado"; });
  } else if (filtroActivo === "semana") {
    var haceUnaSemana = new Date();
    haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);
    cortes = cortes.filter(function (c) {
      return c.fechaCreacion && new Date(c.fechaCreacion) >= haceUnaSemana;
    });
  }

  if (busquedaTexto) {
    var texto = busquedaTexto.toLowerCase();
    cortes = cortes.filter(function (c) {
      return c.nombreCorte && c.nombreCorte.toLowerCase().indexOf(texto) !== -1;
    });
  }

  renderListaCortes(cortes);
}

// ============================================================
// CALCULO DE PROGRESO - Disenado para Fase 5
// En Fase 4: terminado=100%, activo=0% (no hay asignaciones).
// En Fase 5: calcula real = sum(asignaciones.cantidad) / sum(unidadesTotales).
// ============================================================

function calcularProgreso(corte) {
  if (corte.estado === "terminado") return 100;
  if (!corte.tareas || corte.tareas.length === 0) return 0;
  var total = 0;
  var completado = 0;
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
// RENDER DE LISTA - Construye el HTML de las cards de corte
// Cada card muestra: prenda, badge de estado, nombre, progreso,
// tallas (solo nombres), cantidad, fecha de inicio y botones.
// ============================================================

function renderListaCortes(cortes) {
  var container = document.getElementById("lista-cortes-container");
  if (!container) return;

  if (cortes.length === 0) {
    var msj = "Sin cortes";
    var sub = "Crea tu primer corte usando el boton +";
    if (filtroActivo !== "todos" || busquedaTexto) {
      msj = "Sin resultados";
      sub = "Prueba con otros filtros o terminos de busqueda";
    }
    container.innerHTML = estadoVacioHTML(msj, sub);
    return;
  }

  container.innerHTML =
    '<div class="cortes-lista" role="list">' +
    cortes.map(function (c, i) {
      var nombrePrenda = escaparHTML(prendasMapa[c.prendaId] || "Sin prenda");
      var nombreCorte = escaparHTML(c.nombreCorte || "Sin nombre");
      var progreso = calcularProgreso(c);
      var esTerminado = c.estado === "terminado";

      var tallasTexto = "";
      if (c.tallas && c.tallas.length > 0) {
        tallasTexto = c.tallas.map(function (t) {
          return escaparHTML(t.talla);
        }).join(" ");
      }

      var fechaLabel;
      if (esTerminado && c.fechaFinalizacion) {
        fechaLabel = '<span class="corte-card__fecha corte-card__fecha--fin">Finalizado ' + formatearFecha(c.fechaFinalizacion) + '</span>';
      } else {
        fechaLabel = '<span class="corte-card__fecha">Inicio ' + (c.fechaCreacion ? formatearFecha(c.fechaCreacion) : "") + '</span>';
      }

      var badgeEstado = esTerminado
        ? '<span class="badge badge--success">Terminado</span>'
        : '<span class="badge badge--warning">Por terminar</span>';

      return '<div class="corte-card" data-id="' + c.id + '" role="listitem" style="animation-delay:' + (i * 50) + 'ms">' +
        '<div class="corte-card__header">' +
        '<span class="corte-card__nombre">' + nombreCorte + '</span>' +
        badgeEstado +
        '</div>' +
        '<div class="corte-card__prenda-row">' +
        '<span class="corte-card__prenda">' + nombrePrenda + '</span>' +
        '</div>' +
        '<div class="corte-card__body">' +
        '<div class="progress-bar">' +
        '<div class="progress-bar__fill' + (esTerminado ? ' progress-bar__fill--completo' : '') + '" style="width:' + progreso + '%"></div>' +
        '</div>' +
        '<div class="corte-card__info">' +
        (tallasTexto ? '<span class="corte-card__tallas">' + tallasTexto + '</span>' : '') +
        '<span class="corte-card__cantidad">' + (c.cantidadPrendas || 0) + ' prendas</span>' +
        fechaLabel +
        '</div>' +
        '</div>' +
        '<div class="corte-card__footer">' +
        '<button class="btn btn--outline btn--sm btn-administrar-corte" data-id="' + c.id + '">Administrar</button>' +
        '<button class="btn btn--ghost btn--sm btn-compartir-corte" data-id="' + c.id + '">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
        'Compartir</button>' +
        '<button class="btn btn--ghost btn--sm btn-eliminar-corte" data-id="' + c.id + '" data-nombre="' + escaparHTML(c.nombreCorte || "") + '">Eliminar</button>' +
        '</div>' +
        '</div>';
    }).join("") +
    '</div>';
}

// ============================================================
// FORMATEO DE FECHA - Convierte fecha ISO a DD/MM/YYYY
// ============================================================

function formatearFecha(fechaISO) {
  var fecha = new Date(fechaISO);
  var dia = String(fecha.getDate()).padStart(2, "0");
  var mes = String(fecha.getMonth() + 1).padStart(2, "0");
  var anio = fecha.getFullYear();
  return dia + "/" + mes + "/" + anio;
}

// ============================================================
// CLICK HANDLER - Delegacion de eventos en documento
// Maneja clicks en botones Administrar (-> #detalle-corte/:id)
// y Eliminar (-> modal de confirmacion con cascade delete).
// ============================================================

function manejarClickDocumentoC(e) {
  var fueAdministrar = e.target.closest(".btn-administrar-corte");
  var fueCompartir = e.target.closest(".btn-compartir-corte");
  var fueEliminar = e.target.closest(".btn-eliminar-corte");

  if (fueAdministrar) {
    var id = parseInt(fueAdministrar.dataset.id);
    location.hash = "#administrar-tareas/" + id;
    return;
  }
  if (fueCompartir) {
    var idCompartir = parseInt(fueCompartir.dataset.id);
    exportarCorteJSON(idCompartir);
    return;
  }
  if (fueEliminar) {
    var idDel = parseInt(fueEliminar.dataset.id);
    var nombreDel = fueEliminar.dataset.nombre || "este corte";
    confirmarEliminarCorte(idDel, nombreDel);
    return;
  }
}

// ============================================================
// ELIMINAR CORTE - Cascade delete de pagos asociados.
// Antes de confirmar, cuenta los pagos del corte y los muestra
// en el modal. La eliminacion es atomica (transaccion rw) para
// garantizar consistencia. IndexedDB no tiene FK constraints.
// ============================================================

async function confirmarEliminarCorte(id, nombre) {
  var pagosAsociados = [];
  try {
    pagosAsociados = await db.pagos.where("corteId").equals(id).toArray();
  } catch (err) {
    console.error("Error al buscar pagos del corte:", err);
  }

  var cantidadPagos = pagosAsociados.length;
  var totalPagosBs = pagosAsociados.reduce(function (acc, p) {
    return acc + (p.monto || 0);
  }, 0);

  var mensaje = 'Estas seguro de eliminar "' + nombre + '"?';
  if (cantidadPagos > 0) {
    mensaje += ' Este corte tiene ' + cantidadPagos +
      ' pago(s) registrado(s) por un total de ' + formatBs(totalPagosBs) +
      ' que tambien se eliminaran.';
  }
  mensaje += ' Esta accion no se puede deshacer.';

  mostrarModalConfirmar(
    "Eliminar Corte",
    mensaje,
    "danger",
    async function () {
      try {
        await db.transaction("rw", db.cortes, db.pagos, async function () {
          await db.pagos.where("corteId").equals(id).delete();
          await db.cortes.delete(id);
        });
        var toast = cantidadPagos > 0
          ? "Corte eliminado (junto con " + cantidadPagos + " pago(s))"
          : "Corte eliminado";
        mostrarToast(toast, "success");
        await cargarCortes();
      } catch (err) {
        console.error("Error al eliminar corte:", err);
        mostrarToast("Error al eliminar", "error");
      }
    },
    undefined,
    "Eliminar"
  );
}

// ============================================================
// EXPORTAR CORTE COMO JSON - Construye un paquete con el corte,
// su prenda, sus trabajadores y sus pagos. Luego lo comparte
// via Web Share API o lo descarga como .tcorte.json.
// ============================================================

async function exportarCorteJSON(corteId) {
  try {
    var corte = todosLosCortes.find(function (c) { return c.id === corteId; });
    if (!corte) {
      mostrarToast("Corte no encontrado", "error");
      return;
    }

    var prenda = null;
    if (corte.prendaId) {
      prenda = await db.prendas.get(corte.prendaId);
    }

    // Recolectar trabajadorIds unicos de las asignaciones
    var idsTrab = {};
    (corte.tareas || []).forEach(function (t) {
      (t.asignaciones || []).forEach(function (a) {
        if (a.trabajadorId) idsTrab[a.trabajadorId] = true;
      });
    });
    var trabajadoresArr = [];
    var idList = Object.keys(idsTrab).map(Number);
    if (idList.length > 0) {
      trabajadoresArr = await db.trabajadores.where("id").anyOf(idList).toArray();
    }

    // Cargar pagos asociados al corte
    var pagos = await db.pagos.where("corteId").equals(corteId).toArray();

    // Construir paquete
    var paquete = {
      version: "tallercorte/1",
      tipo: "corte",
      exportadoEl: new Date().toISOString(),
      datos: {
        corte: corte,
        prenda: prenda,
        trabajadores: trabajadoresArr,
        pagos: pagos
      }
    };

    var jsonStr = JSON.stringify(paquete, null, 2);
    var nombreArchivo = (corte.nombreCorte || "corte").replace(/[^a-zA-Z0-9_-]/g, "_") + ".tcorte.json";

    // Intentar Web Share API con archivo (movil)
    var file = new File([jsonStr], nombreArchivo, { type: "application/json" });
    var puedeCompartir = false;
    try {
      puedeCompartir = navigator.canShare && navigator.canShare({ files: [file] });
    } catch (e) {
      puedeCompartir = false;
    }

    if (puedeCompartir) {
      try {
        await navigator.share({
          files: [file],
          title: "Corte: " + (corte.nombreCorte || "Sin nombre")
        });
        mostrarToast("Corte compartido", "success");
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }

    // Fallback: descargar archivo (desktop / navegadores sin Web Share)
    descargarArchivo(jsonStr, nombreArchivo);
    mostrarToast("Archivo descargado como " + nombreArchivo, "success");
  } catch (err) {
    console.error("Error exportando corte:", err);
    mostrarToast("Error al exportar el corte", "error");
  }
}

// ============================================================
// DESCARGA DE ARCHIVO - Crea un Blob y lo descarga via link
// temporal. Fallback para navegadores sin Web Share API.
// ============================================================

function descargarArchivo(contenido, nombreArchivo) {
  var blob = new Blob([contenido], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// IMPORTAR CORTE - Abre el selector de archivos .tcorte.json,
// valida la estructura, muestra un modal de confirmacion y
// procesa la importacion con resolucion de conflictos.
// ============================================================

function abrirImportadorCorte() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,.tcorte.json";
  input.hidden = true;
  document.body.appendChild(input);

  input.addEventListener("change", async function () {
    document.body.removeChild(input);
    var file = input.files[0];
    if (!file) return;

    try {
      var texto = await leerArchivoComoTexto(file);
      var data = JSON.parse(texto);
      var errorValidacion = validarPaqueteCorte(data);
      if (errorValidacion) {
        mostrarToast(errorValidacion, "warning");
        return;
      }

      var nombreCorte = (data.datos.corte.nombreCorte || "Sin nombre");
      var nombrePrenda = data.datos.prenda ? data.datos.prenda.nombre : "Sin prenda";
      var cantTrabajadores = (data.datos.trabajadores || []).length;
      var cantPagos = (data.datos.pagos || []).length;

      var mensaje = 'Vas a importar el corte "' + nombreCorte + '".\n\n' +
        "Prenda: " + nombrePrenda + "\n" +
        "Trabajadores: " + cantTrabajadores + "\n" +
        "Pagos: " + cantPagos + "\n\n" +
        "Los trabajadores y la prenda se vincularan por nombre si ya existen. " +
        "Esta accion no se puede deshacer.";

      mostrarModalConfirmar(
        "Importar Corte",
        mensaje,
        "primary",
        async function () {
          try {
            await procesarImportacionCorte(data);
            mostrarToast('Corte "' + nombreCorte + '" importado correctamente', "success");
            await cargarCortes();
          } catch (err) {
            console.error("Error importando corte:", err);
            mostrarToast("Error al importar el corte", "error");
          }
        },
        undefined,
        "Importar"
      );
    } catch (err) {
      console.error("Error leyendo archivo:", err);
      mostrarToast("El archivo no es valido o esta danado", "error");
    }
  });

  input.click();
}

// ============================================================
// LECTURA DE ARCHIVO - Lee un archivo como texto usando
// FileReader, envuelto en una Promesa.
// ============================================================

function leerArchivoComoTexto(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (e) { resolve(e.target.result); };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ============================================================
// VALIDACION DEL PAQUETE - Verifica que el JSON tenga la
// estructura esperada (version, tipo, datos.corte, etc.).
// Retorna null si es valido, o un mensaje de error si no.
// ============================================================

function validarPaqueteCorte(data) {
  if (!data || typeof data !== "object") return "El archivo no contiene datos validos.";
  if (!data.version || data.version.indexOf("tallercorte/") !== 0) return "Version de archivo no soportada.";
  if (data.tipo !== "corte") return "El archivo no es un paquete de corte valido.";
  if (!data.datos || !data.datos.corte) return "El archivo no contiene datos del corte.";
  if (!Array.isArray(data.datos.corte.tareas)) return "El corte no tiene tareas validas.";
  return null;
}

// ============================================================
// PROCESAR IMPORTACION - Resuelve conflictos por nombre para
// prenda y trabajadores, remapea IDs y guarda todo en una
// transaccion atomica (corte + prenda + trabajadores + pagos).
// ============================================================

async function procesarImportacionCorte(data) {
  var corte = data.datos.corte;
  var prenda = data.datos.prenda;
  var trabajadores = data.datos.trabajadores || [];
  var pagos = data.datos.pagos || [];

  await db.transaction("rw", db.prendas, db.trabajadores, db.cortes, db.pagos, async function () {
    // 1. Resolver prenda por nombre
    var nuevaPrendaId = null;
    if (prenda && prenda.nombre) {
      var prendaExistente = await db.prendas.where("nombre").equals(prenda.nombre).first();
      if (prendaExistente) {
        nuevaPrendaId = prendaExistente.id;
      } else {
        nuevaPrendaId = await db.prendas.add({
          nombre: prenda.nombre,
          tareas: prenda.tareas || []
        });
      }
    }

    // 2. Resolver trabajadores por nombre, construir mapa oldId -> newId
    var mapaTrab = {}; // oldId -> newId
    for (var i = 0; i < trabajadores.length; i++) {
      var t = trabajadores[i];
      var existente = await db.trabajadores.where("nombre").equals(t.nombre).first();
      if (existente) {
        mapaTrab[t.id] = existente.id;
      } else {
        var nuevoId = await db.trabajadores.add({ nombre: t.nombre });
        mapaTrab[t.id] = nuevoId;
      }
    }

    // 3. Remapear trabajadorIds en las asignaciones del corte
    var corteData = JSON.parse(JSON.stringify(corte));
    delete corteData.id;
    corteData.prendaId = nuevaPrendaId;
    if (corteData.tareas) {
      corteData.tareas = corteData.tareas.map(function (tarea) {
        if (tarea.asignaciones) {
          tarea.asignaciones = tarea.asignaciones.map(function (a) {
            if (a.trabajadorId && mapaTrab[a.trabajadorId] !== undefined) {
              a.trabajadorId = mapaTrab[a.trabajadorId];
            }
            return a;
          });
        }
        return tarea;
      });
    }

    // 4. Insertar el corte (nuevo ID auto-incremental)
    var nuevoCorteId = await db.cortes.add(corteData);

    // 5. Insertar pagos con IDs remapeados
    for (var j = 0; j < pagos.length; j++) {
      var p = pagos[j];
      var pagoData = {
        corteId: nuevoCorteId,
        trabajadorId: mapaTrab[p.trabajadorId] || p.trabajadorId,
        fecha: p.fecha || new Date().toISOString(),
        monto: p.monto || 0,
        nota: p.nota || ""
      };
      await db.pagos.add(pagoData);
    }
  });
}

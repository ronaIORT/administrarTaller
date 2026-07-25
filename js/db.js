// ============================================================
// SCHEMA - Definicion de stores IndexedDB con Dexie
// ============================================================
// Unidades de moneda:
//   - tarea.precioUnitario: centavos (entero)
//   - corte.precioVentaUnitario: bolivianos (decimal)
// ============================================================
// Schema v5 (actual):
//   - prendas.componentes: [{nombre, tareas: [{nombre, precioUnitario}]}]
//   - cortes.componentes: [{nombre, tareas: [{id, nombre, precioUnitario, unidadesTotales, asignaciones}]}]
// ============================================================

const db = new Dexie("TallerCosturaDB");

db.version(1).stores({
  prendas: "++id, &nombre",
  trabajadores: "++id, &nombre",
  cortes: "++id, estado, prendaId, fechaCreacion, fechaFinalizacion"
});

db.version(2).stores({
  prendas: "++id, &nombre",
  trabajadores: "++id, &nombre",
  cortes: "++id, estado, prendaId, fechaCreacion, fechaFinalizacion",
  pagos: "++id, trabajadorId, fecha",
  gastos: "++id, categoria, fecha"
});

db.version(3).stores({
  prendas: "++id, &nombre",
  trabajadores: "++id, &nombre",
  cortes: "++id, estado, prendaId, fechaCreacion, fechaFinalizacion",
  pagos: "++id, trabajadorId, corteId, fecha",
  gastos: "++id, categoria, fecha"
});

db.version(4).stores({
  prendas: "++id, &nombre",
  trabajadores: "++id, &nombre",
  cortes: "++id, estado, prendaId, fechaCreacion, fechaFinalizacion",
  pagos: "++id, [corteId+trabajadorId], trabajadorId, corteId, fecha",
  gastos: "++id, categoria, fecha"
});

db.version(5).stores({
  prendas: "++id, &nombre",
  trabajadores: "++id, &nombre",
  cortes: "++id, estado, prendaId, fechaCreacion, fechaFinalizacion",
  pagos: "++id, [corteId+trabajadorId], trabajadorId, corteId, fecha",
  gastos: "++id, categoria, fecha"
}).upgrade(function (trans) {
  return trans.table("prendas").toCollection().modify(function (prenda) {
    if (!prenda.componentes && prenda.tareas) {
      var compsMap = {};
      var ordenEtiquetas = [];
      prenda.tareas.forEach(function (t) {
        var etq = t.etiqueta || "General";
        if (!compsMap[etq]) {
          compsMap[etq] = [];
          ordenEtiquetas.push(etq);
        }
        compsMap[etq].push({ nombre: t.nombre, precioUnitario: t.precioUnitario });
      });
      var componentes = [];
      ordenEtiquetas.forEach(function (nombre) {
        componentes.push({ nombre: nombre, tareas: compsMap[nombre] });
      });
      if (componentes.length === 0) componentes = [];
      prenda.componentes = componentes;
      delete prenda.tareas;
      delete prenda.etiquetas;
    }
    if (!prenda.componentes) {
      prenda.componentes = [];
    }
  });
}).upgrade(function (trans) {
  return trans.table("cortes").toCollection().modify(function (corte) {
    if (!corte.componentes && corte.tareas) {
      var compsMap = {};
      var ordenEtiquetas = [];
      corte.tareas.forEach(function (t) {
        var etq = t.etiqueta || "General";
        if (!compsMap[etq]) {
          compsMap[etq] = [];
          ordenEtiquetas.push(etq);
        }
        compsMap[etq].push({
          id: t.id,
          nombre: t.nombre,
          precioUnitario: t.precioUnitario,
          unidadesTotales: t.unidadesTotales,
          asignaciones: t.asignaciones || []
        });
      });
      var componentes = [];
      ordenEtiquetas.forEach(function (nombre) {
        componentes.push({ nombre: nombre, tareas: compsMap[nombre] });
      });
      if (componentes.length === 0) componentes = [];
      corte.componentes = componentes;
      delete corte.tareas;
      delete corte.etiquetas;
    }
    if (!corte.componentes) {
      corte.componentes = [];
    }
  });
});

export { db };

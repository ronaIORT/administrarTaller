// ============================================================
// SCHEMA - Definición de stores IndexedDB con Dexie
// ============================================================
// Unidades de moneda:
//   - tarea.precioUnitario: centavos (entero)
//   - corte.precioVentaUnitario: bolivianos (decimal)
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

export { db };

// ============================================================
// SCHEMA - Definición de stores IndexedDB con Dexie
// ============================================================

const db = new Dexie("TallerCosturaDB");

db.version(1).stores({
  prendas: "++id, &nombre",
  trabajadores: "++id, &nombre",
  cortes: "++id, estado, prendaId, fechaCreacion, fechaFinalizacion",
  pagos: "++id, trabajadorId, corteId, fecha"
});

db.version(2).stores({
  gastos: "++id, fecha, cat"
});

export { db };
// ============================================================
// SCHEMA - Definición de stores IndexedDB con Dexie
// ============================================================

const db = new Dexie("TallerCosturaDB");

//++id = auto-increment, &nombre = índice único (no permite duplicados)
db.version(1).stores({
  prendas: "++id, &nombre",
  trabajadores: "++id, &nombre",
  cortes: "++id, estado, prendaId, fechaCreacion, fechaFinalizacion",
  pagos: "++id, trabajadorId, corteId, fecha"
});

export { db };
// ============================================================
// SCHEMA - Definición de stores IndexedDB con Dexie
// ============================================================
// Unidades de moneda:
//   - tarea.precioUnitario: centavos (entero)
//   - corte.precioVentaUnitario: bolivianos (decimal)
//   - pago.monto: bolivianos (decimal, 2 decimales)
//   - gasto.monto: bolivianos (decimal, 2 decimales)
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
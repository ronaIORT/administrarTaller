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

// ============================================================
// SEED DATA - Datos iniciales de prueba
// Se ejecutan automáticamente al crear la BD por primera vez
// ============================================================

db.on("populate", () => {
  const prendasBase = [
    {
      nombre: "Camisa",
      tareas: [
        { nombre: "Corte", precioUnitario: 30 },
        { nombre: "Confeccion", precioUnitario: 50 },
        { nombre: "Ojales y botones", precioUnitario: 20 },
        { nombre: "Planchado", precioUnitario: 10 }
      ]
    },
    {
      nombre: "Pantalon",
      tareas: [
        { nombre: "Corte", precioUnitario: 25 },
        { nombre: "Confeccion", precioUnitario: 60 },
        { nombre: "Bolsillos", precioUnitario: 15 },
        { nombre: "Pretina", precioUnitario: 20 },
        { nombre: "Planchado", precioUnitario: 10 }
      ]
    },
    {
      nombre: "Chamarra",
      tareas: [
        { nombre: "Corte", precioUnitario: 35 },
        { nombre: "Confeccion", precioUnitario: 70 },
        { nombre: "Forro", precioUnitario: 25 },
        { nombre: "Cremallera", precioUnitario: 20 },
        { nombre: "Bolsillos", precioUnitario: 15 },
        { nombre: "Planchado", precioUnitario: 15 }
      ]
    },
    {
      nombre: "Falda",
      tareas: [
        { nombre: "Corte", precioUnitario: 20 },
        { nombre: "Confeccion", precioUnitario: 35 },
        { nombre: "Cremallera", precioUnitario: 15 },
        { nombre: "Planchado", precioUnitario: 10 }
      ]
    },
    {
      nombre: "Vestido",
      tareas: [
        { nombre: "Corte", precioUnitario: 30 },
        { nombre: "Confeccion", precioUnitario: 55 },
        { nombre: "Cremallera", precioUnitario: 15 },
        { nombre: "Forro", precioUnitario: 25 },
        { nombre: "Planchado", precioUnitario: 15 }
      ]
    }
  ];

  const trabajadoresBase = [
    { nombre: "Maria Gomez" },
    { nombre: "Juan Perez" },
    { nombre: "Ana Torres" },
    { nombre: "Pedro Rojas" },
    { nombre: "Luisa Mamani" },
    { nombre: "Carlos Choque" }
  ];

  db.prendas.bulkAdd(prendasBase);
  db.trabajadores.bulkAdd(trabajadoresBase);
});

export { db };
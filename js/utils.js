// ============================================================
// SEGURIDAD - Escape de HTML para prevenir XSS
// ============================================================

/**
 * Escapa texto para usarlo de forma segura en HTML.
 * Convierte caracteres especiales (& < > " ') en entidades HTML.
 * @param {string} str - Texto a escapar
 * @returns {string} - Texto seguro para insertar en innerHTML
 */
function escaparHTML(str) {
  const div = document.createElement("div");
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ============================================================
// MONEDA - Conversión entre centavos y bolivianos
// Toda la app usa centavos (enteros) internamente para evitar
// errores de punto flotante. Solo se convierte a Bs para mostrar.
// ============================================================

/**
 * Convierte centavos a bolivianos.
 * @param {number} centavos - Cantidad en centavos
 * @returns {number} - Cantidad en bolivianos
 */
function centavosABolivianos(centavos) {
  return centavos / 100;
}

/**
 * Convierte bolivianos a centavos.
 * Usa Math.round para evitar imprecisiones de punto flotante.
 * @param {number} bolivianos - Cantidad en bolivianos
 * @returns {number} - Cantidad en centavos (entero)
 */
function bolivianosACentavos(bolivianos) {
  return Math.round(bolivianos * 100);
}

// ============================================================
// FORMATEO - Presentación de datos en la UI
// ============================================================

/**
 * Formatea bolivianos (decimal) como texto con 2 decimales.
 * @param {number} bolivianos - Cantidad en Bs (decimal)
 * @returns {string} - Ej: "15.50 Bs"
 */
function formatBs(bolivianos) {
  return (bolivianos).toFixed(2) + " Bs";
}

/**
 * Formatea centavos como texto en bolivianos con 2 decimales.
 * Para compatibilidad con campos legacy que usan centavos (tareas, precios).
 * @param {number} centavos - Cantidad en centavos
 * @returns {string} - Ej: "15.50 Bs"
 */
function formatBsCtv(centavos) {
  return (centavos / 100).toFixed(2) + " Bs";
}

/**
 * Formatea centavos como texto sin conversión.
 * @param {number} centavos - Cantidad en centavos
 * @returns {string} - Ej: "150 ctv"
 */
function formatCtv(centavos) {
  return centavos + " ctv";
}

/**
 * Formatea centavos para mostrar costo total.
 * @param {number} centavos - Cantidad en centavos
 * @returns {string} - Ej: "15.50 Bs"
 */
function formatCostoTotal(centavos) {
  return (centavos / 100).toFixed(2) + " Bs";
}

/**
 * Formatea un número con separadores de miles localized.
 * @param {number} n - Número a formatear
 * @returns {string} - Ej: "1,234.56"
 */
function formatNumero(n) {
  return new Intl.NumberFormat("es-BO").format(n);
}

export { escaparHTML, centavosABolivianos, bolivianosACentavos, formatBs, formatBsCtv, formatCtv, formatCostoTotal, formatNumero };
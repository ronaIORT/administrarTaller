// ============================================================
// CONSTANTES - Cache versioning
// Cambiar CACHE_NAME cuando se modifiquen assets para forzar
// actualización del service worker en clientes existentes.
// ============================================================

const CACHE_NAME = "taller-costura-v1.0";

// ============================================================
// INSTALL - Se ejecuta cuando el SW se instala por primera vez
// skipWaiting() fuerza activación inmediata sin esperar a que
// todas las pestañas del navegador se cierren.
// ============================================================

self.addEventListener("install", (event) => {
  console.log("[SW] Instalando...");
  self.skipWaiting();
});

// ============================================================
// ACTIVATE - Se ejecuta cuando el SW se activa
// Elimina caches antiguos de versiones previas para evitar
// acumulación de datos innecesarios. clients.claim() hace que
// la app sea controlada inmediatamente por este SW.
// ============================================================

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log("[SW] Eliminando cache:", name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});
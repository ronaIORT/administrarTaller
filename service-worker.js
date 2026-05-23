// ============================================================
// CONSTANTES - Cache versioning
// Cambiar CACHE_NAME cuando se modifiquen assets para forzar
// actualización del service worker en clientes existentes.
// ============================================================

const CACHE_NAME = "taller-costura-v1.0";

// ============================================================
// ASSETS LOCALES - Pre-cacheados durante el evento install
// ============================================================

const ASSETS_LOCALES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/style.css",
  "/css/variables.css",
  "/css/base.css",
  "/css/layout.css",
  "/css/components.css",
  "/css/modals.css",
  "/css/bottom-nav.css",
  "/css/responsive.css",
  "/css/views/dashboard.css",
  "/css/views/gestion-cortes.css",
  "/css/views/gestion-prendas.css",
  "/css/views/gestion-trabajadores.css",
  "/css/views/historial-pagos.css",
  "/css/views/nuevo-corte.css",
  "/css/views/administrar-tareas.css",
  "/js/app.js",
  "/js/db.js",
  "/js/utils.js",
  "/js/views/shared.js",
  "/js/views/dashboard.js",
  "/js/views/gestion-cortes.js",
  "/js/views/gestion-prendas.js",
  "/js/views/gestion-trabajadores.js",
  "/js/views/nuevo-corte.js",
  "/js/views/gestion-pagos.js",
  "/js/views/administrar-tareas/administrar-tareas.js",
  "/js/views/administrar-tareas/tab-asignar.js",
  "/js/views/administrar-tareas/tab-corte.js",
  "/js/views/administrar-tareas/tab-editar.js",
  "/js/views/administrar-tareas/tab-resumen.js",
  "/js/views/administrar-tareas/tab-trabajador.js",
  "/js/views/gestion-pagos/tab-historial.js",
  "/js/views/gestion-pagos/tab-registrar.js",
  "/js/views/gestion-pagos/tab-resumen.js",
  "/icons/icon-192x192.png",
  "/icons/icon-192x192.svg",
  "/icons/icon-512x512.png",
  "/icons/icon-512x512.svg",
];

// ============================================================
// INSTALL - Pre-cachea todos los assets locales
// skipWaiting() fuerza activación inmediata sin esperar a que
// todas las pestañas del navegador se cierren.
// ============================================================

self.addEventListener("install", (event) => {
  console.log("[SW] Instalando y pre-cacheando " + ASSETS_LOCALES.length + " assets...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_LOCALES);
    }).catch((err) => {
      console.error("[SW] Error durante pre-cache:", err);
    })
  );
  self.skipWaiting();
});

// ============================================================
// ACTIVATE - Limpia caches de versiones anteriores
// clients.claim() hace que la app sea controlada inmediatamente.
// ============================================================

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log("[SW] Eliminando cache antiguo:", name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// ============================================================
// MESSAGE - Escucha mensajes del cliente (app.js)
// Permite al usuario forzar la activación del SW en espera
// mediante skipWaiting() cuando hace clic en "Recargar".
// ============================================================

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    console.log("[SW] skipWaiting() forzado por el usuario");
    self.skipWaiting();
  }
});

// ============================================================
// FETCH - Estrategia Cache-First con fallback a network
// Los recursos CDN (Dexie, SheetJS, jsPDF, Chart.js, fuentes)
// se cachean perezosamente en el primer fetch exitoso.
// Para navegación SPA, devuelve index.html cacheado como
// fallback si la ruta no está en cache (offline).
// ============================================================

self.addEventListener("fetch", (event) => {
  // Solo interceptar peticiones GET
  if (event.request.method !== "GET") return;

  // Ignorar peticiones a esquemas no http/https (chrome-extension://, etc.)
  const url = new URL(event.request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Cache hit: devolver respuesta cacheada
      if (cached) return cached;

      // Cache miss: intentar red
      return fetch(event.request).then((response) => {
        // No cachear respuestas inválidas (excepto opaque de CDN no-cors)
        if (!response || (response.status !== 200 && response.type !== "opaque")) {
          return response;
        }

        // Cachear respuesta para futuros accesos
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });

        return response;
      }).catch(() => {
        // Red no disponible (offline)
        // Para peticiones de navegación, devolver index.html (SPA fallback)
        if (event.request.mode === "navigate") {
          return caches.match("/index.html") || caches.match("/");
        }

        // Para otros recursos (scripts, estilos, imágenes) sin cache ni red:
        // devolver respuesta vacía para no romper la app
        if (event.request.destination === "script" || event.request.destination === "style") {
          return new Response("", {
            status: 200,
            headers: { "Content-Type": event.request.destination === "script" ? "application/javascript" : "text/css" }
          });
        }

        // Imágenes: respuesta vacía
        return new Response("", { status: 200 });
      });
    })
  );
});

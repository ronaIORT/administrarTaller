# Guía Completa de Buenas Prácticas para Desarrollo Web y PWA

---

## 1. Arquitectura y Estructura del Proyecto

| ✅ **SIEMPRE HAZ ESTO** | ❌ **NUNCA HAGAS ESTO** |
| :--- | :--- |
| **Planifica antes de escribir código.** Define las funcionalidades, la estructura de datos y un boceto simple. | **Empezar a escribir HTML/CSS/JS sin un plan.** "Ya veré sobre la marcha" es la receta para el caos. |
| **Separa en módulos con responsabilidades claras** (`db.js` para datos, `cliente.js` para lógica de UI de clientes, etc.). | **Tener un solo archivo JS gigante (`app.js`)** que lo hace todo. Se convierte en un monstruo inmantenible. |
| **Sigue una convención de nombres consistente** (ej: camelCase para JS, kebab-case para CSS). Elige una y aplícala en todo el proyecto. | **Mezclar `moduloClientes`, `modulo_clientes`, `ModuloClientes`.** Es una fuente de errores tontos y frustración. |
| **Crea un sistema de "enrutamiento" simple para PWAs** desde el principio, así las URLs (`#/pedidos/5`) tienen significado. | **Usar solo visibilidad/ocultamiento de divs con `style="display:none"`** para cambiar de pantalla. La app se vuelve imposible de enlazar y el estado se corrompe. |

---

## 2. HTML, CSS y JavaScript: La Santísima Trinidad

| ✅ **SIEMPRE HAZ ESTO** | ❌ **NUNCA HAGAS ESTO** |
| :--- | :--- |
| **HTML para la estructura y semántica.** Usa `<nav>, <main>, <article>, <button>, <form>` adecuadamente. | **Usar `<div>` y `<span>` para absolutamente todo.** Los lectores de pantalla y el SEO te lo agradecerán. |
| **CSS para la presentación y los estilos.** Usa variables CSS, grid, flexbox. | **Estilos inline en el HTML (`style="color: red"`).** Es tan malo como los `onclick`. | 
| **JavaScript para el comportamiento y la interacción.** Manipula el DOM, escucha eventos. | **Mezclar las tres capas.** No uses `<script>` en medio del HTML, ni generes estilos desde JS. Cada cosa en su archivo. |
| **Usa `addEventListener` con delegación de eventos** para manejar la interacción del usuario. | **Usar `onclick`, `onsubmit`, `onchange` en tu HTML.** Ya sabes por qué: CSP lo bloquea, no escala y es un infierno de mantener. |
| **Crea componentes reutilizables.** Ej: una función `crearBotonPedido(pedido)` que devuelva el HTML limpio y otra para enlazar su evento. | **Copiar y pegar el mismo bloque de HTML/JS para cada elemento.** Si tienes un bug en uno, tendrás que arreglarlo en 50 sitios. |

---

## 3. Lógica de Negocio y Gestión de Datos (IndexedDB)

| ✅ **SIEMPRE HAZ ESTO** | ❌ **NUNCA HAGAS ESTO** |
| :--- | :--- |
| **Centraliza TODO el acceso a la base de datos en un solo módulo** (ej: `db.js`). El resto de la app solo llama a `db.pedidos.add(...)`. | **Esparcir llamadas a `indexedDB.open()` o a Dexie por todo el código.** Si mañana cambias la estructura de la BD, rompes toda la app. |
| **Define un esquema de datos claro desde el principio.** Tus objetos deben tener siempre la misma forma. | **Guardar datos inconsistentes.** Por ejemplo: un pedido a veces con `clienteId` como número, a veces como string. Te dará dolores de cabeza al consultar. |
| **Escribe funciones de alto nivel para tu lógica de negocio.** Ej: `cerrarPedido(id)` en lugar de hacer un `update` manual del estado a "Terminado" y restar del inventario. | **Repetir lógica compleja.** Si para "terminar un pedido" hay que hacer 3 pasos, prográmalo una sola vez y reutilízalo. |
| **Valida los datos antes de guardarlos.** Que el nombre del cliente no esté vacío, que el precio sea un número positivo, etc. | **Confiar ciegamente en lo que introduzca el usuario o venga de un formulario.** Así es como se llena la base de datos de basura. |

---

## 4. Offline-First y Service Workers

| ✅ **SIEMPRE HAZ ESTO** | ❌ **NUNCA HAGAS ESTO** |
| :--- | :--- |
| **Implementa el Service Worker desde el principio**, aunque sea con una estrategia simple de "cache-first". | **Dejar el Service Worker para el final, como "algo opcional".** Es un pilar de la PWA. Si no está, tu app offline-first no es offline. |
| **Dale a tu Service Worker un nombre de versión (`CACHE_NAME = 'mi-pwa-v2'`) y una estrategia de actualización.** | **No implementar una lógica de limpieza de caché antiguo.** Tus usuarios se quedarán atascados con una versión vieja de la app para siempre. |
| **Pregúntate siempre: "¿Qué ve el usuario si falla esta petición?".** Ofrece un indicador de "Sin conexión" o "Reintentar". | **Asumir que la red siempre funciona.** Una PWA sin manejo de errores de red es una app rota. |
| **Aprovecha el almacenamiento local (IndexedDB) como fuente de verdad.** La UI debe leer de ahí, no de una respuesta de fetch. | **Hacer que la UI dependa de una petición fetch exitosa para mostrar datos.** Salvo que uses una estrategia `stale-while-revalidate`, la UI debe pintarse con lo que tiene en local al instante. |

---

## 5. Seguridad y Robustez

| ✅ **SIEMPRE HAZ ESTO** | ❌ **NUNCA HAGAS ESTO** |
| :--- | :--- |
| **Sirve SIEMPRE sobre HTTPS.** Sin excusas. | **Tener una PWA en producción con HTTP.** El Service Worker ni siquiera se registrará. |
| **Escapa cualquier dato que venga del usuario o externo antes de pintarlo en el HTML** (para prevenir XSS). Usa tu función `escaparHTML()` o una librería. | **Usar `innerHTML` directamente con datos no fiables.** Ejemplo: `` `<li>${cliente.nombre}</li>` ``. Si el nombre es `<img src=x onerror=alert('Hackeado!')>`, te inyectaron código. |
| **Implementa una estrategia de respaldo para los datos.** Exportar/Importar un archivo JSON o sincronizar con la nube. | **Asumir que los datos en IndexedDB son eternos.** Un usuario puede borrar los datos de navegación, romper su móvil o cambiar de dispositivo. Sin backup, perdió todo. |

---

## Resumen en Tres Mandamientos

1.  **Separación y Orden:** Divide y vencerás. Cada archivo (HTML, CSS, JS, módulo) con una responsabilidad única y clara. No mezcles lógica, presentación y estructura.
2.  **Offline-First no es Opcional:** Diseña cada pantalla pensando en que no hay internet. Los datos se leen y escriben en local. La red es solo un "plus" para sincronizar.
3.  **No Hagas Magia Oscura:** Huye de `onclick`, `style` inline, de variables globales y de código que "funciona pero no sabes por qué". Escribe código limpio, semántico y predecible. Tu "yo del futuro" te lo agradecerá cuando tenga que añadir "gestión de telas" 6 meses después.

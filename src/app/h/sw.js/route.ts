// GET /h/sw.js — el service worker del link del capataz y del chofer. Su alcance es SÓLO /h/
// (no toca el escritorio). Hace una sola cosa: si no hay señal, devuelve la última copia de
// lo que ya se bajó (la página /h/<token>, sus scripts y estilos, y las miniaturas de los
// planos). Con señal va siempre a la red (la caché es sólo el respaldo), así que nunca sirve
// una versión vieja estando en línea. Los datos de la hoja los guarda la página
// (localStorage); los toques sin señal los manda la página cuando vuelve.
//
// Para apagarlo en todos los teléfonos: cambiar APAGADO a true y desplegar (se desregistra solo).

export const dynamic = "force-static";

const APAGADO = false;
const VERSION = "hoja-dia-v1";

const SW = `
const CACHE = ${JSON.stringify(VERSION)};
const MAX = 160;
const APAGADO = ${APAGADO};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("hoja-dia-") && (k !== CACHE || APAGADO)) await caches.delete(k);
  if (APAGADO) { await self.registration.unregister(); return; }
  await self.clients.claim();
})()));

function guardable(req) {
  if (req.method !== "GET") return false;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return false;
  if (req.mode === "navigate") return u.pathname.startsWith("/h/");
  return u.pathname.startsWith("/_next/static/") || /^\\/api\\/public\\/hoja\\/[^/]+\\/archivo\\/\\d+$/.test(u.pathname);
}

async function recortar(c) {
  const ks = await c.keys();
  for (let i = 0; i < ks.length - MAX; i++) await c.delete(ks[i]);
}
async function guardar(req, res) {
  if (!res || !res.ok || res.type === "opaque") return;
  try { const c = await caches.open(CACHE); await c.put(req, res); await recortar(c); } catch (e) { /* caché llena: sigue sin copia */ }
}

self.addEventListener("fetch", (e) => {
  if (APAGADO || !guardable(e.request)) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      e.waitUntil(guardar(e.request, res.clone()));
      return res;
    } catch (err) {
      const hit = await caches.match(e.request, { ignoreVary: true, ignoreSearch: e.request.mode === "navigate" });
      if (hit) return hit;
      throw err;
    }
  })());
});

// La página avisa qué bajó antes de que el service worker la controlara (la primera vez).
self.addEventListener("message", (e) => {
  const urls = e.data && e.data.tipo === "guardar" && Array.isArray(e.data.urls) ? e.data.urls : [];
  e.waitUntil(Promise.all(urls.map(async (u) => {
    try {
      const req = new Request(u, { credentials: "same-origin" });
      if (!guardable(req) && !new URL(u).pathname.startsWith("/h/")) return;
      if (await caches.match(req, { ignoreVary: true })) return;
      await guardar(req, await fetch(req));
    } catch (err) { /* sin señal: queda para la próxima */ }
  })));
});
`;

export function GET() {
  return new Response(SW, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/h/",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

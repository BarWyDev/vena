import { precacheAndRoute } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope;

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(({ url }) => url.pathname.startsWith("/api/"), new NetworkOnly());

registerRoute(
  ({ url }) => url.pathname.startsWith("/_astro/"),
  new CacheFirst({
    cacheName: "astro-static",
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

const navStrategy = new NetworkFirst({ cacheName: "pages" });
registerRoute(
  new NavigationRoute(
    async (params) => {
      try {
        return await navStrategy.handle(params);
      } catch {
        return (await caches.match("/offline.html")) ?? new Response("Offline", { status: 503 });
      }
    },
    { denylist: [/^\/api/] },
  ),
);

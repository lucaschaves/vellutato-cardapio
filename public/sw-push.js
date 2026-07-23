/* Handler de Web Push — importado pelo service worker do vite-plugin-pwa */
self.addEventListener("push", (event) => {
  let data = { title: "Vellutato", body: "Atualização do pedido", url: "/delivery" };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (_) {
    try {
      data.body = event.data?.text() || data.body;
    } catch (_) {
      /* ignore */
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Vellutato", {
      body: data.body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag: data.tag || "vellutato-pedido",
      data: { url: data.url || "/delivery" },
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/delivery";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      for (const cliente of clientes) {
        if ("focus" in cliente) {
          cliente.navigate(url);
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});

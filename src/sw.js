// Service worker do Onlist: cache do app (offline) + avisos push (FCM)
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

// Atualização automática (registerType: 'autoUpdate')
self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Mensagens só com "data" (enviadas por /api/notify): o próprio SW mostra o aviso
self.addEventListener('push', event => {
  let data = {}
  try {
    const json = event.data?.json() || {}
    data = json.data || json
  } catch {
    data = { body: event.data?.text() }
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Onlist', {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  }))
})

// Tocar no aviso abre (ou foca) o app
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = all.find(c => c.url.startsWith(self.location.origin))
    if (client) {
      await client.focus()
      return client.navigate?.(url)
    }
    return self.clients.openWindow(url)
  })())
})

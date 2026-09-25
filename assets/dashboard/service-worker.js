const CACHE='agent-control-offline-v2';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/dashboard-theme.css']))));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin===self.location.origin&&url.pathname==='/dashboard-theme.css'&&event.request.method==='GET'){event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match('/dashboard-theme.css'))));return;}
 // Never cache API responses, credentials, evidence or the live dashboard.
 if(url.origin===self.location.origin&&event.request.mode==='navigate'&&event.request.method==='GET')
  event.respondWith(fetch(event.request).catch(()=>caches.open(CACHE).then(cache=>cache.match('/offline.html'))));
});

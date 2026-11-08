/* SQL 卡牌拼装 · Service Worker
   策略：
   - 页面与本地资源：预缓存 + 缓存优先（离线可直接打开）
   - Tailwind CDN / 音效等第三方资源：首次访问后写入运行时缓存，离线可用
   - 导航请求一律回退到 index.html（单页应用体验）
*/
const CACHE_NAME = 'sql-brick-v2';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 单个资源失败不影响整体安装
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k !== CACHE_NAME;
      }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只处理 http/https
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 页面导航：优先用预缓存的 index.html，保证离线可打开
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(function (cached) {
        return cached || fetch(req).catch(function () {
          return caches.match('./index.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        // 206（音视频分段请求）不能写入 Cache
        if (res && (res.ok || res.type === 'opaque') && res.status !== 206) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return res;
      }).catch(function () {
        return caches.match(req);
      });
    })
  );
});

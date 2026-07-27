// 松子鱼工作台 Service Worker
// 每次更新代码必须升级 CACHE_VERSION，否则手机浏览器永远用旧缓存
const CACHE_VERSION = 'songziyu-v6';
const CACHE_NAME = CACHE_VERSION;

// 静态资源使用相对路径，兼容 GitHub Pages 子路径部署
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

// 安装时缓存核心资源，并立即激活
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 监听页面发来的跳过等待消息
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 激活时删除所有旧版本缓存，强制使用新资源
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// fetch 拦截策略：
// - API 请求（股票搜索/行情、热榜）：始终走网络，不缓存
// - 静态资源：网络优先，失败时回退缓存
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // API 请求 - 永远走网络，不经过缓存
  if (
    url.hostname.includes('eastmoney.com') ||
    url.hostname.includes('gtimg.cn') ||
    url.hostname.includes('uapis.cn') ||
    url.hostname.includes('api.github.com')
  ) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // 静态资源：网络优先，失败回退缓存
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || new Response('', { status: 503 })))
  );
});

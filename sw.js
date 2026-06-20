/**
 * sw.js — Ginkgo Engine Service Worker
 * Strategy: CDN → Cache-First, Local → Network-First with cache fallback
 * v4 — Fixed Range request 206 caching error
 */

const CACHE_NAME = 'ginkgo-v4-' + '20260620';
const LOCAL_CACHE = 'ginkgo-local-v4';
const CDN_CACHE = 'ginkgo-cdn-v4';

// 需要预缓存的本地核心资源（安装时立即缓存）
const PRECACHE_URLS = [
  '/',
  'index.html',
  'editor.html',
  'epilogue.html',
  'css/gal-core.css',
  'css/gal-beautify.css',
  'css/epilogue.css',
  'js/config.js',
  'js/storage.js',
  'js/core.js',
  'js/gamepad.js',
  'js/main.js',
  'js/epilogue-entry.js',
  'js/epilogue/ep-api.js',
  'js/epilogue/ep-memory.js',
  'js/epilogue/ep-emotion.js',
  'js/epilogue/ep-engine.js',
  'js/epilogue/ep-ui.js',
  'js/epilogue/ep-tts.js',
  'js/epilogue/ep-effects.js',
  'js/epilogue/ep-gaze.js',
  'js/epilogue/ep-customize.js',
  'js/epilogue/ep-live2d.js',
  'story_scenes.json',
  'epilogue_topics.json',
  'imgbb-urls.json',
  'manifest.json'
];

// CDN 域名列表
const CDN_ORIGINS = [
  'mirrors.sustech.edu.cn',
  'cdn.jsdmirror.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

function isCDN(url) {
  return CDN_ORIGINS.some(o => url.includes(o));
}

// ★ 判断响应是否可以安全缓存
// - 只能缓存完整的 200 响应
// - 206 Partial Content（Range 请求返回）Cache API 不支持
// - 0 状态码表示 opaque 响应（跨域 no-cors），也可以缓存
function isCacheable(response) {
  return response.status === 200 || response.status === 0;
}

// ─── Install: 预缓存本地资源 ─────────────────
self.addEventListener('install', event => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(LOCAL_CACHE).then(cache => {
      console.log('[SW] 预缓存 ' + PRECACHE_URLS.length + ' 个核心文件');
      return Promise.allSettled(
        PRECACHE_URLS.map(url => cache.add(url).catch(e =>
          console.warn('[SW] 预缓存跳过:', url, e.message)
        ))
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: 清理旧缓存 ─────────────────
self.addEventListener('activate', event => {
  console.log('[SW] 激活');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== LOCAL_CACHE && k !== CDN_CACHE && !k.startsWith('ginkgo-'))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: 智能缓存策略 ─────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = request.url;

  // 跳过非 GET 请求
  if (request.method !== 'GET') return;

  // ★ 跳过带 Range 头的请求
  //   浏览器/Howler.js 流式加载大音频时会发 Range: bytes=0-xxx
  //   服务器返回 206 Partial Content，Cache API 不支持缓存 206
  if (request.headers.has('Range') || request.headers.has('range')) return;

  // 跳过 chrome-extension / API 请求
  if (url.startsWith('chrome-extension://') || url.includes('api.deepseek.com')) return;

  // CDN 资源：Cache-First
  if (isCDN(url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (isCacheable(response)) {
            const clone = response.clone();
            caches.open(CDN_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 本地资源：Network-First，离线时回退缓存
  event.respondWith(
    fetch(request).then(response => {
      if (isCacheable(response)) {
        const clone = response.clone();
        caches.open(LOCAL_CACHE).then(cache => cache.put(request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(request).then(cached => {
        if (cached) return cached;
        // 对于导航请求，返回缓存的入口页面
        if (request.mode === 'navigate') {
          return caches.match('index.html') || caches.match('/');
        }
        return new Response('离线状态，资源不可用', { status: 503 });
      });
    })
  );
});

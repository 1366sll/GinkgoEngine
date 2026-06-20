const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

// MIME 类型映射 — 确保浏览器正确解析每种资源
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.mp3':  'audio/mpeg',
    '.m4a':  'audio/mp4',
    '.wav':  'audio/wav',
    '.ogg':  'audio/ogg',
    '.mp4':  'video/mp4',
    '.webm': 'video/webm',
    '.woff2':'font/woff2',
    '.woff': 'font/woff',
    '.ttf':  'font/ttf',
};

const server = http.createServer((req, res) => {
    // 放行所有 CORS — 消除 file:// 协议下的跨域限制
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 去掉 query string，只取路径部分
    let filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    // 根路径 → 默认打开 index.html
    if (req.url === '/' || filePath === ROOT) {
        filePath = path.join(ROOT, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('404 Not Found: ' + req.url);
            } else {
                res.writeHead(500);
                res.end('500 Server Error');
            }
            console.error(`  ⚠ ${req.url} → ${err.code}`);
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log('╔════════════════════════════════╗');
    console.log('║  🍂 Ginkgo Engine · Dev Server  ║');
    console.log('╠════════════════════════════════╣');
    console.log(`║  Address: http://localhost:${PORT}  ║`);
    console.log('║  Player: /index.html          ║');
    console.log('║  Editor: /editor.html         ║');
    console.log('║  根目录: 项目文件夹           ║');
    console.log('║  按 Ctrl+C 停止               ║');
    console.log('╚════════════════════════════════╝');
});

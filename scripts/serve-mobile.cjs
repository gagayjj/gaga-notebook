const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..", process.env.SITE_DIR || "dist");
const port = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function lanAddresses() {
  const list = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) list.push(entry.address);
    }
  }
  return list;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);

  if (urlPath === "/webdav") {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const target = requestUrl.searchParams.get("url");
    if (!target || !target.startsWith("https://dav.jianguoyun.com/")) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      });
      res.end();
      return;
    }
    const headers = { ...req.headers };
    delete headers.origin;
    delete headers.referer;
    delete headers["sec-fetch-mode"];
    delete headers["sec-fetch-site"];
    headers.host = new URL(target).host;
    const proxyReq = https.request(
      target,
      {
        method: req.method || "GET",
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, {
          ...proxyRes.headers,
          "Access-Control-Allow-Origin": "*",
        });
        proxyRes.pipe(res);
      },
    );
    proxyReq.on("error", () => {
      res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("WebDAV proxy error");
    });
    req.pipe(proxyReq);
    return;
  }

  let filePath = path.normalize(path.join(root, urlPath));
  if (!filePath.startsWith(root)) filePath = path.join(root, "index.html");

  fs.stat(filePath, (statError, stats) => {
    if (!statError && stats.isDirectory()) filePath = path.join(filePath, "index.html");
    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        if (!urlPath.endsWith("/") && !path.extname(filePath)) {
          res.writeHead(302, { Location: "./" });
          res.end();
          return;
        }
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("404 Not Found");
        return;
      }
      const type = MIME[path.extname(filePath)] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(data);
    });
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log("手机版网页服务器已启动：");
  console.log(`  本机:   http://localhost:${port}`);
  for (const address of lanAddresses()) {
    console.log(`  手机:   http://${address}:${port}`);
  }
});

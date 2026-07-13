#!/usr/bin/env node
// Lightweight Node.js reverse proxy replacing Caddy (which was being OOM-killed).
// Replicates Caddyfile rules:
//   - ?XTransformPort=N → proxy to localhost:N
//   - Default          → proxy to localhost:3000
const http = require("http");

const DEFAULT_PORT = 3000;
const LISTEN_PORT = 81;

function proxyRequest(req, res, targetPort) {
  const options = {
    hostname: "127.0.0.1",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: req.headers.host || `localhost:${LISTEN_PORT}`,
      "x-forwarded-for": req.socket.remoteAddress,
      "x-forwarded-proto": "http",
      "x-real-ip": req.socket.remoteAddress,
    },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    console.error(`[Proxy] Error → :${targetPort}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Bad Gateway: ${err.message}`);
    }
  });

  req.pipe(proxy, { end: true });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${LISTEN_PORT}`);
  const transformPort = url.searchParams.get("XTransformPort");
  const targetPort = transformPort ? parseInt(transformPort, 10) : DEFAULT_PORT;
  proxyRequest(req, res, targetPort);
});

server.listen(LISTEN_PORT, () => {
  console.log(`[Proxy] Listening on :${LISTEN_PORT} → default :${DEFAULT_PORT}`);
});

process.on("SIGTERM", () => server.close());
process.on("SIGINT",  () => server.close());

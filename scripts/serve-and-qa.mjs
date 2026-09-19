import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outRoot = join(projectRoot, "out");
const basePath = process.env.CV_BUILDER_QA_BASE_PATH ?? "/cv-builder-web";
if (!/^\/[A-Za-z0-9._-]+$/u.test(basePath)) {
  throw new Error(`CV_BUILDER_QA_BASE_PATH must be one URL segment: ${basePath}`);
}

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) {
      response.writeHead(404).end();
      return;
    }
    const requested = decodeURIComponent(url.pathname.slice(basePath.length)).replace(/^\/+/, "");
    const candidate = normalize(join(outRoot, requested || "index.html"));
    if (relative(outRoot, candidate).startsWith("..")) {
      response.writeHead(403).end();
      return;
    }
    const file = (await stat(candidate)).isDirectory() ? join(candidate, "index.html") : candidate;
    response.writeHead(200, {
      "content-type": mimeTypes[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Static QA server did not start");
process.env.CV_BUILDER_QA_URL = `http://127.0.0.1:${address.port}${basePath}/`;

try {
  await import("./static-flow-qa.mjs");
  await import("./static-pdf-qa.mjs");
  await import("./connected-builder-pairing-qa.mjs");
} finally {
  await new Promise((resolveClose, rejectClose) =>
    server.close((error) => (error ? rejectClose(error) : resolveClose()))
  );
}

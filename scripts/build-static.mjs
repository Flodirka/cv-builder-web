import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const outRoot = join(projectRoot, "out");
const basePath = process.env.CV_BUILDER_BASE_PATH ?? "";
const staticContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "media-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "connect-src 'self' data:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:"
].join("; ");

if (basePath && !/^\/[A-Za-z0-9._-]+$/.test(basePath)) {
  throw new Error(`CV_BUILDER_BASE_PATH must be empty or one URL segment: ${basePath}`);
}

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [nextBin, "build"], {
  cwd: projectRoot,
  stdio: "inherit",
  env: { ...process.env, CV_BUILDER_BASE_PATH: basePath }
});

if (result.status !== 0) process.exit(result.status ?? 1);

const files = [];
const visit = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (!entry.name.endsWith(".map") && entry.name !== "sw.js") files.push(path);
  }
};
await visit(outRoot);

for (const file of files.filter((path) => path.endsWith(".css"))) {
  const source = await readFile(file, "utf8");
  await writeFile(
    file,
    source
      .replaceAll('url("/fonts/', `url("${basePath}/fonts/`)
      .replaceAll("url(/fonts/", `url(${basePath}/fonts/`)
  );
}

for (const file of files.filter((path) => path.endsWith(".html"))) {
  const source = await readFile(file, "utf8");
  if (source.includes("<head>")) {
    await writeFile(
      file,
      source.replace(
        "<head>",
        `<head><meta http-equiv="Content-Security-Policy" content="${staticContentSecurityPolicy}">`
      )
    );
  }
}

const hash = createHash("sha256");
for (const file of files.sort()) {
  hash.update(relative(outRoot, file));
  hash.update(await readFile(file));
}

const cacheName = `cv-builder-${hash.digest("hex").slice(0, 12)}`;
const toUrl = (file) => {
  const path = relative(outRoot, file).split(sep).join("/");
  return `${basePath}/${path}`.replace(/\/{2,}/g, "/");
};
const assets = files.map(toUrl);
const rootUrl = `${basePath}/`.replace(/\/{2,}/g, "/");
const appShellUrl = `${rootUrl}index.html`;
const serviceWorker = `const CACHE_NAME = ${JSON.stringify(cacheName)};
const APP_SHELL = ${JSON.stringify(appShellUrl)};
const ASSETS = ${JSON.stringify(assets)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => event.request.mode === "navigate" ? caches.match(APP_SHELL) : undefined))
  );
});
`;

await writeFile(join(outRoot, "sw.js"), serviceWorker);
await writeFile(join(outRoot, ".nojekyll"), "");

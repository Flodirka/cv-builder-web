import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await cp(
  new URL("../src/a4-preview.module.css", import.meta.url),
  new URL("../dist/a4-preview.module.css", import.meta.url)
);

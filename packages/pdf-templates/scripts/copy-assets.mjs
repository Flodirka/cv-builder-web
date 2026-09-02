import { cp, mkdir } from "node:fs/promises";

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await cp(
  new URL("../src/classic-compact.module.css", import.meta.url),
  new URL("../dist/classic-compact.module.css", import.meta.url)
);

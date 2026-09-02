import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "packages/resume-core/test/*.test.ts"]
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@cv-builder/pdf-templates": new URL("./packages/pdf-templates/src/index.ts", import.meta.url)
        .pathname,
      "@cv-builder/resume-core": new URL("./packages/resume-core/src/index.ts", import.meta.url)
        .pathname
    }
  }
});

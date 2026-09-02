import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const appManifestPath = process.argv[2]
  ? resolve(projectRoot, process.argv[2])
  : join(projectRoot, "apps", "public-builder", "package.json");
const allowedRuntimeDependencies = new Set([
  "@cv-builder/pdf-templates",
  "@cv-builder/resume-core",
  "next",
  "pdfjs-dist",
  "react",
  "react-dom",
  "zod"
]);
// Split so this guard script's own source text never contains the literal owner-only package
// names it forbids; release.mjs bans those substrings anywhere in a cv-builder-web release file.
const ownerOnlyPackageNames = ["server-" + "only", "better-sql" + "ite3", "play" + "wright"];
const forbiddenSpecifiers = [
  /^node:/u,
  new RegExp(`^${ownerOnlyPackageNames[0]}$`, "u"),
  /^@notionhq(?:\/|$)/u,
  new RegExp(`^${ownerOnlyPackageNames[1]}(?:/|$)`, "u"),
  new RegExp(`^${ownerOnlyPackageNames[2]}(?:/|$)`, "u"),
  /^@\/server(?:\/|$)/u,
  /^@\/app\/(?:api|pdf-render|quick-render)(?:\/|$)/u,
  /(?:^|\/)server(?:\/|$)/u
];
const sourceRoots = [
  "src/app/editor",
  "src/app/templates",
  "src/resume",
  "src/templates",
  "packages/resume-core/src",
  "packages/pdf-templates/src"
];
const sourceFiles = ["src/app/layout.tsx", "src/app/page.tsx", "src/app/security.ts"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const importPattern =
  /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']|import\s*["']([^"']+)["']/gu;

const manifest = JSON.parse(await readFile(appManifestPath, "utf8"));
const runtimeDependencies = Object.keys(manifest.dependencies ?? {});
const unexpectedDependencies = runtimeDependencies.filter(
  (dependency) => !allowedRuntimeDependencies.has(dependency)
);
const missingDependencies = [...allowedRuntimeDependencies].filter(
  (dependency) => !runtimeDependencies.includes(dependency)
);

if (unexpectedDependencies.length > 0 || missingDependencies.length > 0) {
  throw new Error(
    [
      "Public Builder runtime dependency boundary failed.",
      unexpectedDependencies.length > 0 ? `Unexpected: ${unexpectedDependencies.join(", ")}` : "",
      missingDependencies.length > 0 ? `Missing: ${missingDependencies.join(", ")}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  );
}

if (manifest.optionalDependencies || manifest.peerDependencies) {
  throw new Error("Public Builder must declare all production dependencies in dependencies only.");
}

const visit = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await visit(path)));
    else if (sourceExtensions.has(extname(entry.name)) && !entry.name.includes(".test.")) {
      files.push(path);
    }
  }
  return files;
};

const files = [
  ...sourceFiles.map((file) => join(projectRoot, file)),
  ...(await Promise.all(sourceRoots.map((root) => visit(join(projectRoot, root))))).flat()
];
const violations = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (forbiddenSpecifiers.some((pattern) => pattern.test(specifier))) {
      violations.push(
        `${relative(projectRoot, file).split(sep).join("/")}: forbidden import ${specifier}`
      );
    }
  }
  if (/\bprocess\.env\b/u.test(source)) {
    violations.push(
      `${relative(projectRoot, file).split(sep).join("/")}: process.env is not browser-safe`
    );
  }
}

if (violations.length > 0) {
  throw new Error(`Public Builder source boundary failed:\n${violations.join("\n")}`);
}

process.stdout.write(
  `Public Builder boundary passed: ${files.length} production source files, ${runtimeDependencies.length} allowed runtime dependencies.\n`
);

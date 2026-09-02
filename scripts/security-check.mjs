import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const reportRoot = join(projectRoot, ".security-reports");
const reportPath = join(reportRoot, "public-security-scan.json");
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".playwright-browsers",
  ".security-reports",
  "coverage",
  "node_modules",
  "tmp"
]);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".pem",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml"
]);
const ruleIds = [
  "ABSOLUTE_HOME_PATH",
  "CI_ACTION_NOT_SHA",
  "CREDENTIAL_ASSIGNMENT",
  "ENV_FILE",
  "GIT_METADATA",
  "INTERNAL_RECORD",
  "KNOWN_SECRET_FORMAT",
  "NON_EXAMPLE_EMAIL",
  "NON_EXAMPLE_PHONE",
  "AUTOMATION_MODULE",
  "PDF_PAYLOAD",
  "PRIVATE_KEY",
  "PROHIBITED_BINARY_PATH",
  "REMOTE_ANALYTICS_OR_CODE",
  "DATABASE_PAYLOAD"
];
const findings = [];
const scannedPaths = [];

const normalize = (path) => path.split(sep).join("/");
const record = (path, ruleId) => findings.push({ path: normalize(path), ruleId });

const walk = async (directory, root = directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path, root)));
    else if (entry.isFile()) files.push(relative(root, path));
  }
  return files.sort();
};

const scanPath = (path) => {
  const normalized = normalize(path);
  const lower = normalized.toLowerCase();
  const parts = lower.split("/");
  const file = parts.at(-1) ?? "";
  if (file === ".env" || file.startsWith(".env.")) record(path, "ENV_FILE");
  if (parts.includes(".git")) record(path, "GIT_METADATA");
  if (["agents.md", "claude.md", "context.md", "memory.md"].includes(file)) {
    record(path, "INTERNAL_RECORD");
  }
  if (
    parts.some((part) => part === "data") ||
    /\.sqlite(?:3|-shm|-wal)?$/u.test(file) ||
    /\.(?:bundle|patch|pdf)$/u.test(file)
  ) {
    record(path, "PROHIBITED_BINARY_PATH");
  }
};

const knownSecretPatterns = [
  /gh[pousr]_[A-Za-z0-9]{30,}/gu,
  /AKIA[A-Z0-9]{16}/gu,
  /xox[baprs]-[A-Za-z0-9-]{20,}/gu,
  /sk-[A-Za-z0-9_-]{32,}/gu,
  /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/gu
];
const privateKeyPattern = new RegExp(
  ["-----BEGIN", "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"].join(" "),
  "u"
);
const credentialPattern = new RegExp(
  [
    "(?:api[_-]?key|password|secret|token)",
    "(?:\\s*[:=]\\s*)",
    `(?:["'][A-Za-z0-9_./+=-]{12,}["']|[A-Za-z0-9_+/=-]{20,})`
  ].join(""),
  "giu"
);
const homePathPatterns = [
  /[A-Za-z]:\\Users\\[^\\\s]+\\/gu,
  /\/Users\/[^/\s]+\//gu,
  /\/home\/[^/\s]+\//gu
];
const automationPattern = new RegExp(
  ["@notion" + "hq", "better-sql" + "ite3", "server-" + "only", "src/server", "src\\\\server"].join(
    "|"
  ),
  "iu"
);
const remotePattern = new RegExp(
  [
    "google-analytics\\.com",
    "googletagmanager\\.com",
    "plausible\\.io",
    "segment\\.com",
    `<script[^>]+src=["']https?://`,
    `import\\(["']https?://`
  ].join("|"),
  "iu"
);
const actionPattern = /^\s*uses:\s*[^\s@]+@([^\s#]+)/gmu;

const scanBuffer = (path, buffer) => {
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") record(path, "PDF_PAYLOAD");
  if (buffer.subarray(0, 15).toString("ascii") === "SQLite format 3") {
    record(path, "DATABASE_PAYLOAD");
  }

  const extension = path.endsWith(".d.ts") ? ".d.ts" : extname(path).toLowerCase();
  if (!textExtensions.has(extension)) return;
  const text = buffer.toString("utf8");
  const normalized = normalize(path);
  const isVendoredPdfWorker =
    /^out\/_next\/static\/media\/pdf\.worker\.min\.[A-Za-z0-9_-]+\.mjs$/u.test(normalized);
  if (privateKeyPattern.test(text)) record(path, "PRIVATE_KEY");
  if (knownSecretPatterns.some((pattern) => pattern.test(text))) {
    record(path, "KNOWN_SECRET_FORMAT");
  }
  if (!isVendoredPdfWorker && homePathPatterns.some((pattern) => pattern.test(text))) {
    record(path, "ABSOLUTE_HOME_PATH");
  }

  if (!isVendoredPdfWorker) {
    for (const match of text.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/giu)) {
      if (match[1].toLowerCase() !== "example.com") record(path, "NON_EXAMPLE_EMAIL");
    }
    if (/\+(?:[\s().-]*\d){10,15}\b/gu.test(text)) record(path, "NON_EXAMPLE_PHONE");
  }

  const isGenerated = normalized.startsWith("out/");
  const isProductionSource = /^(?:src|packages|public)\//u.test(normalized);
  if (!isGenerated && credentialPattern.test(text)) record(path, "CREDENTIAL_ASSIGNMENT");
  if ((isProductionSource || isGenerated) && automationPattern.test(text)) {
    record(path, "AUTOMATION_MODULE");
  }
  if ((isProductionSource || isGenerated) && remotePattern.test(text)) {
    record(path, "REMOTE_ANALYTICS_OR_CODE");
  }

  if (normalized.startsWith(".github/workflows/")) {
    for (const match of text.matchAll(actionPattern)) {
      if (!/^[a-f0-9]{40}$/u.test(match[1])) record(path, "CI_ACTION_NOT_SHA");
    }
  }
};

const scan = async () => {
  for (const path of await walk(projectRoot)) {
    const normalized = normalize(path);
    scannedPaths.push(normalized);
    scanPath(path);
    scanBuffer(path, await readFile(join(projectRoot, path)));
  }

  const report = {
    schema: "cv-builder-public-security/v1",
    generatedAt: new Date().toISOString(),
    status: findings.length === 0 ? "passed" : "failed",
    ruleIds,
    scannedPaths,
    findings
  };
  await mkdir(reportRoot, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `Public security scan ${report.status}: ${scannedPaths.length} files, ${findings.length} findings.\n` +
      `Report: ${normalize(relative(projectRoot, reportPath))}\n`
  );
  if (findings.length > 0) {
    process.stderr.write(
      `${findings.map(({ path, ruleId }) => `${path}: ${ruleId}`).join("\n")}\n`
    );
    process.exitCode = 1;
  }
};

const selfTest = () => {
  const fixtures = [
    [".env.production", Buffer.from("placeholder"), "ENV_FILE"],
    ["fixture.pem", Buffer.from(["-----BEGIN", "PRIVATE KEY-----"].join(" ")), "PRIVATE_KEY"],
    ["fixture.txt", Buffer.from("gh" + "p_" + "A".repeat(36)), "KNOWN_SECRET_FORMAT"],
    ["fixture.txt", Buffer.from("api_" + "key=" + "A".repeat(20)), "CREDENTIAL_ASSIGNMENT"],
    ["fixture.txt", Buffer.from("person@" + "company.invalid"), "NON_EXAMPLE_EMAIL"],
    ["fixture.txt", Buffer.from("+" + "44 20 7946 0123"), "NON_EXAMPLE_PHONE"],
    ["fixture.txt", Buffer.from("C:" + "\\Users\\person\\private"), "ABSOLUTE_HOME_PATH"],
    [
      "src/app/page.tsx",
      Buffer.from("import x from '" + "@notion" + "hq/client'"),
      "AUTOMATION_MODULE"
    ],
    [
      "src/app/page.tsx",
      Buffer.from("<script src='https://plausible.io/x.js'>"),
      "REMOTE_ANALYTICS_OR_CODE"
    ],
    [".github/workflows/test.yml", Buffer.from("uses: actions/checkout@v6"), "CI_ACTION_NOT_SHA"],
    ["fixture.bin", Buffer.from("%PDF-1.7"), "PDF_PAYLOAD"],
    ["fixture.bin", Buffer.from("SQLite format 3"), "DATABASE_PAYLOAD"]
  ];

  for (const [path, buffer, expectedRule] of fixtures) {
    findings.length = 0;
    scanPath(path);
    scanBuffer(path, buffer);
    if (!findings.some((finding) => finding.ruleId === expectedRule)) {
      throw new Error(`Negative self-test did not trigger ${expectedRule}`);
    }
  }
  findings.length = 0;
  scanPath("src/fixture.ts");
  scanBuffer("src/fixture.ts", Buffer.from("const email = 'person@example.com';"));
  if (findings.length > 0) throw new Error("Fictional example fixture was rejected");
  process.stdout.write(`Public security negative self-tests passed: ${fixtures.length} guards.\n`);
};

const command = process.argv[2] ?? "scan";
if (command === "scan") await scan();
else if (command === "self-test") selfTest();
else throw new Error("Usage: node scripts/security-check.mjs <scan|self-test>");

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(import.meta.dirname, "..");
const browserRoot = join(projectRoot, ".playwright-browsers");
if (existsSync(browserRoot)) process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;

const { chromium } = await import("playwright");

const siteUrl = process.env.CV_BUILDER_QA_URL ?? "http://localhost:4173/CV_Builder/";
const siteOrigin = new URL(siteUrl).origin;
const marker = "Private Network Verification Marker";
const markdown = `---
schema: cv-builder/v1
language: en
---

# ${marker}

designer@example.com · [Portfolio](https://example.com/portfolio)

## Experience

### Product Designer
**Subtitle:** Example Studio
**Start:** 2022
**End:** Present
**Location:** Remote
**Description:** Designs fictional local-first tools.
- Built a static resume workflow.
`;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const requests = [];
const browserDiagnostics = [];
context.on("request", (request) => {
  requests.push({
    method: request.method(),
    url: request.url(),
    postData: request.postData() ?? "",
    headers: request.headers()
  });
});
context.on("requestfailed", (request) => {
  browserDiagnostics.push(
    `request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`
  );
});
context.on("response", (response) => {
  if (!response.ok()) browserDiagnostics.push(`response ${response.status()}: ${response.url()}`);
});

const page = await context.newPage();
page.on("console", (message) => {
  if (message.type() === "error") browserDiagnostics.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => browserDiagnostics.push(`page error: ${error.message}`));

try {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(siteUrl, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(500);

  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  assert(csp?.includes("object-src 'none'"), "Static CSP does not block object content");
  assert(csp?.includes("connect-src 'self' data:"), "Static CSP allows remote connections");
  assert(csp?.includes("'wasm-unsafe-eval'"), "Static CSP blocks the local PDF renderer");
  assert(!csp?.includes("'unsafe-eval'"), "Static CSP allows unsafe-eval");

  assert((await page.getByPlaceholder("Heading text").count()) === 0, "First run is not empty");

  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("#resume-markdown-import").setInputFiles({
    name: "network-check.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(markdown)
  });
  const firstReplacement = page.getByRole("button", { name: "Replace current document" });
  await firstReplacement.waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
    throw new Error(
      `Markdown import preview did not open.\n${await page.locator("body").innerText()}`
    );
  });
  await firstReplacement.click();
  const headingInput = page.getByPlaceholder("Heading text").first();
  await headingInput.waitFor({ state: "visible", timeout: 5000 }).catch(async () => {
    throw new Error(
      `Markdown replacement did not render an editable H1.\n${await page.locator("body").innerText()}`
    );
  });
  await headingInput.fill(marker);
  await page.getByRole("button", { name: "Save draft in browser" }).click();
  assert(
    await page.evaluate(() => localStorage.getItem("cv-builder.resume.v1") !== null),
    "Explicit local save did not persist the draft"
  );

  await page.reload({ waitUntil: "load" });
  assert(
    (await page.getByPlaceholder("Heading text").first().inputValue()) === marker,
    "Saved draft did not survive reload"
  );
  assert(
    !(await page.getByText("Fictional Russian resume", { exact: true }).isVisible()),
    "Template chooser stayed expanded after loading a saved draft"
  );

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pdfPath = join(projectRoot, "tmp", "static-pdf-qa", "finished-flow.pdf");
  await mkdir(join(projectRoot, "tmp", "static-pdf-qa"), { recursive: true });
  await page.getByLabel("PDF filename").fill("custom-resume-name");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  assert(download.suggestedFilename() === "custom-resume-name.pdf", "Custom PDF name was ignored");
  await download.saveAs(pdfPath);
  await page.getByText("PDF downloaded", { exact: true }).waitFor();
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Close" })
    .click();
  await page.locator('input[type="file"][accept*="application/pdf"]').setInputFiles(pdfPath);
  await page
    .getByText("No extraction issues found", { exact: true })
    .waitFor()
    .catch(async () => {
      throw new Error(
        `Finished-PDF inspection did not pass.\n${await page
          .getByRole("dialog", { name: "PDF text check" })
          .innerText()}\n${browserDiagnostics.slice(-10).join("\n")}`
      );
    });
  await page
    .getByRole("dialog", { name: "PDF text check" })
    .getByRole("button", { name: "Close" })
    .click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const markdownDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  const markdownDownload = await markdownDownloadPromise;
  const markdownPath = await markdownDownload.path();
  assert(markdownPath, "Markdown export did not create a local file");
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Close" })
    .click();
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("#resume-markdown-import").setInputFiles(markdownPath);
  await page.getByRole("button", { name: "Replace current document" }).click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  const jsonDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON backup" }).click();
  const jsonDownload = await jsonDownloadPromise;
  const jsonPath = await jsonDownload.path();
  assert(jsonPath, "JSON export did not create a local file");
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Close" })
    .click();
  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("#resume-json-import").setInputFiles(jsonPath);
  await page.getByRole("button", { name: "Replace current document" }).click();

  await page.getByLabel("Choose a template").selectOption("Simple ATS");
  await page.getByPlaceholder("Heading text").first().fill("Changed template name");
  await page.getByRole("button", { name: "Reset" }).click();
  await page
    .getByRole("dialog", { name: "Reset current document?" })
    .getByRole("button", { name: "Reset" })
    .click();
  assert(
    (await page.getByPlaceholder("Heading text").first().inputValue()) === "Alex Doe",
    "Reset did not restore the selected built-in template"
  );

  await page.getByRole("button", { name: "Import" }).click();
  await page.locator("#resume-text-import").setInputFiles({
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Taylor Example\n\nSummary without recovered sections.\nSecond line.")
  });
  await page.getByText(/Plain text cannot restore sections or entries/).waitFor();
  await page.getByRole("button", { name: "Replace current document" }).click();
  assert(
    (await page.getByPlaceholder("Heading text").first().inputValue()) === "Taylor Example",
    "Plain-text import did not apply the deterministic H1 rule"
  );

  const desktopWidth = await page.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth
  }));
  assert(desktopWidth.scroll <= desktopWidth.inner, "Desktop document overflows horizontally");

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: "load" });
  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.getByRole("button", { name: "Help and privacy" }).click();
  await page.getByText("Your resume is not uploaded by this editor.", { exact: false }).waitFor();
  await page
    .getByRole("dialog", { name: "Help and privacy" })
    .getByRole("button", { name: "Close" })
    .click();
  await context.setOffline(false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "load" });
  const mobileWidth = await page.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth
  }));
  assert(mobileWidth.scroll <= mobileWidth.inner, "390 px document overflows horizontally");

  await page.evaluate(() => localStorage.setItem("cv-builder.content-templates.v1", "[]"));
  await page.getByRole("button", { name: "Clear local data" }).click();
  await page
    .getByRole("dialog", { name: "Clear saved data from this device?" })
    .getByRole("button", { name: "Clear local data" })
    .click();
  const localData = await page.evaluate(() => ({
    draft: localStorage.getItem("cv-builder.resume.v1"),
    legacyTemplates: localStorage.getItem("cv-builder.content-templates.v1")
  }));
  assert(
    localData.draft === null && localData.legacyTemplates === null,
    "Clear local data was incomplete"
  );

  const leakedRequests = requests.filter((request) => JSON.stringify(request).includes(marker));
  assert(leakedRequests.length === 0, "Resume content was found in a network request");
  assert(
    requests.every(
      (request) => (request.method === "GET" || request.method === "HEAD") && !request.postData
    ),
    "The static editor made a request with a body or a mutating method"
  );
  assert(
    requests.every((request) => new URL(request.url).origin === siteOrigin),
    "The static editor requested a remote origin"
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        siteUrl,
        requests: requests.length,
        requestMethods: [...new Set(requests.map((request) => request.method))],
        requestOrigins: [...new Set(requests.map((request) => new URL(request.url).origin))],
        resumeContentRequests: leakedRequests.length,
        offlineReload: "passed",
        desktopWidth,
        mobileWidth,
        flow: [
          "create/import",
          "edit",
          "save locally",
          "reload",
          "export PDF",
          "inspect PDF",
          "export/import Markdown",
          "export/import JSON",
          "import plain text",
          "reset selected template",
          "clear local data"
        ]
      },
      null,
      2
    )}\n`
  );
} finally {
  await context.setOffline(false).catch(() => undefined);
  await context.close();
  await browser.close();
}

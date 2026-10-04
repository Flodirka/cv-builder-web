import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
if (existsSync(join(root, ".playwright-browsers"))) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(root, ".playwright-browsers");
}
const { chromium } = await import("playwright");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const output = join(root, "tmp", "static-layout-qa");
await mkdir(output, { recursive: true });
const url = process.env.CV_BUILDER_QA_URL ?? "http://localhost:4173/CV_Builder/";
const browser = await chromium.launch({
  headless: true,
  ignoreDefaultArgs: ["--hide-scrollbars"]
});
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1080 }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const requests = [];
context.on("request", (request) => requests.push(request.url()));
const download = async (name) => {
  const pending = page.waitForEvent("download", { timeout: 45000 });
  await page.getByRole("button", { name, exact: true }).click();
  const file = await pending;
  return readFile(await file.path());
};
const closeExport = () =>
  page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Close" })
    .click();
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const picker = page.getByLabel("Choose a template");
  const names = await picker.locator("option").allTextContents();
  assert.equal(names.length, 16, "Expected Custom plus fifteen templates");
  const results = [];
  for (const name of names.filter((name) => name !== "Custom")) {
    await picker.selectOption(name);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    if (name === "Minimal" || name === "Japan") {
      for (const height of [1260, 1280, 1300, 1320, 1340, 1360, 1380]) {
        await page.setViewportSize({ width: 1440, height });
        const samples = await page
          .getByRole("dialog", { name: "Export", exact: true })
          .evaluate(async (dialog) => {
            const sizes = [];
            for (let frame = 0; frame < 30; frame++) {
              await new Promise(requestAnimationFrame);
              sizes.push(`${dialog.clientWidth}:${dialog.clientHeight}:${dialog.scrollHeight}`);
            }
            return sizes.slice(10);
          });
        assert.equal(new Set(samples).size, 1, `Export preview keeps resizing at height ${height}`);
      }
      await page.setViewportSize({ width: 1440, height: 1080 });
    }
    const before = JSON.parse((await download("Export JSON backup")).toString());
    const md = await download("Export Markdown");
    const pdfBytes = await download("Download PDF");
    await page.getByText("PDF downloaded", { exact: true }).waitFor();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, "");
    await writeFile(join(output, `${slug}.pdf`), pdfBytes);
    const loading = getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: false });
    const pdf = await loading.promise;
    const pages = pdf.numPages;
    let allText = "";
    let images = 0;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const sheet = await pdf.getPage(number);
      assert(
        Math.abs(sheet.view[2] - 595.28) < 0.2 && Math.abs(sheet.view[3] - 841.89) < 0.2,
        "PDF is not A4"
      );
      allText += (await sheet.getTextContent()).items.map((item) => item.str ?? "").join(" ");
      const operators = await sheet.getOperatorList();
      images += operators.fnArray.filter(
        (op) => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject
      ).length;
    }
    assert(
      allText.includes(name === "Japan" ? "山田" : "Alex Doe"),
      `${name}: PDF lost selectable text`
    );
    const resume = before.resume ?? before;
    const leaves = (blocks) =>
      blocks.flatMap((block) =>
        block.type === "columns"
          ? block.columns.flatMap((column) => leaves(column.blocks))
          : [block]
      );
    const photos = leaves(resume.layoutBlocks).filter(
      (block) => block.type === "image" && block.visible
    ).length;
    assert.equal(
      images,
      photos,
      `${name}: icons or page content were rasterized, or photo is missing`
    );
    if (name === "Japan") {
      assert.equal(pages, 2, "Japan must export two pages");
      assert(allText.includes("免許") && allText.includes("学歴"), "Japanese PDF lost text");
    }
    await loading.destroy();
    await page.screenshot({ path: join(output, `${slug}-preview.png`), fullPage: true });
    await page
      .locator('[aria-label="PDF export preview"] article')
      .first()
      .screenshot({ path: join(output, `${slug}-a4.png`) });
    await closeExport();
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await page
      .locator("#resume-markdown-import")
      .setInputFiles({ name: `${slug}.md`, mimeType: "text/markdown", buffer: md });
    await page.getByText("No warnings.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Replace current document" }).click();
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const roundTrip = await download("Export Markdown");
    assert.equal(
      roundTrip.toString(),
      md.toString(),
      `${name}: Markdown round trip changed layout`
    );
    await closeExport();
    results.push({ name, photos, pages, markdownRoundTrip: true });
    console.log(`Layout verified: ${name}`);
  }
  await picker.selectOption("Two columns");
  await page.getByLabel("Heading icon").first().click();
  await page.getByLabel("Search icons").fill("briefcase");
  await page.getByRole("button", { name: "lucide:briefcase", exact: true }).click();
  assert.equal(
    await page.getByLabel("Heading icon").first().getAttribute("title"),
    "lucide:briefcase",
    "Icon picker failed"
  );
  await page.getByLabel("Heading icon").first().click();
  await page.keyboard.press("Escape");
  await page
    .locator('input[type="file"][accept*="image/png"]')
    .first()
    .setInputFiles({
      name: "invalid.png",
      mimeType: "image/png",
      buffer: Buffer.from("not a PNG")
    });
  await page
    .getByRole("alert")
    .filter({ hasText: /image|photo|decode/i })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(output, "two-column-mobile.png"), fullPage: true });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "Mobile page overflows"
  );
  assert.deepEqual(errors, [], "Browser runtime errors");
  assert(
    requests.every(
      (request) =>
        new URL(request).origin === new URL(url).origin ||
        request.startsWith("data:") ||
        request.startsWith("blob:")
    ),
    "Local icons or templates sent an external request"
  );
  await writeFile(
    join(output, "results.json"),
    JSON.stringify({ results, icons: 1664, mobile: true, errors }, null, 2)
  );
  console.log(
    "Layout QA passed: fifteen templates, Markdown, A4 text/vector PDFs, local icon search, invalid photo, mobile, no external requests."
  );
} finally {
  await browser.close();
}

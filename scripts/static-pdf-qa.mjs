import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const projectRoot = resolve(import.meta.dirname, "..");
const browserRoot = join(projectRoot, ".playwright-browsers");
if (existsSync(browserRoot)) process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;

const { chromium } = await import("playwright");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");

const siteUrl = process.env.CV_BUILDER_QA_URL ?? "http://localhost:4173/CV_Builder/";
const outputRoot = join(projectRoot, "tmp", "static-pdf-qa");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const englishMarkdown = `---
schema: cv-builder/v1
language: en
---

# Morgan Lee

Product Designer · morgan@example.com · [Portfolio](https://example.com/portfolio)

## Experience

### Senior Product Designer
**Subtitle:** Example Studio
**Start:** 2022
**End:** Present
**Location:** Remote
**Description:** Designs clear, accessible workflows.
- Shipped a fictional collaboration workspace.
- Improved onboarding through user research.
`;

const russianEntries = Array.from({ length: 14 }, (_, index) => {
  const number = index + 1;
  return `### Проект ${number}
**Subtitle:** Студия «Пример»
**Start:** 202${index % 5}
**End:** настоящее время
**Location:** Москва
**Description:** Проектирует понятные цифровые продукты и проверяет решения с пользователями.
- Начало маркера ${number}
- Подготовила спецификации, сценарии и критерии приемки для вымышленного продукта.
- Конец маркера ${number}`;
}).join("\n\n");

const russianMarkdown = `---
schema: cv-builder/v1
language: ru
---

# Мария Орлова

Продуктовый дизайнер · maria@example.com · [Портфолио](https://example.com/maria)

## Опыт

${russianEntries}
`;

const imageOperations = new Set(
  [
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
    OPS.paintSolidColorImageMask
  ].filter((value) => typeof value === "number")
);

const inspectPdf = async (bytes, expected) => {
  const document = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const pages = [];
  const urls = [];
  let hasRasterImages = false;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const [x1, y1, x2, y2] = page.view;
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    if (Math.abs(width - 595.28) > 1 || Math.abs(height - 841.89) > 1) {
      throw new Error(`Page ${pageNumber} is not A4: ${width} × ${height}`);
    }
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    if (!text.trim()) throw new Error(`Page ${pageNumber} has no extractable text`);
    pages.push(text);
    const annotations = await page.getAnnotations();
    urls.push(...annotations.map((annotation) => annotation.url).filter(Boolean));
    const operators = await page.getOperatorList();
    if (operators.fnArray.some((operation) => imageOperations.has(operation)))
      hasRasterImages = true;
  }

  const text = pages.join("\n");
  const comparableText = text.toLocaleLowerCase();
  const compact = (value) => value.toLocaleLowerCase().replace(/\s/gu, "");
  for (const token of expected.tokens) {
    if (!compact(comparableText).includes(compact(token))) {
      throw new Error(`Missing extracted token: ${token}\nExtracted text: ${text.slice(0, 1200)}`);
    }
  }
  for (const chrome of ["Save draft in browser", "Your resume is not uploaded", "Export PDF"]) {
    if (text.includes(chrome)) throw new Error(`Editor chrome leaked into PDF: ${chrome}`);
  }
  if (hasRasterImages) throw new Error("Raster page image found in browser PDF");
  if (!urls.includes(expected.url))
    throw new Error(`Missing safe link annotation: ${expected.url}`);
  if (expected.multiPage && pages.length < 2) throw new Error("Long fixture did not paginate");

  for (const marker of expected.entryMarkers ?? []) {
    const owner = pages.findIndex((page) => compact(page).includes(compact(marker.start)));
    if (owner === -1 || !compact(pages[owner]).includes(compact(marker.end))) {
      throw new Error(`Entry split or marker missing: ${marker.start}`);
    }
  }

  await document.cleanup?.();
  return { pages: pages.length, characters: text.length, urls: urls.length, hasRasterImages };
};

const browser = await chromium.launch({ headless: true });
const results = [];

try {
  for (const fixture of [
    {
      id: "en",
      markdown: englishMarkdown,
      tokens: ["Morgan Lee", "Senior Product Designer"],
      url: "https://example.com/portfolio",
      multiPage: false,
      entryMarkers: []
    },
    {
      id: "ru",
      markdown: russianMarkdown,
      tokens: ["Мария Орлова", "Проект 14"],
      url: "https://example.com/maria",
      multiPage: true,
      entryMarkers: Array.from({ length: 14 }, (_, index) => ({
        start: `Начало маркера ${index + 1}`,
        end: `Конец маркера ${index + 1}`
      }))
    }
  ]) {
    const page = await browser.newPage();
    await page.goto(siteUrl, { waitUntil: "load" });
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Import" }).click();
    await page.locator("#resume-markdown-import").setInputFiles({
      name: `${fixture.id}.md`,
      mimeType: "text/markdown",
      buffer: Buffer.from(fixture.markdown)
    });
    await page.getByRole("button", { name: "Replace current document" }).click();
    const path = join(outputRoot, `a4-${fixture.id}.pdf`);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    await download.saveAs(path);
    const pdf = await readFile(path);
    results.push({
      language: fixture.id,
      path,
      ...(await inspectPdf(pdf, fixture))
    });
    await page.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);

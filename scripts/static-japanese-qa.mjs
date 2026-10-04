import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright-browsers");
const { chromium } = await import("playwright");
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const output = resolve("tmp/japanese-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1080 }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const download = async (name) => {
  const pending = page.waitForEvent("download", { timeout: 45000 });
  await page.getByRole("button", { name, exact: true }).click();
  return readFile(await (await pending).path());
};
try {
  await page.goto(process.env.CV_BUILDER_QA_URL ?? "http://127.0.0.1:28671/");
  await page.getByLabel("Choose a template").selectOption("Japan");
  const editor = page.getByLabel("Editable A4 resume page");
  const table = editor.locator("table").first();
  await table.getByRole("textbox", { name: "Row 2, column 2", exact: true }).fill("山田 花子");
  const tableBlock = table.locator('xpath=ancestor::div[contains(@class,"editBlock")][1]');
  const rows = await table.locator("tr").count();
  await tableBlock.getByRole("button", { name: "Add row", exact: true }).click();
  assert.equal(await table.locator("tr").count(), rows + 1);
  await table.getByRole("textbox", { name: `Row ${rows + 1}, column 1`, exact: true }).fill("補足");
  await table
    .getByRole("textbox", { name: `Row ${rows + 1}, column 2`, exact: true })
    .fill("架空の例 | 二行目\n編集済み");
  await tableBlock.getByLabel("Block actions and drag handle").first().click();
  await page
    .getByRole("menu", { name: "Actions for table", exact: true })
    .getByRole("group", { name: "Text alignment" })
    .getByRole("button", { name: "Left", exact: true })
    .click();
  await page.getByRole("button", { name: "Help and privacy", exact: true }).click();
  const help = page.getByRole("dialog", { name: "Help and privacy" });
  await help.getByText("Japan", { exact: true }).click();
  assert((await help.textContent()).includes("Sex is optional"));
  assert((await help.textContent()).includes("Writing your resume"));
  await help.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const markdown = await download("Export Markdown");
  assert(markdown.toString().includes("language: ja"));
  assert(markdown.toString().includes("山田 花子"));
  const bytes = await download("Download PDF");
  await writeFile(resolve(output, "edited-japan.pdf"), bytes);
  const loading = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    standardFontDataUrl: resolve("node_modules/pdfjs-dist/standard_fonts") + "/"
  });
  const pdf = await loading.promise;
  assert.equal(pdf.numPages, 2);
  const texts = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const sheet = await pdf.getPage(number);
    const content = await sheet.getTextContent();
    const text = content.items.map((item) => item.str ?? "").join(" ");
    texts.push(text);
    for (const item of content.items)
      if (item.transform && item.width) {
        assert(
          item.transform[4] >= 25 && item.transform[4] + item.width <= 575,
          "Japanese text exceeds A4 margins"
        );
      }
  }
  assert(texts[0].includes("花子") && texts[0].includes("学歴"));
  assert(!texts[0].includes("本人希望"));
  assert(texts[1].includes("免許") && texts[1].includes("本人希望"));
  await loading.destroy();
  await page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Close" })
    .click();
  await page.getByRole("button", { name: "Save draft in browser", exact: true }).click();
  await page.reload();
  assert.equal(
    await editor
      .locator("table")
      .first()
      .getByRole("textbox", { name: "Row 2, column 2", exact: true })
      .inputValue(),
    "山田 花子"
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    "Japanese editor overflows mobile viewport"
  );
  await page.screenshot({ path: resolve(output, "japan-mobile.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Japanese QA passed: table editing, adding rows, alignment, guidance, two-page selectable PDF, margins, draft and mobile."
  );
} finally {
  await browser.close();
}

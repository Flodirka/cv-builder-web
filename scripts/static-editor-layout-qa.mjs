import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright-browsers");
const { chromium } = await import("playwright");
const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  acceptDownloads: true,
  viewport: { width: 1440, height: 1080 }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const editor = page.getByLabel("Editable A4 resume page");
const column = (number) => editor.locator(`[aria-label="Column ${number}"]`).first();
const frame = (input) => input.locator('xpath=ancestor::div[contains(@class,"editBlock")][1]');
const actions = async (block, name) => {
  await block.getByLabel("Block actions and drag handle").first().click();
  return page.getByRole("menu", { name: `Actions for ${name}`, exact: true });
};
const add = async (button, name) => {
  await button.click();
  await page.getByRole("menu").getByRole("button", { name, exact: true }).click();
};
const download = async (name) => {
  const pending = page.waitForEvent("download", { timeout: 45000 });
  await page.getByRole("button", { name, exact: true }).click();
  return readFile(await (await pending).path());
};
const inputWithText = async (scope, text) => {
  const inputs = scope.getByPlaceholder("Paragraph text");
  for (let index = 0; index < (await inputs.count()); index += 1)
    if ((await inputs.nth(index).inputValue()) === text) return inputs.nth(index);
  throw new Error("Missing paragraph: " + text);
};
const closeExport = () =>
  page
    .getByRole("dialog", { name: "Export", exact: true })
    .getByRole("button", { name: "Close" })
    .click();
try {
  await page.goto(process.env.CV_BUILDER_QA_URL ?? "http://localhost:4173/CV_Builder/");
  await add(page.getByRole("button", { name: "Add block", exact: true }), "Columns");
  const container = editor.locator('[class*="editBlock"]').first();
  let menu = await actions(container, "columns");
  await menu
    .getByRole("group", { name: "Number of columns" })
    .getByRole("button", { name: "3", exact: true })
    .click();
  for (const number of [1, 2, 3]) {
    await add(column(number).getByRole("button", { name: `Add to column ${number}` }), "Text");
    await column(number).getByPlaceholder("Paragraph text").fill(`Marker ${number}`);
  }
  menu = await actions(container, "columns");
  assert(
    await menu
      .getByRole("group", { name: "Number of columns" })
      .getByRole("button", { name: "2", exact: true })
      .isDisabled(),
    "Reducing columns could lose content"
  );
  await menu
    .getByRole("group", { name: "Number of columns" })
    .getByRole("button", { name: "3", exact: true })
    .click();
  await add(page.getByRole("button", { name: "Add block", exact: true }), "Text");
  const outside = editor.getByPlaceholder("Paragraph text").last();
  await outside.fill("Outside marker");
  await frame(outside)
    .getByLabel("Block actions and drag handle")
    .dragTo(column(1), { targetPosition: { x: 30, y: 20 } });
  assert.equal(
    await column(1).getByPlaceholder("Paragraph text").count(),
    2,
    "Root-to-column drag failed"
  );
  const moved = await inputWithText(column(1), "Outside marker");
  menu = await actions(frame(moved), "paragraph");
  await menu.getByRole("button", { name: "Next column" }).click();
  assert.equal(
    await column(2).getByPlaceholder("Paragraph text").count(),
    2,
    "Moving between columns failed"
  );
  const outsideFrame = frame(await inputWithText(column(2), "Outside marker"));
  menu = await actions(outsideFrame, "paragraph");
  await menu.getByRole("button", { name: "Main", exact: true }).click();
  assert.equal(
    await column(2).getByPlaceholder("Paragraph text").count(),
    1,
    "Moving out of columns failed"
  );
  const firstText = column(1).getByPlaceholder("Paragraph text");
  menu = await actions(frame(firstText), "paragraph");
  await menu
    .getByRole("group", { name: "Text alignment" })
    .getByRole("button", { name: "Left", exact: true })
    .click();
  assert.equal(await firstText.evaluate((element) => getComputedStyle(element).textAlign), "left");
  await add(page.getByRole("button", { name: "Add block", exact: true }), "Section heading");
  const heading = editor.getByPlaceholder("Heading text").last();
  await heading.fill("Section marker");
  const icon = frame(heading).getByLabel("Heading icon");
  await icon.click();
  await page.getByRole("tab", { name: "Work & study", exact: true }).click();
  await page.getByLabel("Search icons").fill("briefcase");
  await page.getByRole("button", { name: "lucide:briefcase", exact: true }).click();
  assert.equal(await icon.getAttribute("title"), "lucide:briefcase");
  const iconRect = await icon.boundingBox();
  const inputRect = await heading.boundingBox();
  assert(
    iconRect.x < inputRect.x && inputRect.x - iconRect.x < 30,
    "Icon is not beside the heading"
  );
  await icon.click();
  await page.getByLabel("Search icons").fill("");
  await page.getByRole("tab", { name: "All", exact: true }).click();
  await page.getByRole("tab", { name: "All", exact: true }).press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "Work & study", exact: true })
      .getAttribute("aria-selected"),
    "true"
  );
  await page.keyboard.press("Escape");
  menu = await actions(frame(heading), "heading");
  await menu
    .getByRole("group", { name: "Text alignment" })
    .getByRole("button", { name: "Center", exact: true })
    .click();
  assert.equal(
    await heading
      .locator("..")
      .locator("..")
      .evaluate((element) => getComputedStyle(element).justifyContent),
    "center"
  );
  await page.getByRole("button", { name: "Save draft in browser", exact: true }).click();
  await page.reload();
  assert.equal(
    await editor.locator('section[aria-label^="Column "]').count(),
    3,
    "Draft lost columns"
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const markdown = await download("Export Markdown");
  assert(
    markdown.toString().includes("::: columns{zone=main}") &&
      markdown.toString().includes("align=center")
  );
  const pdfBytes = await download("Download PDF");
  await page.getByText("PDF downloaded", { exact: true }).waitFor();
  await mkdir("tmp/static-layout-qa", { recursive: true });
  await writeFile("tmp/static-layout-qa/custom-columns.pdf", pdfBytes);
  const task = getDocument({ data: new Uint8Array(pdfBytes) });
  const pdf = await task.promise;
  const items = (await (await pdf.getPage(1)).getTextContent()).items;
  const operations = await (await pdf.getPage(1)).getOperatorList();
  assert(
    !operations.fnArray.some(
      (operation, index) =>
        operation === OPS.constructPath && operations.argsArray[index][0] === OPS.fillStroke
    ),
    "Lucide outline icon was filled in the PDF"
  );
  const positions = [1, 2, 3].map(
    (number) => items.find((item) => item.str === `Marker ${number}`)?.transform[4]
  );
  assert(
    positions.every((value) => typeof value === "number"),
    "PDF lost column content"
  );
  assert(
    positions[0] < positions[1] &&
      positions[1] < positions[2] &&
      Math.abs(positions[1] - positions[0] - (positions[2] - positions[1])) < 1,
    "PDF columns are not equal"
  );
  await task.destroy();
  await page
    .locator('[aria-label="PDF export preview"] figure')
    .first()
    .screenshot({ path: "tmp/static-layout-qa/custom-columns-a4.png" });
  await closeExport();
  await add(column(3).getByRole("button", { name: "Add to column 3" }), "Entry");
  const entryTitle = column(3).getByPlaceholder("Entry title");
  await entryTitle.fill("Senior engineer");
  assert(
    (await entryTitle.boundingBox()).width > 140,
    "Entry title is squeezed by date fields in a narrow column"
  );
  await add(column(2).getByRole("button", { name: "Add to column 2" }), "Columns");
  assert.equal(
    await editor.locator('section[aria-label^="Column "]').count(),
    5,
    "Nested columns are unavailable"
  );
  for (const number of [1, 2]) {
    const nested = column(2).locator(`section[aria-label="Column ${number}"]`);
    await add(nested.getByRole("button", { name: `Add to column ${number}` }), "Text");
    await nested.getByPlaceholder("Paragraph text").fill(`Nested marker ${number}`);
  }
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const nestedMarkdown = (await download("Export Markdown")).toString();
  assert.equal(nestedMarkdown.match(/::: columns\{/g)?.length, 2, "Markdown lost nesting");
  const nestedPdf = getDocument({ data: new Uint8Array(await download("Download PDF")) });
  const nestedItems = (await (await (await nestedPdf.promise).getPage(1)).getTextContent()).items;
  for (const marker of ["Nested marker 1", "Nested marker 2", "SENIOR ENGINEER"])
    assert(
      nestedItems.some((item) => item.str === marker),
      `Nested PDF lost ${marker}`
    );
  await nestedPdf.destroy();
  await closeExport();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    (await editor.boundingBox()).width <= 390,
    "Mobile editor keeps a desktop-width paper surface"
  );
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    "Mobile controls overflow"
  );
  await page.screenshot({ path: "tmp/static-layout-qa/custom-columns-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "Editor layout QA passed: Custom, 2/3 and nested columns, drag/move, safe reduction, draft, icon categories, alignment menu, Markdown, equal PDF columns, mobile."
  );
} catch (error) {
  await mkdir("tmp/static-layout-qa", { recursive: true });
  await page.screenshot({ path: "tmp/static-layout-qa/editor-failure.png", fullPage: true });
  throw error;
} finally {
  await browser.close();
}

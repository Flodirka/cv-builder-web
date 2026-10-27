import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  builtInContentTemplates,
  createResumeFromContentTemplate,
  exportResumeMarkdown,
  importResumeMarkdown
} from "../src";

const directory = new URL("../../../public/templates/", import.meta.url);
const filenames = builtInContentTemplates.map(
  (template) =>
    `${template.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, "")}.md`
);

describe("downloadable Markdown templates", () => {
  it("keeps every file in sync with the editor template and imports without warnings", async () => {
    if (process.env.UPDATE_MARKDOWN_TEMPLATES === "1") await mkdir(directory, { recursive: true });
    for (const [index, template] of builtInContentTemplates.entries()) {
      const markdown = exportResumeMarkdown(createResumeFromContentTemplate(template));
      const file = new URL(filenames[index], directory);
      if (process.env.UPDATE_MARKDOWN_TEMPLATES === "1") await writeFile(file, markdown);
      expect((await readFile(file, "utf8")).replaceAll("\r\n", "\n")).toBe(markdown);
      const parsed = importResumeMarkdown(markdown);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.preview.warnings).toEqual([]);
    }
    expect((await readdir(directory)).sort()).toEqual([...filenames].sort());
  });
});

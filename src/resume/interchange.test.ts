import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportResumeJson,
  exportResumeMarkdown,
  importResumeJson,
  importResumeMarkdown,
  importResumePlainText,
  resumeSchema,
  type Resume,
  type ResumeBlock
} from "@/resume";

describe("plain-text import", () => {
  it("uses the first non-empty line as H1 and blank-line paragraphs as main text", () => {
    const result = importResumePlainText(
      "\nИрина Тестова\n\nОпыт разработки\nв продуктах.\n\nМосква"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.preview.language).toBe("ru");
    expect(result.preview.resume.person.fullName).toBe("Ирина Тестова");
    expect(result.preview.resume.layoutBlocks).toMatchObject([
      { type: "heading", level: 1, zone: "header", text: "Ирина Тестова" },
      { type: "paragraph", zone: "main", text: "Опыт разработки в продуктах." },
      { type: "paragraph", zone: "main", text: "Москва" }
    ]);
    expect(result.preview.warnings[0]?.code).toBe("plain-text-structure");
  });

  it("rejects an empty file", () => {
    expect(importResumePlainText(" \n ")).toEqual({
      ok: false,
      error: "Plain-text file is empty."
    });
  });
});

const fixture = (language: Resume["language"], cyrillic = false): Resume =>
  resumeSchema.parse({
    language,
    person: {
      fullName: cyrillic ? "Мария Орлова" : "Morgan Lee",
      headline: cyrillic ? "Продуктовый дизайнер" : "Product Designer",
      email: "morgan@example.com",
      phone: "+1 555 0100",
      location: cyrillic ? "Москва" : "London",
      links: [{ label: "Portfolio", url: "https://example.com/portfolio" }]
    },
    summary: cyrillic ? "Проектирует понятные продукты." : "Designs clear products.",
    experience: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    certificates: [],
    customSections: [],
    layoutBlocks: [
      {
        id: "name-internal",
        type: "heading",
        zone: "header",
        level: 1,
        text: cyrillic ? "Мария Орлова" : "Morgan Lee",
        visible: true
      },
      {
        id: "contact-internal",
        type: "paragraph",
        zone: "header",
        text: "Portfolio · morgan@example.com",
        textLinks: [{ label: "Portfolio", url: "https://example.com/portfolio" }],
        visible: true
      },
      {
        id: "section-internal",
        type: "heading",
        zone: "main",
        level: 2,
        text: cyrillic ? "Опыт" : "Experience",
        visible: true
      },
      {
        id: "entry-internal",
        type: "entry",
        zone: "main",
        visible: true,
        entry: {
          title: cyrillic ? "Ведущий дизайнер" : "Lead Designer",
          subtitle: cyrillic ? "Студия Пример" : "Example Studio",
          start: "2021",
          end: cyrillic ? "по настоящее время" : "Present",
          location: cyrillic ? "Удаленно" : "Remote",
          description: cyrillic ? "Вела продуктовую стратегию." : "Led product strategy.",
          bullets: [
            cyrillic ? "Запустила новую платформу." : "Shipped a new platform.",
            cyrillic ? "Улучшила ключевой сценарий." : "Improved the core journey."
          ],
          links: [
            { label: cyrillic ? "Кейс" : "Case study", url: "https://example.com/case" },
            { label: "GitHub", url: "https://github.com/example" }
          ]
        }
      },
      {
        id: "skills-heading",
        type: "heading",
        zone: "main",
        level: 3,
        text: cyrillic ? "Инструменты" : "Tools",
        visible: true
      },
      {
        id: "skills",
        type: "labeled_text",
        zone: "main",
        label: cyrillic ? "Навыки" : "Skills",
        text: "Figma, Research",
        visible: true
      },
      {
        id: "list",
        type: "bullet_list",
        zone: "main",
        items: [cyrillic ? "Русский" : "English", "Deutsch"],
        visible: true
      },
      { id: "divider", type: "divider", zone: "main", visible: true },
      {
        id: "hidden-internal",
        type: "paragraph",
        zone: "main",
        text: "SECRET HIDDEN CONTENT",
        visible: false
      }
    ]
  });

const semanticBlocks = (blocks: ResumeBlock[]) =>
  blocks
    .filter((block) => block.visible && block.type !== "spacer")
    .map((block) => Object.fromEntries(Object.entries(block).filter(([key]) => key !== "id")));

describe("resume Markdown interchange", () => {
  it.each([
    ["EN", fixture("en")],
    ["RU", fixture("ru", true)]
  ])("round-trips %s Markdown through blocks", (_label, original) => {
    const firstMarkdown = exportResumeMarkdown(original);
    const firstImport = importResumeMarkdown(firstMarkdown);
    expect(firstImport.ok).toBe(true);
    if (!firstImport.ok) return;

    const secondMarkdown = exportResumeMarkdown(firstImport.preview.resume);
    const secondImport = importResumeMarkdown(secondMarkdown);
    expect(secondImport.ok).toBe(true);
    if (!secondImport.ok) return;

    expect(semanticBlocks(secondImport.preview.resume.layoutBlocks)).toEqual(
      semanticBlocks(firstImport.preview.resume.layoutBlocks)
    );
    expect(secondImport.preview.language).toBe(original.language);
  });

  it.each([
    ["EN", "cv-example-en.md", "en"],
    ["RU", "cv-example-ru.md", "ru"]
  ])("imports the fictional %s Markdown example without warnings", (_label, fileName, language) => {
    const markdown = readFileSync(resolve("public", "examples", fileName), "utf8");
    const imported = importResumeMarkdown(markdown);

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.preview.language).toBe(language);
    expect(imported.preview.warnings).toEqual([]);
    expect(imported.preview.resume.layoutBlocks.some((block) => block.type === "entry")).toBe(true);
  });

  it("exports every entry field and safe links", () => {
    const original = fixture("en");
    const originalEntry = original.layoutBlocks.find(
      (block): block is Extract<ResumeBlock, { type: "entry" }> => block.type === "entry"
    );
    const markdown = exportResumeMarkdown(original);
    const imported = importResumeMarkdown(markdown);

    expect(markdown).toContain("**Subtitle:** Example Studio");
    expect(markdown).toContain("**Start:** 2021");
    expect(markdown).toContain("**End:** Present");
    expect(markdown).toContain("**Location:** Remote");
    expect(markdown).toContain("**Description:** Led product strategy.");
    expect(markdown).toContain("**Link:** [Case study](https://example.com/case)");
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(originalEntry).toBeDefined();
    expect(imported.preview.resume.layoutBlocks[3]).toMatchObject({
      type: "entry",
      entry: originalEntry?.entry
    });
  });

  it("omits hidden blocks and internal IDs from Markdown", () => {
    const markdown = exportResumeMarkdown(fixture("en"));

    expect(markdown).not.toContain("SECRET HIDDEN CONTENT");
    expect(markdown).not.toContain("hidden-internal");
    expect(markdown).not.toContain("entry-internal");
  });

  it("escapes structural Markdown characters in visible text", () => {
    const original = fixture("en");
    original.layoutBlocks.push({
      id: "structural-text",
      type: "paragraph",
      zone: "main",
      text: "# not a heading; - not a list; name_with_underscores",
      visible: true
    });

    const imported = importResumeMarkdown(exportResumeMarkdown(original));

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.preview.warnings).toEqual([]);
    expect(imported.preview.resume.layoutBlocks.at(-1)).toMatchObject({
      type: "paragraph",
      text: "# not a heading; - not a list; name_with_underscores"
    });
  });

  it("regenerates IDs and assigns zones around the first H2", () => {
    const imported = importResumeMarkdown("# Name\n\nIntro\n\n## Experience\n\nText\n");
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.preview.resume.layoutBlocks.map((block) => block.zone)).toEqual([
      "header",
      "header",
      "main",
      "main"
    ]);
    expect(imported.preview.resume.layoutBlocks.map((block) => block.id)).not.toContain("Name");
  });

  it("reports unsupported Markdown and raw HTML without executing it", () => {
    const imported = importResumeMarkdown(
      "# Name\n\n> quoted text\n\n<script>alert('no')</script>\n"
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.preview.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["unsupported-markdown", "raw-html"])
    );
    expect(imported.preview.resume.layoutBlocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "paragraph", text: "<script>alert('no')</script>" })
      ])
    );
  });

  it("rejects empty and invalid-frontmatter Markdown", () => {
    expect(importResumeMarkdown(" ")).toEqual({ ok: false, error: "Markdown file is empty." });
    expect(importResumeMarkdown("---\nlanguage: en\n---\n# Name")).toEqual({
      ok: false,
      error: 'Markdown frontmatter must contain "schema: cv-builder/v1".'
    });
  });
});

describe("resume JSON backup interchange", () => {
  it("round-trips the validated Resume losslessly, including hidden blocks", () => {
    const original = fixture("ru", true);
    const imported = importResumeJson(exportResumeJson(original));

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.preview.resume).toEqual(original);
    expect(imported.preview.resume.layoutBlocks.at(-1)).toMatchObject({
      id: "hidden-internal",
      visible: false,
      text: "SECRET HIDDEN CONTENT"
    });
  });

  it("rejects invalid JSON and invalid Resume data", () => {
    expect(importResumeJson("{bad json")).toEqual({
      ok: false,
      error: "JSON file is not valid JSON."
    });
    const invalidResume = importResumeJson('{"language":"en","person":{"links":[]}}');
    expect(invalidResume.ok).toBe(false);
    if (!invalidResume.ok) expect(invalidResume.error).toContain("person.fullName");
  });

  it("does not mutate the current document when input is invalid", () => {
    const current = fixture("en");
    const snapshot = structuredClone(current);

    const jsonResult = importResumeJson("not-json");
    const markdownResult = importResumeMarkdown(" ");

    expect(jsonResult.ok).toBe(false);
    expect(markdownResult.ok).toBe(false);
    expect(current).toEqual(snapshot);
  });
});

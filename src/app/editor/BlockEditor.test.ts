import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resumeBlockSchema, resumeSchema, type ResumeBlock } from "@/resume";
import {
  addBlockKindsForZone,
  BlockEditor,
  cleanBlocks,
  classicCompactEditorZones,
  createClassicCompactSampleBlocks,
  createEditorResume,
  createManualBlock,
  deleteBlockWithUndo,
  findMoveTarget,
  getAutoResizeTextareaHeight,
  getClassicCompactPageCount,
  hasClassicCompactEditorContent,
  insertBlockAfter,
  moveToIndexWithinZone,
  moveWithinZone,
  restoreDeletedBlock,
  updateEditorResume
} from "./BlockEditor";

const blocks: ResumeBlock[] = [
  {
    id: "h1",
    type: "heading",
    zone: "header",
    level: 1,
    text: "Alex Doe",
    visible: true
  },
  {
    id: "p1",
    type: "paragraph",
    zone: "header",
    text: "Senior Game Designer",
    visible: true
  },
  {
    id: "h2",
    type: "heading",
    zone: "main",
    level: 2,
    text: "Experience",
    visible: true
  },
  {
    id: "b1",
    type: "bullet_list",
    zone: "main",
    items: ["First", "Second"],
    visible: true
  },
  {
    id: "f1",
    type: "paragraph",
    zone: "footer",
    text: "Footer",
    visible: true
  }
];

describe("BlockEditor helpers", () => {
  it("creates valid manual resume blocks", () => {
    const manualBlocks = [
      createManualBlock("heading", "header", "manual-heading"),
      createManualBlock("paragraph", "main", "manual-paragraph"),
      createManualBlock("labeled_text", "main", "manual-label"),
      createManualBlock("bullet_list", "main", "manual-bullets"),
      createManualBlock("entry", "main", "manual-entry"),
      createManualBlock("divider", "footer", "manual-divider")
    ];

    for (const block of manualBlocks) {
      expect(resumeBlockSchema.safeParse(block).success).toBe(true);
    }
  });

  it("moves blocks only within their existing zone", () => {
    expect(findMoveTarget(blocks, 2, "up")).toBe(-1);
    expect(findMoveTarget(blocks, 3, "up")).toBe(2);
    expect(findMoveTarget(blocks, 3, "down")).toBe(-1);

    expect(moveWithinZone(blocks, 2, "up").map((block) => block.id)).toEqual([
      "h1",
      "p1",
      "h2",
      "b1",
      "f1"
    ]);
    expect(moveWithinZone(blocks, 3, "up").map((block) => block.id)).toEqual([
      "h1",
      "p1",
      "b1",
      "h2",
      "f1"
    ]);
    expect(moveWithinZone(blocks, 3, "up").map((block) => block.zone)).toEqual([
      "header",
      "header",
      "main",
      "main",
      "footer"
    ]);
  });

  it("drag-moves blocks only inside their existing zone", () => {
    expect(moveToIndexWithinZone(blocks, 3, 2).map((block) => block.id)).toEqual([
      "h1",
      "p1",
      "b1",
      "h2",
      "f1"
    ]);
    expect(moveToIndexWithinZone(blocks, 3, 0)).toBe(blocks);
  });

  it("exposes only header and main zones in the classic-compact editor", () => {
    expect(classicCompactEditorZones).toEqual(["header", "main"]);
  });

  it("estimates A4 page count from classic-compact content height", () => {
    expect(getClassicCompactPageCount(0)).toBe(1);
    expect(getClassicCompactPageCount(1043)).toBe(1);
    expect(getClassicCompactPageCount(1044)).toBe(2);
    expect(getClassicCompactPageCount(2086)).toBe(2);
  });

  it("renders long bullet content in wrapping textareas", () => {
    const longBullet = "A long bullet that must remain fully visible in the editor preview.";
    const html = renderToStaticMarkup(
      createElement(BlockEditor, {
        initialPersonName: "Editor QA",
        initialBlocks: [
          {
            id: "long-bullet",
            type: "bullet_list",
            zone: "main",
            items: [longBullet],
            visible: true
          }
        ]
      })
    );

    expect(html).toContain(`<textarea`);
    expect(html).toContain(`${longBullet}</textarea>`);
  });

  it("does not reserve a fixed character count for labeled-text inputs", () => {
    const html = renderToStaticMarkup(
      createElement(BlockEditor, {
        initialPersonName: "Editor QA",
        initialBlocks: [
          {
            id: "game-design",
            type: "labeled_text",
            zone: "main",
            label: "Game design",
            text: "Economy & balance",
            visible: true
          }
        ]
      })
    );

    expect(html).toContain('placeholder="Label" value="Game design"');
    expect(html).not.toContain('size="11"');
  });

  it("sizes entry date inputs to their content instead of stretching the date range", () => {
    const html = renderToStaticMarkup(
      createElement(BlockEditor, {
        initialPersonName: "Editor QA",
        initialBlocks: [
          {
            id: "experience-entry",
            type: "entry",
            zone: "main",
            entry: {
              title: "Senior Game Designer",
              subtitle: "Example Studio",
              start: "05/2025",
              end: "12/2025",
              bullets: []
            },
            visible: true
          }
        ]
      })
    );

    expect(html).toContain('size="7" placeholder="Start" value="05/2025"');
    expect(html).toContain('size="7" placeholder="End" value="12/2025"');
  });

  it("includes textarea borders when calculating auto-resize height", () => {
    expect(getAutoResizeTextareaHeight(43, 2)).toBe(45);
    expect(getAutoResizeTextareaHeight(22, -1)).toBe(22);
  });

  it("treats a page with header-only blocks as non-empty", () => {
    expect(hasClassicCompactEditorContent([])).toBe(false);
    expect(hasClassicCompactEditorContent([blocks[0]])).toBe(true);
    expect(hasClassicCompactEditorContent([blocks[4]])).toBe(false);
  });

  it("offers only zone-compatible block kinds", () => {
    expect(addBlockKindsForZone("header").map((kind) => kind.id)).toEqual([
      "headline",
      "header_text"
    ]);
    expect(addBlockKindsForZone("main").map((kind) => kind.id)).toEqual([
      "section_heading",
      "text",
      "labeled_text",
      "bullet_list",
      "entry",
      "divider"
    ]);
  });

  it("restores a deleted block at its previous index", () => {
    const deletion = deleteBlockWithUndo(blocks, "h2");

    expect(deletion.blocks.map((block) => block.id)).toEqual(["h1", "p1", "b1", "f1"]);
    expect(deletion.deleted).toMatchObject({ index: 2, block: { id: "h2" } });
    expect(
      deletion.deleted
        ? restoreDeletedBlock(deletion.blocks, deletion.deleted).map((block) => block.id)
        : []
    ).toEqual(["h1", "p1", "h2", "b1", "f1"]);
  });

  it("inserts new blocks after the selected block or at the end of the target zone", () => {
    const insertedAfterHeader = insertBlockAfter(
      blocks,
      createManualBlock("paragraph", "header", "manual-header"),
      0
    );
    const insertedInMain = insertBlockAfter(
      blocks,
      createManualBlock("entry", "main", "manual-main")
    );

    expect(insertedAfterHeader.map((block) => block.id)).toEqual([
      "h1",
      "manual-header",
      "p1",
      "h2",
      "b1",
      "f1"
    ]);
    expect(insertedAfterHeader.map((block) => block.zone)).toEqual([
      "header",
      "header",
      "header",
      "main",
      "main",
      "footer"
    ]);

    expect(insertedInMain.map((block) => block.id)).toEqual([
      "h1",
      "p1",
      "h2",
      "b1",
      "manual-main",
      "f1"
    ]);
  });

  it("cleans empty bullet strings without creating invalid empty bullet lists", () => {
    const [cleaned] = cleanBlocks([
      {
        id: "b1",
        type: "bullet_list",
        zone: "main",
        items: [" First ", "", " Second "],
        visible: true
      }
    ]);

    expect(cleaned).toEqual({
      id: "b1",
      type: "bullet_list",
      zone: "main",
      items: ["First", "Second"],
      visible: true
    });

    expect(
      cleanBlocks([
        {
          id: "b2",
          type: "bullet_list",
          zone: "main",
          items: [" ", ""],
          visible: true
        }
      ])
    ).toEqual([]);
  });

  it("keeps entry right-side metadata when cleaning blocks", () => {
    const [cleaned] = cleanBlocks([
      {
        id: "e1",
        type: "entry",
        zone: "main",
        visible: true,
        entry: {
          title: " Entry title ",
          subtitle: " Subtitle ",
          location: " Remote ",
          start: " 2021 ",
          end: " Present ",
          bullets: [" First ", ""]
        }
      }
    ]);

    expect(cleaned).toMatchObject({
      type: "entry",
      entry: {
        title: "Entry title",
        subtitle: "Subtitle",
        location: "Remote",
        start: "2021",
        end: "Present",
        bullets: ["First"]
      }
    });
  });

  it("builds a renderable resume payload from edited blocks", () => {
    const resume = createEditorResume("  Alex Doe  ", blocks);

    expect(resume.person.fullName).toBe("Alex Doe");
    expect(resume.layoutBlocks).toHaveLength(blocks.length);
    expect(resume.layoutBlocks[0]).toMatchObject({ type: "heading", zone: "header" });
    expect(resumeSchema.safeParse(resume).success).toBe(true);
  });

  it("builds valid resume payloads from an empty start and manual blocks", () => {
    const emptyResume = createEditorResume("", []);
    const manualResume = createEditorResume("Manual CV", [
      createManualBlock("heading", "header", "manual-heading"),
      createManualBlock("paragraph", "main", "manual-paragraph"),
      createManualBlock("labeled_text", "main", "manual-label"),
      createManualBlock("bullet_list", "main", "manual-bullets"),
      createManualBlock("entry", "main", "manual-entry"),
      createManualBlock("divider", "footer", "manual-divider")
    ]);

    expect(resumeSchema.safeParse(emptyResume).success).toBe(true);
    expect(resumeSchema.safeParse(manualResume).success).toBe(true);
  });

  it("auto-detects document language from content instead of a manual choice", () => {
    const englishDocument = createEditorResume("Alex Doe", blocks);
    const russianDocument = createEditorResume("Мария Орлова", blocks);

    expect(englishDocument.language).toBe("en");
    expect(russianDocument.language).toBe("ru");
    expect(russianDocument.layoutBlocks).toEqual(blocks);
  });

  it("keeps imported Resume metadata while editing its blocks", () => {
    const base = resumeSchema.parse({
      language: "ru",
      person: {
        fullName: "Мария Орлова",
        headline: "Продуктовый дизайнер",
        email: "maria@example.com",
        links: [{ label: "Портфолио", url: "https://example.com" }]
      },
      experience: [],
      education: [],
      projects: [],
      skills: [],
      languages: [],
      certificates: [],
      customSections: [],
      layoutBlocks: blocks
    });

    const updated = updateEditorResume(base, "Мария Орлова", blocks.slice(0, 3));

    expect(updated.language).toBe("ru");
    expect(updated.person).toEqual(base.person);
    expect(updated.layoutBlocks).toEqual(blocks.slice(0, 3));
  });

  it("creates a valid classic-compact sample payload for local browser QA", () => {
    const sampleBlocks = createClassicCompactSampleBlocks();
    const resume = createEditorResume("Alex Doe", sampleBlocks);

    expect(sampleBlocks.length).toBeGreaterThan(0);
    expect(sampleBlocks.some((block) => block.zone === "header")).toBe(true);
    expect(sampleBlocks.some((block) => block.zone === "main")).toBe(true);
    expect(resumeSchema.safeParse(resume).success).toBe(true);
  });

  it("renders the local ATS summary and issues beside the corresponding blocks", () => {
    const html = renderToStaticMarkup(
      createElement(BlockEditor, {
        initialPersonName: "ATS QA",
        initialBlocks: [
          {
            id: "invalid-name",
            type: "heading",
            zone: "header",
            level: 1,
            text: "12345",
            visible: true
          },
          {
            id: "empty-summary",
            type: "paragraph",
            zone: "main",
            text: "",
            visible: true
          }
        ]
      })
    );

    expect(html).toContain("ATS: 2 errors · 1 warning");
    expect(html).toContain("Use ordinary text for the candidate name.");
    expect(html).toContain("Remove this empty block or add text.");
    expect(html).toContain('aria-label="ATS issues for this block"');
  });

  it("offers a local-only finished PDF inspection input", () => {
    const html = renderToStaticMarkup(
      createElement(BlockEditor, {
        initialPersonName: "PDF QA",
        initialBlocks: blocks
      })
    );

    expect(html).toContain('type="file"');
    expect(html).toContain('accept="application/pdf,.pdf"');
    expect(html).toContain("Check finished PDF");
    expect(html).not.toContain("Choose PDF");
    expect(html).not.toContain('aria-labelledby="pdf-inspector-heading"');
  });

  it("offers local Markdown and JSON file actions", () => {
    const html = renderToStaticMarkup(
      createElement(BlockEditor, {
        initialPersonName: "Local files QA",
        initialBlocks: blocks
      })
    );

    expect(html).toContain("Import Markdown");
    expect(html).toContain("Export Markdown");
    expect(html).toContain("Import JSON backup");
    expect(html).toContain("Export JSON backup");
    expect(html).toContain("examples/cv-example-en.md");
    expect(html).toContain("examples/cv-example-ru.md");
  });

  it("shows the same toolbar and editor on an empty document as a started one", () => {
    const html = renderToStaticMarkup(
      createElement(BlockEditor, {
        initialPersonName: "",
        initialBlocks: []
      })
    );

    expect(html).toContain(">Reset<");
    expect(html).toContain(">Import<");
    expect(html).toContain("Save draft in browser");
    expect(html).toContain("Check finished PDF");
    expect(html).toContain('aria-label="Help and privacy"');
    expect(html).toContain('aria-label="Choose a template"');
    expect(html).toContain(">Connect agent<");
    expect(html).toContain('aria-labelledby="connect-agent-heading"');
    expect(html).toContain("How it works");
    expect(html).toContain('aria-label="Help and privacy"');
    expect(html).toContain(">Custom</option>");
    expect(html).toContain(">Classic Compact</option>");
    expect(html).toContain(">Simple ATS</option>");
    expect(html).toContain("A4 editor preview");
    expect(html).toContain('aria-label="Editable A4 resume page"');
    expect(html).toContain("This resume does not have any content yet.");
    expect(html).not.toContain('aria-label="Document language"');
    expect(html).not.toContain("Blank resume");
    expect(html).toContain("PDF filename");
    expect(html).not.toContain("Save as example");
    expect(html).not.toContain("Save as browser template");
  });
});

import { describe, expect, it } from "vitest";
import {
  RESUME_INTERCHANGE_SCHEMA_VERSION,
  englishSampleResume,
  builtInContentTemplates,
  createResumeFromContentTemplate,
  groupBodyRows,
  exportResumeJson,
  exportResumeMarkdown,
  importResumeJson,
  importResumeMarkdown,
  type Resume
} from "../src";

const interchangeFixture = (): Resume => ({
  ...structuredClone(englishSampleResume),
  layoutBlocks: [
    {
      id: "name",
      type: "heading",
      zone: "header",
      level: 1,
      text: "Alex Doe",
      textLinks: [{ label: "Alex Doe", url: "https://example.com/profile" }],
      visible: true
    },
    {
      id: "experience-heading",
      type: "heading",
      zone: "main",
      level: 2,
      text: "Experience",
      visible: true
    },
    {
      id: "experience",
      type: "entry",
      zone: "main",
      visible: true,
      entry: {
        title: "Senior Game Designer",
        subtitle: "Example Studio",
        start: "2021",
        end: "Present",
        bullets: ["Shipped a fictional feature."],
        links: [{ label: "Portfolio", url: "https://example.com/work" }]
      }
    },
    {
      id: "hidden",
      type: "paragraph",
      zone: "main",
      text: "Hidden draft",
      visible: false
    }
  ]
});

describe("versioned resume interchange", () => {
  it.each(builtInContentTemplates)(
    "preserves the $name template structure in Markdown",
    (template) => {
      const original = createResumeFromContentTemplate(template);
      const markdown = exportResumeMarkdown(original);
      const imported = importResumeMarkdown(markdown);
      expect(imported.ok).toBe(true);
      if (!imported.ok) return;
      expect(imported.preview.warnings).toEqual([]);
      expect(
        imported.preview.resume.layoutBlocks.map(({ zone, type }) => ({ zone, type }))
      ).toEqual(
        original.layoutBlocks
          .filter((block) => block.visible)
          .map(({ zone, type }) => ({ zone, type }))
      );
      expect(groupBodyRows(imported.preview.resume.layoutBlocks).map((row) => row.kind)).toEqual(
        groupBodyRows(original.layoutBlocks).map((row) => row.kind)
      );
      expect(exportResumeMarkdown(imported.preview.resume)).toBe(markdown);
    }
  );

  it("preserves literal braces and escaped photo labels", () => {
    const original = interchangeFixture();
    original.layoutBlocks = [
      { id: "literal", type: "paragraph", text: "Values {a, b}", zone: "footer", visible: true },
      {
        id: "photo",
        type: "image",
        src: "https://example.com/photo.jpg",
        alt: "Alex [photo]",
        zone: "sidebar",
        visible: true
      }
    ];
    const imported = importResumeMarkdown(exportResumeMarkdown(original));
    expect(imported.ok).toBe(true);
    if (imported.ok)
      expect(imported.preview.resume.layoutBlocks).toMatchObject([
        { type: "paragraph", text: "Values {a, b}", zone: "footer" },
        { type: "image", alt: "Alex [photo]", zone: "sidebar" }
      ]);
  });
  it("round-trips JSON losslessly through the explicit schema envelope", () => {
    const original = interchangeFixture();
    const exported = exportResumeJson(original);
    expect(JSON.parse(exported)).toMatchObject({
      schema: RESUME_INTERCHANGE_SCHEMA_VERSION,
      resume: { language: "en" }
    });

    const imported = importResumeJson(exported);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.preview.resume).toEqual(original);
      expect(imported.preview.warnings).toEqual([]);
    }
  });

  it("round-trips the visible Markdown structure with the same schema version", () => {
    const exported = exportResumeMarkdown(interchangeFixture());
    expect(exported).toContain(`schema: ${RESUME_INTERCHANGE_SCHEMA_VERSION}`);

    const imported = importResumeMarkdown(exported);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.preview.language).toBe("en");
      expect(imported.preview.resume.layoutBlocks).toMatchObject([
        {
          type: "heading",
          level: 1,
          text: "Alex Doe",
          textLinks: [{ label: "Alex Doe", url: "https://example.com/profile" }],
          zone: "header"
        },
        { type: "heading", level: 2, text: "Experience", zone: "main" },
        {
          type: "entry",
          zone: "main",
          entry: {
            title: "Senior Game Designer",
            links: [{ label: "Portfolio", url: "https://example.com/work" }]
          }
        }
      ]);
    }
  });

  it("preserves an explicitly selected two-column layout in Markdown", () => {
    const resume = { ...interchangeFixture(), layout: "two-column" as const };
    const exported = exportResumeMarkdown(resume);

    expect(exported).toContain("layout: two-column");
    const imported = importResumeMarkdown(exported);
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.preview.resume.layout).toBe("two-column");
  });

  it("imports legacy unversioned JSON with an explicit migration warning", () => {
    const imported = importResumeJson(JSON.stringify(interchangeFixture()));
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.preview.warnings[0]?.code).toBe("legacy-json");
  });

  it("round-trips presentation attributes through Markdown", () => {
    const resume: Resume = {
      ...structuredClone(englishSampleResume),
      layoutBlocks: [
        {
          id: "name",
          type: "heading",
          zone: "header",
          level: 1,
          text: "Alex Doe",
          align: "center",
          visible: true
        },
        {
          id: "experience-heading",
          type: "heading",
          zone: "main",
          level: 2,
          text: "Experience",
          align: "center",
          icon: "briefcase",
          visible: true
        },
        {
          id: "skills",
          type: "bullet_list",
          zone: "sidebar",
          items: ["Systems design", "Balancing"],
          columns: 2,
          visible: true
        },
        {
          id: "photo",
          type: "image",
          zone: "header",
          src: "https://example.com/photo.jpg",
          alt: "Photo",
          shape: "circle",
          visible: true
        }
      ]
    };
    const exported = exportResumeMarkdown(resume);
    expect(exported).toContain("## Experience{zone=main icon=briefcase align=center}");
    expect(exported).toContain("{zone=sidebar columns=2}");

    const imported = importResumeMarkdown(exported);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.preview.resume.layoutBlocks).toMatchObject([
        { type: "heading", level: 1, text: "Alex Doe", align: "center" },
        { type: "heading", level: 2, text: "Experience", align: "center", icon: "briefcase" },
        { type: "bullet_list", items: ["Systems design", "Balancing"], columns: 2 },
        { type: "image", shape: "circle", zone: "header" }
      ]);
    }
  });
});

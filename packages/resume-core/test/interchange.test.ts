import { describe, expect, it } from "vitest";
import {
  RESUME_INTERCHANGE_SCHEMA_VERSION,
  englishSampleResume,
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

  it("imports legacy unversioned JSON with an explicit migration warning", () => {
    const imported = importResumeJson(JSON.stringify(interchangeFixture()));
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.preview.warnings[0]?.code).toBe("legacy-json");
  });
});

import { describe, expect, it } from "vitest";
import { builtInContentTemplates, createResumeFromContentTemplate } from "./content-templates";
import { flattenResumeBlocks } from "./block-model";
import { englishSampleResume } from "./fixtures";

describe("content templates", () => {
  it("provides content-filled visual preset examples without timestamps", () => {
    expect(builtInContentTemplates.map((template) => template.name)).toEqual([
      "Compact",
      "Standard",
      "Two columns",
      "Centered",
      "Split right",
      "Split left",
      "Photo",
      "Skills left",
      "Skills right",
      "Compact with footer",
      "Courses",
      "Europe",
      "Australia",
      "Japan",
      "Minimal"
    ]);
    expect(
      builtInContentTemplates.every(
        (template) => template.language === "en" || template.language === "ja"
      )
    ).toBe(true);
    expect(builtInContentTemplates[0].blocks).not.toEqual(builtInContentTemplates[1].blocks);
    builtInContentTemplates.forEach((template) => {
      expect(template).not.toHaveProperty("createdAt");
      expect(template).not.toHaveProperty("updatedAt");
      expect(template.blocks).toContainEqual(
        expect.objectContaining({
          type: "heading",
          level: 1,
          text: template.name === "Japan" ? "山田 太郎" : englishSampleResume.person.fullName
        })
      );
    });
    // Compact: summary in header, no sidebar
    expect(builtInContentTemplates[0].blocks).not.toContainEqual(
      expect.objectContaining({ id: "section-summary" })
    );
    expect(builtInContentTemplates[0].blocks).toContainEqual(
      expect.objectContaining({ id: "summary-body", type: "paragraph", zone: "header" })
    );
    expect(builtInContentTemplates[0].blocks.every((b) => b.zone !== "sidebar")).toBe(true);
    // Standard: summary in main, no sidebar
    expect(builtInContentTemplates[1].blocks).toContainEqual(
      expect.objectContaining({ id: "section-summary", type: "heading", zone: "main" })
    );
    expect(builtInContentTemplates[1].blocks).toContainEqual(
      expect.objectContaining({ id: "summary-body", type: "paragraph", zone: "main" })
    );
    expect(builtInContentTemplates[1].blocks.every((b) => b.zone !== "sidebar")).toBe(true);
    // Two columns: reference-like personal details, skills, tools, and languages in the sidebar.
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({
        id: "section-personal-info",
        text: "Personal info",
        zone: "main"
      })
    );
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({ id: "section-skills", zone: "main" })
    );
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({ id: "section-languages", zone: "main" })
    );
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({ id: "section-tools", text: "Tools", zone: "main" })
    );
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({ id: "summary-body", type: "paragraph", zone: "header" })
    );
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({ id: "section-certificates", text: "Awards", zone: "main" })
    );
    // Two columns: section icons, two-column skills, dotted language levels.
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({
        id: "section-skills",
        icon: "lucide:chart-column",
        zone: "main"
      })
    );
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({ id: "skills-list", columns: 2, zone: "main" })
    );
    expect(flattenResumeBlocks(builtInContentTemplates[2].blocks, true)).toContainEqual(
      expect.objectContaining({ id: "section-experience", icon: "lucide:briefcase", zone: "main" })
    );
    // Centered variants share headings; only Photo has a photo above them.
    const centered = builtInContentTemplates[3];
    expect(centered.blocks.every((b) => b.zone !== "sidebar")).toBe(true);
    expect(centered.blocks).toContainEqual(
      expect.objectContaining({ type: "heading", level: 1, align: "center", zone: "header" })
    );
    expect(centered.blocks).toContainEqual(
      expect.objectContaining({ id: "section-experience", align: "center" })
    );
    expect(centered.blocks.some((block) => block.type === "image")).toBe(false);
    expect(builtInContentTemplates[6].blocks).toContainEqual(
      expect.objectContaining({
        type: "image",
        shape: "circle",
        placement: "above",
        zone: "header"
      })
    );
    // Mixed: two-column with full-width top/bottom rows around one mixed middle row.
    for (const [templateIndex, sidebarFirst] of [
      [4, false],
      [5, true]
    ] as const) {
      const mixed = builtInContentTemplates[templateIndex];
      expect(mixed.blocks.some((b) => b.type === "columns")).toBe(true);
      const middle = mixed.blocks.find((block) => block.type === "columns");
      expect(middle?.type).toBe("columns");
      if (middle?.type === "columns") {
        expect(middle.columns).toHaveLength(2);
        const firstHeading = middle.columns[0].blocks.find((block) => block.type === "heading");
        expect(firstHeading?.type === "heading" && firstHeading.text).toBe(
          sidebarFirst ? "Skills" : "Experience"
        );
      }
    }
  });

  it("creates an independent resume with explicit language and unchanged block data", () => {
    const template = builtInContentTemplates[0];
    const before = structuredClone(template);
    const resume = createResumeFromContentTemplate(template);

    expect(resume.language).toBe("en");
    expect(resume.layout).toBe("one-column");
    expect(resume.layoutBlocks).toEqual(template.blocks);
    expect(template).toEqual(before);
    expect(resume.layoutBlocks).not.toBe(template.blocks);

    expect(createResumeFromContentTemplate(builtInContentTemplates[2]).layout).toBe("two-column");
  });
});

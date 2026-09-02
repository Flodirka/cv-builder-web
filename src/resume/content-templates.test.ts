import { describe, expect, it } from "vitest";
import { builtInContentTemplates, createResumeFromContentTemplate } from "./content-templates";
import { englishSampleResume } from "./fixtures";

describe("content templates", () => {
  it("provides content-filled visual preset examples without timestamps", () => {
    expect(builtInContentTemplates.map((template) => template.name)).toEqual([
      "Classic Compact",
      "Simple ATS"
    ]);
    expect(builtInContentTemplates.map((template) => template.language)).toEqual(["en", "en"]);
    expect(builtInContentTemplates[0].blocks).not.toEqual(builtInContentTemplates[1].blocks);
    builtInContentTemplates.forEach((template) => {
      expect(template).not.toHaveProperty("createdAt");
      expect(template).not.toHaveProperty("updatedAt");
      expect(template.blocks).toContainEqual(
        expect.objectContaining({
          type: "heading",
          level: 1,
          text: englishSampleResume.person.fullName
        })
      );
    });
    expect(builtInContentTemplates[0].blocks).not.toContainEqual(
      expect.objectContaining({ id: "section-summary" })
    );
    expect(builtInContentTemplates[0].blocks).toContainEqual(
      expect.objectContaining({ id: "summary-body", type: "paragraph", zone: "header" })
    );
    expect(builtInContentTemplates[1].blocks).toContainEqual(
      expect.objectContaining({ id: "section-summary", type: "heading", zone: "main" })
    );
    expect(builtInContentTemplates[1].blocks).toContainEqual(
      expect.objectContaining({ id: "summary-body", type: "paragraph", zone: "main" })
    );
  });

  it("creates an independent resume with explicit language and unchanged block data", () => {
    const template = builtInContentTemplates[0];
    const before = structuredClone(template);
    const resume = createResumeFromContentTemplate(template);

    expect(resume.language).toBe("en");
    expect(resume.layoutBlocks).toEqual(template.blocks);
    expect(template).toEqual(before);
    expect(resume.layoutBlocks).not.toBe(template.blocks);
  });
});

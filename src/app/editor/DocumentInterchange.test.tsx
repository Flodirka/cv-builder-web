import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resumeSchema } from "@/resume";
import { ImportPreview, type PendingImport } from "./DocumentInterchange";

describe("DocumentInterchange", () => {
  it("shows the complete replacement preview before confirmation", () => {
    const resume = resumeSchema.parse({
      language: "ru",
      person: { fullName: "Мария Орлова", links: [] },
      experience: [],
      education: [],
      projects: [],
      skills: [],
      languages: [],
      certificates: [],
      customSections: [],
      layoutBlocks: [
        {
          id: "preview-heading",
          type: "heading",
          zone: "header",
          level: 1,
          text: "Мария Орлова",
          visible: true
        }
      ]
    });
    const pending: PendingImport = {
      resume,
      fileName: "resume-ru.md",
      format: "Markdown",
      language: "ru",
      blockCount: 1,
      warnings: [
        {
          code: "unsupported-markdown",
          line: 8,
          message: "Line 8: tables are outside the supported Markdown subset."
        }
      ]
    };

    const html = renderToStaticMarkup(
      createElement(ImportPreview, {
        pending,
        onReplace: () => undefined,
        onCancel: () => undefined
      })
    );

    expect(html).toContain("Import preview");
    expect(html).toContain("resume-ru.md");
    expect(html).toContain("Detected language");
    expect(html).toContain("RU");
    expect(html).toContain("Block count");
    expect(html).toContain("Line 8: tables are outside the supported Markdown subset.");
    expect(html).toContain("Replace current document");
    expect(html).toContain("Cancel");
  });
});

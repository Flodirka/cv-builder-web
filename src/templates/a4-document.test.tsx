import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { englishSampleResume, russianSampleResume } from "@/resume";
import { ResumePrintDocument } from "./index";

describe("universal A4 resume renderer", () => {
  it.each([
    ["en", englishSampleResume],
    ["ru", russianSampleResume]
  ] as const)("renders the complete %s document without mutation", (_language, resume) => {
    const before = structuredClone(resume);
    const html = renderToStaticMarkup(<ResumePrintDocument resume={resume} />);

    expect(html).toContain(resume.person.fullName);
    expect(resume).toEqual(before);
  });

  it("keeps hidden blocks out while preserving links and every entry field", () => {
    const resume = {
      ...englishSampleResume,
      layoutBlocks: [
        {
          id: "hidden",
          type: "paragraph" as const,
          zone: "main" as const,
          visible: false,
          text: "HIDDEN CONTENT"
        },
        {
          id: "entry",
          type: "entry" as const,
          zone: "main" as const,
          visible: true,
          entry: {
            title: "Portfolio entry",
            subtitle: "Studio",
            start: "2020",
            end: "2024",
            location: "Remote",
            description: "Full description",
            bullets: ["One result"],
            links: [{ label: "Portfolio entry", url: "https://example.test/work" }]
          }
        }
      ]
    };
    const before = structuredClone(resume);
    const html = renderToStaticMarkup(<ResumePrintDocument resume={resume} />);

    expect(html).not.toContain("HIDDEN CONTENT");
    expect(html).toContain("Portfolio entry");
    expect(html).toContain("Studio");
    expect(html).toContain("2020");
    expect(html).toContain("2024");
    expect(html).toContain("Remote");
    expect(html).toContain("Full description");
    expect(html).toContain("One result");
    expect(html).toContain("https://example.test/work");
    expect(resume).toEqual(before);
  });
});

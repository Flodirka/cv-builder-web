import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { englishSampleResume, russianSampleResume } from "@/resume";
import { createA4DocumentModel, ResumePrintDocument } from "./index";

describe("A4 resume document", () => {
  it("renders the English fixture with section hierarchy and entry metadata", () => {
    const html = renderToStaticMarkup(<ResumePrintDocument resume={englishSampleResume} />);

    expect(html).toContain("Alex Doe");
    expect(html).toContain("Example Studio");
    expect(html).toContain("Senior Game Designer");
    expect(html).toContain("2021 - Present");
  });

  it("renders Cyrillic text from the Russian fixture", () => {
    const html = renderToStaticMarkup(<ResumePrintDocument resume={russianSampleResume} />);

    expect(html).toContain("Иван Иванов");
    expect(html).toContain("Геймдизайнер");
    expect(html).toContain("Удаленно");
  });

  it("renders entry title before subtitle", () => {
    const html = renderToStaticMarkup(
      <ResumePrintDocument
        resume={{
          ...englishSampleResume,
          layoutBlocks: [
            {
              id: "manual-entry",
              type: "entry",
              zone: "main",
              visible: true,
              entry: {
                title: "Entry Title",
                subtitle: "Entry Subtitle",
                location: "Right Side",
                start: "2021",
                end: "Present",
                bullets: []
              }
            }
          ]
        }}
      />
    );

    expect(html.indexOf("Entry Title")).toBeLessThan(html.indexOf("Entry Subtitle"));
    expect(html).toContain("Right Side");
    expect(html).toContain("2021 - Present");
  });

  it("renders labeled text with a bold label", () => {
    const html = renderToStaticMarkup(
      <ResumePrintDocument
        resume={{
          ...englishSampleResume,
          layoutBlocks: [
            {
              id: "manual-label",
              type: "labeled_text",
              zone: "main",
              visible: true,
              label: "Interests",
              text: "Hiking, Photography, Traveling"
            }
          ]
        }}
      />
    );

    expect(html).toContain("<strong>Interests:</strong> Hiking, Photography, Traveling");
  });

  it("renders imported text links as safe clickable anchors", () => {
    const html = renderToStaticMarkup(
      <ResumePrintDocument
        resume={{
          ...englishSampleResume,
          layoutBlocks: [
            {
              id: "contact-links",
              type: "paragraph",
              zone: "header",
              visible: true,
              text: "Telegram · GDB · LinkedIn",
              textLinks: [
                { label: "Telegram", url: "https://t.me/example_channel" },
                { label: "GDB", url: "https://example.com/gdb" },
                { label: "LinkedIn", url: "https://www.linkedin.com/in/example-profile" }
              ]
            }
          ]
        }}
      />
    );

    expect(html).toContain('<a class="');
    expect(html).toContain('href="https://t.me/example_channel"');
    expect(html).toContain('href="https://example.com/gdb"');
    expect(html).toContain('href="https://www.linkedin.com/in/example-profile"');
    expect(html).toContain(">LinkedIn</a>");
  });

  it("does not create clickable anchors for unsafe link protocols", () => {
    const html = renderToStaticMarkup(
      <ResumePrintDocument
        resume={{
          ...englishSampleResume,
          layoutBlocks: [
            {
              id: "unsafe-link",
              type: "paragraph",
              zone: "header",
              visible: true,
              text: "Open profile",
              textLinks: [{ label: "Open profile", url: "javascript:alert(1)" }]
            }
          ]
        }}
      />
    );

    expect(html).toContain("Open profile");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });

  it("keeps unsupported sidebar blocks out of the current one-column model", () => {
    const model = createA4DocumentModel({
      ...englishSampleResume,
      layoutBlocks: [
        ...englishSampleResume.layoutBlocks,
        { id: "sidebar-note", type: "paragraph", zone: "sidebar", text: "Hidden", visible: true }
      ]
    });

    expect(model.blocks.every((block) => block.zone !== "sidebar")).toBe(true);
  });
});

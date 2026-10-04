import { describe, expect, it } from "vitest";
import {
  resumeBlockSchema,
  resumeSchema,
  exportResumeMarkdown,
  importResumeMarkdown
} from "../src";

describe("editable tables and Japanese documents", () => {
  it("rejects ragged rows and invalid widths", () => {
    const table = {
      id: "t",
      type: "table",
      zone: "main",
      visible: true,
      widths: [1, 3],
      rows: [
        ["Year", "Education"],
        ["2020", "Graduated"]
      ],
      header: true
    };
    expect(resumeBlockSchema.safeParse(table).success).toBe(true);
    expect(resumeBlockSchema.safeParse({ ...table, rows: [["only one cell"]] }).success).toBe(
      false
    );
    expect(resumeBlockSchema.safeParse({ ...table, widths: [0, 1] }).success).toBe(false);
  });

  it("round-trips Japanese tables, empty cells, pipes, literal HTML and line breaks", () => {
    const resume = resumeSchema.parse({
      language: "ja",
      person: { fullName: "山田 太郎" },
      layoutBlocks: [
        {
          id: "t",
          type: "table",
          zone: "main",
          visible: true,
          widths: [1, 4],
          header: true,
          rows: [
            ["年", "学歴"],
            ["2020", "大学卒業 | 研究\n設計 <br> テスト"],
            ["", "以上"]
          ]
        },
        { id: "p", type: "page_break", zone: "main", visible: true }
      ]
    });
    const parsed = importResumeMarkdown(exportResumeMarkdown(resume));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.preview.warnings).toEqual([]);
    expect(parsed.preview.resume.language).toBe("ja");
    expect(parsed.preview.resume.layoutBlocks).toEqual(
      resume.layoutBlocks.map((block) =>
        expect.objectContaining({ ...block, id: expect.any(String) })
      )
    );
  });

  it("fails on malformed table markers and rows", () => {
    for (const markdown of [
      "::: table{zone=main widths=1,1}\n| a | b |",
      "::: table{zone=main widths=1,1}\n| a |\n::: endtable"
    ])
      expect(importResumeMarkdown(markdown).ok).toBe(false);
  });
});

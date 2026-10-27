import { describe, expect, it } from "vitest";
import {
  analyzeResumeBlocks,
  editResumeBlock,
  englishSampleResume,
  exportResumeJson,
  exportResumeMarkdown,
  findResumeBlock,
  flattenResumeBlocks,
  importResumeJson,
  importResumeMarkdown,
  locateResumeBlock,
  moveResumeBlock,
  resumeBlockSchema,
  type ColumnsBlock,
  type ResumeBlock
} from "../src";

const text = (id: string): ResumeBlock => ({
  id,
  type: "paragraph",
  zone: "main",
  text: id,
  visible: true
});
const columns = (): ColumnsBlock => ({
  id: "pair",
  type: "columns",
  zone: "main",
  visible: true,
  columns: [
    { width: 1, blocks: [text("left")] },
    { width: 1, blocks: [text("right")] }
  ]
});

describe("column containers", () => {
  it("preserves nested structure, widths, links and reading order through Markdown and JSON", () => {
    const nested = columns();
    nested.id = "nested";
    const group = columns();
    group.columns[1].width = 2;
    group.columns[1].blocks.push(nested);
    group.columns.push({ width: 1, blocks: [] });
    const resume = { ...englishSampleResume, layoutBlocks: [text("before"), group, text("after")] };
    const markdown = exportResumeMarkdown(resume);
    const parsed = importResumeMarkdown(markdown);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.preview.warnings).toEqual([]);
      expect(exportResumeMarkdown(parsed.preview.resume)).toBe(markdown);
      expect(
        flattenResumeBlocks(parsed.preview.resume.layoutBlocks).map((block) =>
          block.type === "paragraph" ? block.text : ""
        )
      ).toEqual(["before", "left", "right", "left", "right", "after"]);
    }
    const json = importResumeJson(exportResumeJson(resume));
    expect(json.ok && json.preview.resume.layoutBlocks).toEqual(resume.layoutBlocks);
  });
  it("rejects invalid widths, invalid children and unsupported column counts", () => {
    const group = columns();
    expect(resumeBlockSchema.safeParse(group).success).toBe(true);
    expect(
      resumeBlockSchema.safeParse({ ...group, columns: group.columns.slice(0, 1) }).success
    ).toBe(false);
    expect(
      resumeBlockSchema.safeParse({ ...group, columns: [...group.columns, ...group.columns] })
        .success
    ).toBe(false);
    expect(
      resumeBlockSchema.safeParse({
        ...group,
        columns: [{ width: 0, blocks: [] }, group.columns[1]]
      }).success
    ).toBe(false);
    expect(
      resumeBlockSchema.safeParse({
        ...group,
        columns: [{ width: 1, blocks: [{ ...text("empty"), text: "" }] }, group.columns[1]]
      }).success
    ).toBe(false);
  });
  it("preserves explicit false heading appearance flags through Markdown", () => {
    const heading: ResumeBlock = {
      id: "style",
      type: "heading",
      level: 2,
      text: "Section",
      zone: "main",
      visible: true,
      underline: false,
      uppercase: false,
      bold: false
    };
    const result = importResumeMarkdown(
      exportResumeMarkdown({ ...englishSampleResume, layoutBlocks: [heading] })
    );
    expect(result.ok && result.preview.resume.layoutBlocks[0]).toMatchObject({
      underline: false,
      uppercase: false,
      bold: false
    });
  });
  it("preserves literal column markers as paragraph content", () => {
    const resume = {
      ...englishSampleResume,
      layoutBlocks: [{ ...text("marker"), text: "::: endcolumn" }]
    };
    const imported = importResumeMarkdown(exportResumeMarkdown(resume));
    expect(imported.ok && flattenResumeBlocks(imported.preview.resume.layoutBlocks)).toContainEqual(
      expect.objectContaining({ type: "paragraph", text: "::: endcolumn" })
    );
  });
  it.each([
    "::: columns\n::: column width=0\n::: endcolumn\n::: endcolumns",
    "::: columns\n::: column width=1\nText",
    "::: endcolumn"
  ])("rejects malformed container markers without dropping content", (source) => {
    expect(importResumeMarkdown(source).ok).toBe(false);
  });
  it("moves blocks into, across and out of columns without changing their content", () => {
    const original = [text("outside"), columns()];
    const inside = moveResumeBlock(original, "outside", {
      parentId: "pair",
      columnIndex: 0,
      beforeId: "left"
    });
    expect(locateResumeBlock(inside, "outside")).toEqual({
      parentId: "pair",
      columnIndex: 0,
      beforeId: "outside"
    });
    const across = moveResumeBlock(inside, "outside", { parentId: "pair", columnIndex: 1 });
    expect(locateResumeBlock(across, "outside")).toEqual({
      parentId: "pair",
      columnIndex: 1,
      beforeId: "outside"
    });
    const out = moveResumeBlock(across, "outside", { zone: "footer" });
    expect(findResumeBlock(out, "outside")).toEqual({ ...text("outside"), zone: "footer" });
    expect(original[0]).toEqual(text("outside"));
  });
  it("prevents moving a container inside itself or its descendants", () => {
    const parent = columns();
    const child = columns();
    child.id = "child";
    parent.columns[0].blocks.push(child);
    const blocks = [parent];
    expect(moveResumeBlock(blocks, "pair", { parentId: "pair", columnIndex: 0 })).toBe(blocks);
    expect(moveResumeBlock(blocks, "pair", { parentId: "child", columnIndex: 0 })).toBe(blocks);
    expect(moveResumeBlock(blocks, "pair", { parentId: "missing", columnIndex: 0 })).toBe(blocks);
  });
  it("edits and removes nested children and excludes hidden containers from ATS analysis", () => {
    const blocks = [columns()];
    expect(findResumeBlock(editResumeBlock(blocks, "left", text("changed")), "changed")).toEqual(
      text("changed")
    );
    expect(flattenResumeBlocks(editResumeBlock(blocks, "left")).map((block) => block.id)).toEqual([
      "right"
    ]);
    const hidden = { ...columns(), visible: false };
    expect(flattenResumeBlocks([hidden])).toEqual([]);
    expect(analyzeResumeBlocks([hidden])).toEqual(analyzeResumeBlocks([]));
  });
});

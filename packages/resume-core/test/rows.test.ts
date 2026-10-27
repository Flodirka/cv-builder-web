import { describe, expect, it } from "vitest";
import { groupBodyRows, resumeBlockSchema, type ResumeBlock } from "../src";

const block = (id: string, type: ResumeBlock["type"], zone: ResumeBlock["zone"]): ResumeBlock =>
  resumeBlockSchema.parse(
    type === "heading"
      ? { id, type, zone, level: 2, text: id, visible: true }
      : type === "bullet_list"
        ? { id, type, zone, items: [id], visible: true }
        : { id, type, zone, visible: true }
  ) as ResumeBlock;

describe("groupBodyRows", () => {
  it("keeps hidden blocks and row separators editable without changing export rows", () => {
    const hidden = { ...block("hidden", "heading", "main"), visible: false };
    const body = [
      block("s", "heading", "sidebar"),
      hidden,
      block("break", "divider", "main"),
      block("m", "heading", "main")
    ];
    expect(groupBodyRows(body).map((row) => row.kind)).toEqual(["full", "full"]);
    const editing = groupBodyRows(body, true);
    expect(editing.map((row) => row.kind)).toEqual(["mixed", "full", "full"]);
    expect(editing[1]).toEqual({ kind: "full", blocks: [body[2]] });
    expect(body[1].visible).toBe(false);
  });
  it("keeps single-column bodies as one full-width row with dividers intact", () => {
    const body = [block("a", "heading", "main"), block("b", "divider", "main")];
    expect(groupBodyRows(body)).toEqual([{ kind: "full", blocks: body }]);
  });

  it("groups a classic sidebar+main body into one sidebar-first mixed row", () => {
    const rows = groupBodyRows([
      block("s1", "heading", "sidebar"),
      block("s2", "bullet_list", "sidebar"),
      block("m1", "heading", "main")
    ]);
    expect(rows).toEqual([
      {
        kind: "mixed",
        sidebarBlocks: [block("s1", "heading", "sidebar"), block("s2", "bullet_list", "sidebar")],
        mainBlocks: [block("m1", "heading", "main")],
        sidebarFirst: true
      }
    ]);
  });

  it("honours main-first order for mirrored mixed rows", () => {
    const rows = groupBodyRows([block("m1", "heading", "main"), block("s1", "heading", "sidebar")]);
    expect(rows[0]).toMatchObject({ kind: "mixed", sidebarFirst: false });
  });

  it("splits divider-separated bodies into full and mixed rows and consumes dividers", () => {
    const rows = groupBodyRows([
      block("top", "heading", "main"),
      block("break-1", "divider", "main"),
      block("m1", "heading", "main"),
      block("s1", "heading", "sidebar"),
      block("break-2", "divider", "main"),
      block("bottom", "heading", "main")
    ]);
    expect(rows.map((row) => row.kind)).toEqual(["full", "mixed", "full"]);
    expect(rows.flatMap((row) => (row.kind === "full" ? row.blocks : []))).toHaveLength(2);
  });
});

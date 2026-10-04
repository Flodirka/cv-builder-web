import type { ResumeBlock, ResumeZone } from "./schema";

export const countResumeBlocks = (blocks: ResumeBlock[]): number =>
  blocks.reduce(
    (count, block) =>
      count +
      1 +
      (block.type === "columns"
        ? block.columns.reduce((sum, column) => sum + countResumeBlocks(column.blocks), 0)
        : 0),
    0
  );

export type BlockTarget =
  | { parentId: string; columnIndex: number; beforeId?: string }
  | { zone: ResumeZone; beforeId?: string };

export const findResumeBlock = (blocks: ResumeBlock[], id: string): ResumeBlock | undefined => {
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.type === "columns") {
      for (const column of block.columns) {
        const found = findResumeBlock(column.blocks, id);
        if (found) return found;
      }
    }
  }
};

export const editResumeBlock = (
  blocks: ResumeBlock[],
  id: string,
  replacement?: ResumeBlock
): ResumeBlock[] =>
  blocks.flatMap((block) =>
    block.id === id
      ? replacement
        ? [replacement]
        : []
      : block.type === "columns"
        ? [
            {
              ...block,
              columns: block.columns.map((column) => ({
                ...column,
                blocks: editResumeBlock(column.blocks, id, replacement)
              }))
            }
          ]
        : [block]
  );

export const moveResumeBlock = (
  blocks: ResumeBlock[],
  id: string,
  target: BlockTarget
): ResumeBlock[] => {
  const moved = findResumeBlock(blocks, id);
  if (!moved || target.beforeId === id) return blocks;
  if (
    "parentId" in target &&
    (target.parentId === id ||
      (moved.type === "columns" &&
        moved.columns.some((column) => findResumeBlock(column.blocks, target.parentId))))
  )
    return blocks;
  const insert = (items: ResumeBlock[], block: ResumeBlock) => {
    const next = [...items];
    const before = target.beforeId ? next.findIndex((item) => item.id === target.beforeId) : -1;
    let last = next.length;
    if ("zone" in target) {
      last = 0;
      next.forEach((item, index) => {
        if (item.zone === target.zone) last = index + 1;
      });
    }
    next.splice(before >= 0 ? before : last, 0, block);
    return next;
  };
  if ("zone" in target) return insert(editResumeBlock(blocks, id), { ...moved, zone: target.zone });
  const parent = findResumeBlock(blocks, target.parentId);
  if (parent?.type !== "columns" || !parent.columns[target.columnIndex]) return blocks;
  const remaining = editResumeBlock(blocks, id);
  const destination = findResumeBlock(remaining, target.parentId)!;
  if (destination.type !== "columns") return blocks;
  return editResumeBlock(remaining, destination.id, {
    ...destination,
    columns: destination.columns.map((column, index) =>
      index === target.columnIndex
        ? { ...column, blocks: insert(column.blocks, { ...moved, zone: destination.zone }) }
        : column
    )
  });
};

export const locateResumeBlock = (blocks: ResumeBlock[], id: string): BlockTarget | undefined => {
  for (const block of blocks) {
    if (block.id === id) return { zone: block.zone, beforeId: id };
    if (block.type === "columns") {
      for (const [columnIndex, column] of block.columns.entries()) {
        if (column.blocks.some((child) => child.id === id))
          return { parentId: block.id, columnIndex, beforeId: id };
        const found = locateResumeBlock(column.blocks, id);
        if (found) return found;
      }
    }
  }
};

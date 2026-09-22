"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type TextareaHTMLAttributes
} from "react";
import {
  analyzeResumeBlocks,
  buildDefaultResumeBlocks,
  builtInContentTemplates,
  createResumeFromContentTemplate,
  englishSampleResume,
  exportResumeJson,
  exportResumeMarkdown,
  importResumeMarkdown,
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
  type AtsIssue,
  type Resume,
  type ResumeBlock,
  type ResumeEntry,
  type ResumeZone
} from "@/resume";
import { renderResumePdfBlob, ResumePrintDocument } from "@/templates";
import { DocumentInterchange, ImportPreview, type PendingImport } from "./DocumentInterchange";
import {
  acknowledgeRelayImport,
  claimRelayMarkdown,
  clearRelayConnection,
  CONNECTED_BUILDER_MCP_ENDPOINT,
  CONNECTED_BUILDER_SETUP_PROMPT,
  createRelayClaimNonce,
  readRelayConnection,
  takeRelayCapabilityFromFragment,
  writeRelayConnection,
  type RelayConnection
} from "./connected-builder";
import { PDF_INSPECTION_LIMITS, PUBLIC_FILE_LIMITS } from "./file-limits";
import { PdfInspector } from "./PdfInspector";
import { ScaledPrintPreview } from "./ScaledPrintPreview";
import styles from "./BlockEditor.module.css";

export type BlockEditorProps = {
  initialBlocks: ResumeBlock[];
  initialPersonName: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "busy"; label: string }
  | { kind: "success"; label: string }
  | { kind: "error"; label: string };

type ConnectedImportState =
  | { kind: "idle" }
  | { kind: "connected"; label: string }
  | { kind: "importing"; label: string }
  | { kind: "imported"; label: string }
  | { kind: "expired"; label: string }
  | { kind: "error"; label: string; retry: "claim" | "ack" | null };

type MoveDirection = "up" | "down";
type ManualBlockType =
  | "heading"
  | "paragraph"
  | "labeled_text"
  | "bullet_list"
  | "entry"
  | "divider";
type EditorZone = Extract<ResumeZone, "header" | "main" | "footer">;
type ClassicCompactEditorZone = Extract<EditorZone, "header" | "main">;
type AddBlockKind =
  | "headline"
  | "header_text"
  | "section_heading"
  | "text"
  | "labeled_text"
  | "bullet_list"
  | "entry"
  | "divider";

export const classicCompactEditorZones = [
  "header",
  "main"
] as const satisfies readonly EditorZone[];

export const hasClassicCompactEditorContent = (blocks: ResumeBlock[]) =>
  classicCompactEditorZones.some((zone) => blocks.some((block) => block.zone === zone));

const classicCompactPageContentHeight = 1043;

export const getClassicCompactPageCount = (contentHeight: number) =>
  Math.max(1, Math.ceil(contentHeight / classicCompactPageContentHeight));

const addBlockKinds: Array<{ id: AddBlockKind; label: string }> = [
  { id: "headline", label: "Headline" },
  { id: "header_text", label: "Header text" },
  { id: "section_heading", label: "Section heading" },
  { id: "text", label: "Text" },
  { id: "labeled_text", label: "Label row" },
  { id: "bullet_list", label: "Bullets" },
  { id: "entry", label: "Entry" },
  { id: "divider", label: "Divider" }
];

// helpers

function swap<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function findMoveTarget(
  blocks: ResumeBlock[],
  idx: number,
  direction: MoveDirection
): number {
  const zone = blocks[idx]?.zone;
  if (!zone) return -1;

  if (direction === "up") {
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (blocks[i].zone === zone) return i;
    }
    return -1;
  }

  for (let i = idx + 1; i < blocks.length; i += 1) {
    if (blocks[i].zone === zone) return i;
  }
  return -1;
}

export function moveWithinZone(
  blocks: ResumeBlock[],
  idx: number,
  direction: MoveDirection
): ResumeBlock[] {
  const target = findMoveTarget(blocks, idx, direction);
  return target === -1 ? blocks : swap(blocks, idx, target);
}

export function moveToIndexWithinZone(
  blocks: ResumeBlock[],
  fromIndex: number,
  toIndex: number
): ResumeBlock[] {
  const fromBlock = blocks[fromIndex];
  const toBlock = blocks[toIndex];
  if (!fromBlock || !toBlock || fromBlock.zone !== toBlock.zone || fromIndex === toIndex) {
    return blocks;
  }

  const next = [...blocks];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

const manualBlockId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `manual-${Date.now()}`;

export function createManualBlock(
  type: ManualBlockType,
  zone: EditorZone,
  id = manualBlockId()
): ResumeBlock {
  switch (type) {
    case "heading":
      return {
        id,
        type,
        zone,
        level: zone === "header" ? 1 : 2,
        text: zone === "header" ? "Name or headline" : "Section heading",
        visible: true
      };
    case "paragraph":
      return { id, type, zone, text: "Paragraph text", visible: true };
    case "labeled_text":
      return { id, type, zone, label: "Label", text: "Text", visible: true };
    case "bullet_list":
      return { id, type, zone, items: ["Bullet text"], visible: true };
    case "entry":
      return {
        id,
        type,
        zone,
        entry: { title: "Entry title", bullets: [] },
        visible: true
      };
    case "divider":
      return { id, type, zone, visible: true };
  }
}

function createBlockFromKind(kind: AddBlockKind, id = manualBlockId()): ResumeBlock {
  switch (kind) {
    case "headline":
      return {
        id,
        type: "heading",
        zone: "header",
        level: 1,
        text: "Name or headline",
        visible: true
      };
    case "header_text":
      return { id, type: "paragraph", zone: "header", text: "Header text", visible: true };
    case "section_heading":
      return {
        id,
        type: "heading",
        zone: "main",
        level: 2,
        text: "Section heading",
        visible: true
      };
    case "text":
      return { id, type: "paragraph", zone: "main", text: "Paragraph text", visible: true };
    case "labeled_text":
      return {
        id,
        type: "labeled_text",
        zone: "main",
        label: "Label",
        text: "Text",
        visible: true
      };
    case "bullet_list":
      return { id, type: "bullet_list", zone: "main", items: ["Bullet text"], visible: true };
    case "entry":
      return {
        id,
        type: "entry",
        zone: "main",
        entry: { title: "Entry title", bullets: [] },
        visible: true
      };
    case "divider":
      return { id, type: "divider", zone: "main", visible: true };
  }
}

export function cleanBlocks(blocks: ResumeBlock[]): ResumeBlock[] {
  const cleaned: ResumeBlock[] = [];

  for (const block of blocks) {
    if (block.type === "bullet_list") {
      const items = block.items.map((s) => s.trim()).filter(Boolean);
      if (items.length > 0) cleaned.push({ ...block, items });
      continue;
    }
    if (block.type === "entry") {
      cleaned.push({
        ...block,
        entry: {
          ...block.entry,
          title: block.entry.title.trim() || block.entry.title,
          subtitle: block.entry.subtitle?.trim() || undefined,
          start: block.entry.start?.trim() || undefined,
          end: block.entry.end?.trim() || undefined,
          location: block.entry.location?.trim() || undefined,
          description: block.entry.description?.trim() || undefined,
          bullets: block.entry.bullets.map((s) => s.trim()).filter(Boolean)
        }
      });
      continue;
    }
    if (block.type === "heading" || block.type === "paragraph") {
      cleaned.push({ ...block, text: block.text.trim() || block.text });
      continue;
    }
    if (block.type === "labeled_text") {
      cleaned.push({
        ...block,
        label: block.label.trim() || block.label,
        text: block.text.trim() || block.text
      });
      continue;
    }
    cleaned.push(block);
  }

  return cleaned;
}

export const detectDocumentLanguage = (
  personName: string,
  blocks: ResumeBlock[]
): Resume["language"] =>
  /\p{Script=Cyrillic}/u.test(`${personName}\n${JSON.stringify(blocks)}`) ? "ru" : "en";

export function createEditorResume(personName: string, blocks: ResumeBlock[]): Resume {
  return {
    language: detectDocumentLanguage(personName, blocks),
    person: { fullName: personName.trim() || "Resume", links: [] },
    summary: undefined,
    experience: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    certificates: [],
    customSections: [],
    layoutBlocks: cleanBlocks(blocks)
  };
}

export function updateEditorResume(
  base: Resume,
  personName: string,
  blocks: ResumeBlock[]
): Resume {
  return {
    ...base,
    language: detectDocumentLanguage(personName, blocks),
    person: { ...base.person, fullName: personName.trim() || "Resume" },
    layoutBlocks: cleanBlocks(blocks)
  };
}

export function insertBlockAfter(
  blocks: ResumeBlock[],
  block: ResumeBlock,
  afterIndex?: number
): ResumeBlock[] {
  if (typeof afterIndex === "number") {
    return [...blocks.slice(0, afterIndex + 1), block, ...blocks.slice(afterIndex + 1)];
  }

  const lastZoneIndex = blocks.findLastIndex((item) => item.zone === block.zone);
  if (lastZoneIndex === -1) return [...blocks, block];
  return [...blocks.slice(0, lastZoneIndex + 1), block, ...blocks.slice(lastZoneIndex + 1)];
}

export type DeletedBlock = {
  block: ResumeBlock;
  index: number;
};

export function deleteBlockWithUndo(
  blocks: ResumeBlock[],
  id: string
): { blocks: ResumeBlock[]; deleted: DeletedBlock | null } {
  const index = blocks.findIndex((block) => block.id === id);
  if (index === -1) return { blocks, deleted: null };

  return {
    blocks: [...blocks.slice(0, index), ...blocks.slice(index + 1)],
    deleted: { block: blocks[index], index }
  };
}

export function restoreDeletedBlock(blocks: ResumeBlock[], deleted: DeletedBlock): ResumeBlock[] {
  if (blocks.some((block) => block.id === deleted.block.id)) return blocks;

  const index = Math.min(deleted.index, blocks.length);
  return [...blocks.slice(0, index), deleted.block, ...blocks.slice(index)];
}

const entryDate = (entry: ResumeEntry) => [entry.start, entry.end].filter(Boolean).join(" - ");

type ActionIconName =
  | "move-up"
  | "move-down"
  | "hide"
  | "show"
  | "plus"
  | "trash"
  | "grip"
  | "file";

function ActionIcon({ name }: { name: ActionIconName }) {
  return (
    <svg
      className={styles.actionIcon}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {name === "move-up" && (
        <>
          <path d="M5.5 8.5 10 4l4.5 4.5" />
          <path d="M10 4v12" />
        </>
      )}
      {name === "move-down" && (
        <>
          <path d="m5.5 11.5 4.5 4.5 4.5-4.5" />
          <path d="M10 16V4" />
        </>
      )}
      {name === "hide" && (
        <>
          <path d="M3 3 17 17" />
          <path d="M8.2 5.7A8.8 8.8 0 0 1 10 5.5c4.7 0 7.5 4.5 7.5 4.5a12 12 0 0 1-2.1 2.6" />
          <path d="M12.4 12.4A3.4 3.4 0 0 1 7.6 7.6" />
          <path d="M5.2 7.1A12.8 12.8 0 0 0 2.5 10s2.8 4.5 7.5 4.5c.7 0 1.4-.1 2-.3" />
        </>
      )}
      {name === "show" && (
        <>
          <path d="M2.5 10S5.3 5.5 10 5.5s7.5 4.5 7.5 4.5-2.8 4.5-7.5 4.5S2.5 10 2.5 10Z" />
          <circle cx="10" cy="10" r="2.5" />
        </>
      )}
      {name === "plus" && (
        <>
          <circle cx="10" cy="10" r="7" />
          <path d="M10 6.5v7M6.5 10h7" />
        </>
      )}
      {name === "trash" && (
        <>
          <path d="M4.5 6.5h11" />
          <path d="M8 3.8h4l.8 2.7H7.2L8 3.8Z" />
          <path d="m6 6.5.7 9.7h6.6l.7-9.7" />
          <path d="M8.5 9v4.8M11.5 9v4.8" />
        </>
      )}
      {name === "grip" && (
        <>
          <circle className={styles.gripDot} cx="7" cy="5" r="1.2" />
          <circle className={styles.gripDot} cx="13" cy="5" r="1.2" />
          <circle className={styles.gripDot} cx="7" cy="10" r="1.2" />
          <circle className={styles.gripDot} cx="13" cy="10" r="1.2" />
          <circle className={styles.gripDot} cx="7" cy="15" r="1.2" />
          <circle className={styles.gripDot} cx="13" cy="15" r="1.2" />
        </>
      )}
      {name === "file" && (
        <>
          <path d="M5 2.8h6l4 4v10.4H5z" />
          <path d="M11 2.8v4h4M7.8 10h4.4M7.8 13h4.4" />
        </>
      )}
    </svg>
  );
}

const cloneBlock = (block: ResumeBlock): ResumeBlock => {
  if (block.type === "bullet_list") return { ...block, items: [...block.items] };
  if (block.type === "entry") {
    return {
      ...block,
      entry: {
        ...block.entry,
        bullets: [...block.entry.bullets],
        links: block.entry.links ? [...block.entry.links] : undefined
      }
    };
  }
  return { ...block };
};

export const createClassicCompactSampleBlocks = (): ResumeBlock[] =>
  buildDefaultResumeBlocks(englishSampleResume).map(cloneBlock);

type AutoResizeTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
};

export const getAutoResizeTextareaHeight = (scrollHeight: number, borderHeight: number) =>
  scrollHeight + Math.max(0, borderHeight);

function AutoResizeTextarea({ value, ...props }: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const borderHeight = textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = `${getAutoResizeTextareaHeight(textarea.scrollHeight, borderHeight)}px`;
  }, [value]);

  return <textarea ref={textareaRef} rows={1} value={value} {...props} />;
}

// entry sub-editor

type EntryEditorProps = {
  entry: ResumeEntry;
  onChange: (entry: ResumeEntry) => void;
};

function EntryEditor({ entry, onChange }: EntryEditorProps) {
  const date = entryDate(entry);

  return (
    <div className={styles.entryEdit}>
      <div className={styles.entryTopline}>
        <input
          className={`${styles.plainInput} ${styles.entryPrimaryInput}`}
          value={entry.title}
          onChange={(e) => onChange({ ...entry, title: e.target.value })}
          placeholder="Entry title"
        />
        <input
          className={`${styles.plainInput} ${styles.entryMetaInput}`}
          value={entry.location ?? ""}
          onChange={(e) => onChange({ ...entry, location: e.target.value || undefined })}
          placeholder="Location"
        />
      </div>

      <div className={styles.entrySubline}>
        <input
          className={`${styles.plainInput} ${styles.entrySecondaryInput}`}
          value={entry.subtitle ?? ""}
          onChange={(e) => onChange({ ...entry, subtitle: e.target.value || undefined })}
          placeholder="Subtitle"
        />
        <div className={styles.dateFields} aria-label={date ? `Date: ${date}` : "Date fields"}>
          <input
            className={`${styles.plainInput} ${styles.entryMetaInput} ${styles.dateInput}`}
            value={entry.start ?? ""}
            size={Math.max(entry.start?.length ?? 0, 5)}
            onChange={(e) => onChange({ ...entry, start: e.target.value || undefined })}
            placeholder="Start"
          />
          <span className={styles.dateDash}>-</span>
          <input
            className={`${styles.plainInput} ${styles.entryMetaInput} ${styles.dateInput}`}
            value={entry.end ?? ""}
            size={Math.max(entry.end?.length ?? 0, 3)}
            onChange={(e) => onChange({ ...entry, end: e.target.value || undefined })}
            placeholder="End"
          />
        </div>
      </div>

      <AutoResizeTextarea
        className={`${styles.plainTextarea} ${styles.entryDescriptionInput}`}
        value={entry.description ?? ""}
        onChange={(e) => onChange({ ...entry, description: e.target.value || undefined })}
        placeholder="Description"
      />

      <div className={styles.bulletEditList}>
        {entry.bullets.map((bullet, i) => (
          <div key={i} className={styles.bulletEditRow}>
            <span aria-hidden="true">•</span>
            <AutoResizeTextarea
              className={`${styles.plainTextarea} ${styles.bulletTextArea}`}
              value={bullet}
              onChange={(e) =>
                onChange({
                  ...entry,
                  bullets: entry.bullets.map((b, j) => (j === i ? e.target.value : b))
                })
              }
              placeholder="Bullet"
            />
            <button
              type="button"
              className={`${styles.quickButton} ${styles.deleteQuickButton}`}
              onClick={() =>
                onChange({ ...entry, bullets: entry.bullets.filter((_, j) => j !== i) })
              }
              disabled={entry.bullets.length <= 1}
              aria-label="Remove bullet"
              title="Remove bullet"
            >
              <ActionIcon name="trash" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.bulletAddButton}
          onClick={() => onChange({ ...entry, bullets: [...entry.bullets, ""] })}
        >
          <span className={styles.addQuickButton} aria-hidden="true">
            <ActionIcon name="plus" />
          </span>
          Bullet
        </button>
      </div>
    </div>
  );
}

// block content

function BlockContent({
  block,
  onUpdate
}: {
  block: ResumeBlock;
  onUpdate: (b: ResumeBlock) => void;
}) {
  switch (block.type) {
    case "heading": {
      const inputClass =
        block.level === 1
          ? styles.nameInput
          : `${styles.sectionInput} ${block.level === 3 ? styles.subsectionInput : ""}`;

      return (
        <div className={styles.headingEdit}>
          <select
            className={styles.levelSelect}
            value={block.level}
            onChange={(e) => onUpdate({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}
            aria-label="Heading level"
          >
            <option value={1}>H1</option>
            <option value={2}>H2</option>
            <option value={3}>H3</option>
          </select>
          <input
            className={`${styles.plainInput} ${inputClass}`}
            value={block.text}
            onChange={(e) => onUpdate({ ...block, text: e.target.value })}
            placeholder="Heading text"
          />
        </div>
      );
    }

    case "paragraph":
      return (
        <AutoResizeTextarea
          className={`${styles.plainTextarea} ${styles.paragraphInput}`}
          value={block.text}
          onChange={(e) => onUpdate({ ...block, text: e.target.value })}
          placeholder="Paragraph text"
        />
      );

    case "labeled_text":
      return (
        <div className={styles.labeledEdit}>
          <input
            className={`${styles.plainInput} ${styles.labelInput}`}
            value={block.label}
            onChange={(e) => onUpdate({ ...block, label: e.target.value })}
            placeholder="Label"
          />
          <span aria-hidden="true">:</span>
          <AutoResizeTextarea
            className={`${styles.plainTextarea} ${styles.labeledTextArea}`}
            value={block.text}
            onChange={(e) => onUpdate({ ...block, text: e.target.value })}
            placeholder="Text"
          />
        </div>
      );

    case "bullet_list":
      return (
        <div className={styles.bulletEditList}>
          {block.items.map((item, i) => (
            <div key={i} className={styles.bulletEditRow}>
              <span aria-hidden="true">•</span>
              <AutoResizeTextarea
                className={`${styles.plainTextarea} ${styles.bulletTextArea}`}
                value={item}
                onChange={(e) =>
                  onUpdate({
                    ...block,
                    items: block.items.map((x, j) => (j === i ? e.target.value : x))
                  })
                }
                placeholder="Bullet"
              />
              <button
                type="button"
                className={`${styles.quickButton} ${styles.deleteQuickButton}`}
                onClick={() => onUpdate({ ...block, items: block.items.filter((_, j) => j !== i) })}
                disabled={block.items.length <= 1}
                aria-label="Remove bullet"
                title="Remove bullet"
              >
                <ActionIcon name="trash" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.bulletAddButton}
            onClick={() => onUpdate({ ...block, items: [...block.items, ""] })}
          >
            <span className={styles.addQuickButton} aria-hidden="true">
              <ActionIcon name="plus" />
            </span>
            Bullet
          </button>
        </div>
      );

    case "entry":
      return (
        <EntryEditor entry={block.entry} onChange={(entry) => onUpdate({ ...block, entry })} />
      );

    case "spacer":
      return (
        <select
          className={styles.levelSelect}
          value={block.size}
          onChange={(e) =>
            onUpdate({ ...block, size: e.target.value as "xs" | "sm" | "md" | "lg" })
          }
        >
          {(["xs", "sm", "md", "lg"] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      );

    case "divider":
      return <hr className={styles.dividerEdit} />;
  }
}

type AddBlockControlsProps = {
  onAdd: (kind: AddBlockKind) => void;
};

export const addBlockKindsForZone = (zone: ClassicCompactEditorZone) =>
  addBlockKinds.filter((kind) =>
    zone === "header"
      ? kind.id === "headline" || kind.id === "header_text"
      : kind.id !== "headline" && kind.id !== "header_text"
  );

function AddBlockControls({ onAdd }: AddBlockControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className={styles.zoneAdd}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        type="button"
        className={styles.zoneAddButton}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <ActionIcon name="plus" />
        Add block
      </button>
      {isOpen && (
        <div className={styles.zoneAddMenu} role="menu" aria-label="Add block">
          {addBlockKinds.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={styles.zoneAddChoice}
              onClick={() => {
                onAdd(choice.id);
                setIsOpen(false);
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type BlockFrameProps = {
  block: ResumeBlock;
  atsIssues: AtsIssue[];
  onUpdate: (b: ResumeBlock) => void;
  onRemove: () => void;
  onAddAfter: (kind: AddBlockKind) => void;
  onMove: (direction: MoveDirection) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
};

function BlockFrame({
  block,
  atsIssues,
  onUpdate,
  onRemove,
  onAddAfter,
  onMove,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onDragOver,
  onDrop
}: BlockFrameProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const runAction = (action: () => void) => {
    action();
    setActionsOpen(false);
  };

  return (
    <div
      className={`${styles.editBlock} ${!block.visible ? styles.hiddenBlock : ""} ${
        atsIssues.some((issue) => issue.severity === "error") ? styles.atsBlockError : ""
      }`}
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div
        className={`${styles.quickActions} ${actionsOpen ? styles.quickActionsOpen : ""}`}
        role="menu"
        aria-label={`Actions for ${block.type}`}
      >
        <button
          type="button"
          className={styles.menuAction}
          onClick={() => runAction(() => onMove("up"))}
          disabled={!canMoveUp}
        >
          <ActionIcon name="move-up" />
          Move up
        </button>
        <button
          type="button"
          className={styles.menuAction}
          onClick={() => runAction(() => onMove("down"))}
          disabled={!canMoveDown}
        >
          <ActionIcon name="move-down" />
          Move down
        </button>
        <button
          type="button"
          className={styles.menuAction}
          onClick={() => runAction(() => onUpdate({ ...block, visible: !block.visible }))}
          aria-pressed={!block.visible}
        >
          <ActionIcon name={block.visible ? "hide" : "show"} />
          {block.visible ? "Hide block" : "Show block"}
        </button>
        <div className={styles.menuDivider} />
        <span className={styles.menuLabel}>Add block below</span>
        <div className={styles.menuChoices}>
          {addBlockKindsForZone(block.zone as ClassicCompactEditorZone).map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={styles.menuChoice}
              onClick={() => runAction(() => onAddAfter(choice.id))}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div className={styles.menuDivider} />
        <button
          type="button"
          className={`${styles.menuAction} ${styles.dangerMenuAction}`}
          onClick={() => runAction(onRemove)}
        >
          <ActionIcon name="trash" />
          Delete block
        </button>
      </div>
      <button
        type="button"
        className={styles.dragHandle}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onClick={() => setActionsOpen((open) => !open)}
        aria-expanded={actionsOpen}
        aria-haspopup="menu"
        aria-label="Block actions and drag handle"
        title="Block actions; drag to move"
      >
        <ActionIcon name="grip" />
      </button>
      <div className={styles.blockContent}>
        <BlockContent block={block} onUpdate={onUpdate} />
      </div>
      {atsIssues.length > 0 && (
        <ul className={styles.atsIssues} aria-label="ATS issues for this block">
          {atsIssues.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              className={issue.severity === "error" ? styles.atsIssueError : styles.atsIssueWarning}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type ZoneSurfaceProps = {
  zone: ClassicCompactEditorZone;
  blocks: Array<{ block: ResumeBlock; index: number }>;
  atsIssuesByBlock: Map<string, AtsIssue[]>;
  showEmptyState: boolean;
  onUpdate: (id: string, block: ResumeBlock) => void;
  onRemove: (id: string) => void;
  onAdd: (kind: AddBlockKind, afterIndex?: number) => void;
  onMove: (index: number, direction: MoveDirection) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: (index: number) => void;
};

function ZoneSurface({
  zone,
  blocks,
  atsIssuesByBlock,
  showEmptyState,
  onUpdate,
  onRemove,
  onAdd,
  onMove,
  onDragStart,
  onDragOver,
  onDrop
}: ZoneSurfaceProps) {
  return (
    <section className={`${styles.pageZone} ${styles[`zone-${zone}`]}`} aria-label={`${zone} zone`}>
      {showEmptyState && (
        <div className={styles.emptyState}>
          <ActionIcon name="file" />
          <p>This resume does not have any content yet.</p>
          <span>Add a section heading, an entry, or some text to get started.</span>
        </div>
      )}
      {blocks.map(({ block, index }, zoneIndex) => (
        <BlockFrame
          key={block.id}
          block={block}
          atsIssues={atsIssuesByBlock.get(block.id) ?? []}
          onUpdate={(updated) => onUpdate(block.id, updated)}
          onRemove={() => onRemove(block.id)}
          onAddAfter={(kind) => onAdd(kind, index)}
          onMove={(direction) => onMove(index, direction)}
          canMoveUp={zoneIndex > 0}
          canMoveDown={zoneIndex < blocks.length - 1}
          onDragStart={() => onDragStart(index)}
          onDragOver={() => onDragOver(index)}
          onDrop={() => onDrop(index)}
        />
      ))}
    </section>
  );
}

const safeFilePart = (value: string) =>
  value.trim().replace(/[^\p{Letter}\p{Number}._-]+/gu, "_") || "Resume";

const pdfFileName = (value: string) => `${safeFilePart(value.trim().replace(/\.pdf$/iu, ""))}.pdf`;

const legacyContentTemplatesKey = "cv-builder.content-templates.v1";

const downloadText = (content: string, fileName: string, type: string) => {
  downloadBlob(new Blob([content], { type }), fileName);
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

// main component

export function BlockEditor({ initialBlocks, initialPersonName }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<ResumeBlock[]>(initialBlocks);
  const [personName, setPersonName] = useState(initialPersonName);
  const [documentBase, setDocumentBase] = useState<Resume>(() =>
    createEditorResume(initialPersonName, initialBlocks)
  );
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [lastDeletion, setLastDeletion] = useState<DeletedBlock | null>(null);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [exportPdfFileName, setExportPdfFileName] = useState(() => pdfFileName(initialPersonName));
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [connectedImportState, setConnectedImportState] = useState<ConnectedImportState>({
    kind: "idle"
  });
  const [pendingConnectedImport, setPendingConnectedImport] = useState<PendingImport | null>(null);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [connectPanelOpen, setConnectPanelOpen] = useState(false);
  const [agentPromptCopied, setAgentPromptCopied] = useState(false);
  const [savedDocumentSignature, setSavedDocumentSignature] = useState(() =>
    JSON.stringify(createEditorResume(initialPersonName, initialBlocks))
  );
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [estimatedPageCount, setEstimatedPageCount] = useState(1);
  const paginationProbeRef = useRef<HTMLDivElement>(null);
  const resume = useMemo(
    () => updateEditorResume(documentBase, personName, blocks),
    [blocks, documentBase, personName]
  );
  const atsReport = useMemo(() => analyzeResumeBlocks(blocks), [blocks]);
  const atsIssuesByBlock = useMemo(() => {
    const grouped = new Map<string, AtsIssue[]>();
    for (const issue of atsReport.issues) {
      if (!issue.blockId) continue;
      grouped.set(issue.blockId, [...(grouped.get(issue.blockId) ?? []), issue]);
    }
    return grouped;
  }, [atsReport]);
  const documentAtsIssues = atsReport.issues.filter((issue) => !issue.blockId);
  const hasUnsavedChanges = JSON.stringify(resume) !== savedDocumentSignature;
  const editorIsEmpty = !hasClassicCompactEditorContent(blocks);

  const claimConnectedImport = async (connection: RelayConnection) => {
    setConnectedImportState({ kind: "importing", label: "Importing Connected Builder resume..." });
    const result = await claimRelayMarkdown(connection);
    if (result.kind === "expired") {
      clearRelayConnection(window.sessionStorage);
      setConnectedImportState({ kind: "expired", label: "Connected Builder link has expired" });
      return;
    }
    if (result.kind === "network") {
      setConnectedImportState({
        kind: "error",
        label: "Connected Builder is unavailable. Check your connection and retry.",
        retry: "claim"
      });
      return;
    }
    if (result.kind === "error") {
      clearRelayConnection(window.sessionStorage);
      setConnectedImportState({
        kind: "error",
        label: "Connected Builder could not import this link.",
        retry: null
      });
      return;
    }

    const parsed = importResumeMarkdown(result.markdown);
    if (!parsed.ok) {
      clearRelayConnection(window.sessionStorage);
      setConnectedImportState({
        kind: "error",
        label: "Connected Builder received invalid Markdown. The current document was not changed.",
        retry: null
      });
      return;
    }
    setPendingConnectedImport({
      ...parsed.preview,
      fileName: "Connected Builder Markdown",
      format: "Markdown"
    });
    setConnectedImportState({ kind: "connected", label: "Connected resume is ready to import" });
  };

  const acknowledgeConnectedImport = async (connection: RelayConnection) => {
    const result = await acknowledgeRelayImport({ ...connection, phase: "ack" });
    if (result === "complete") {
      clearRelayConnection(window.sessionStorage);
      setConnectedImportState({ kind: "imported", label: "Connected Builder resume imported" });
      return;
    }
    if (result === "network") {
      setConnectedImportState({
        kind: "error",
        label:
          "Resume imported locally, but Connected Builder could not confirm delivery. Retry acknowledgement.",
        retry: "ack"
      });
      return;
    }
    clearRelayConnection(window.sessionStorage);
    setConnectedImportState({
      kind: "error",
      label: "Resume imported locally, but Connected Builder could not confirm delivery.",
      retry: null
    });
  };

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const saved = readLocalDraft(window.localStorage);
      if (!saved) return;

      setPersonName(saved.person.fullName);
      setBlocks(saved.layoutBlocks);
      setDocumentBase(saved);
      setSavedDocumentSignature(JSON.stringify(saved));
      setStatus({ kind: "success", label: "Loaded from this device" });
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    const fragment = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hasConnectFragment = new URLSearchParams(fragment).has("connect");
    const capability = takeRelayCapabilityFromFragment(window.location, window.history);
    const handle = window.setTimeout(() => {
      try {
        if (hasConnectFragment && !capability) {
          clearRelayConnection(window.sessionStorage);
          setConnectedImportState({
            kind: "error",
            label: "Connected Builder link is invalid.",
            retry: null
          });
          return;
        }
        const connection = capability
          ? { capability, claimNonce: createRelayClaimNonce(), phase: "claim" as const }
          : readRelayConnection(window.sessionStorage);
        if (!connection) return;
        if (capability) writeRelayConnection(window.sessionStorage, connection);
        if (connection.phase === "ack") {
          void acknowledgeConnectedImport(connection);
        } else {
          void claimConnectedImport(connection);
        }
      } catch {
        setConnectedImportState({
          kind: "error",
          label: "Connected Builder could not start this import in this browser.",
          retry: null
        });
      }
    }, 0);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const serviceWorkerUrl = new URL("sw.js", document.baseURI);
    void navigator.serviceWorker.register(serviceWorkerUrl, { scope: "./" });
  }, []);

  useEffect(() => {
    const page = paginationProbeRef.current?.querySelector<HTMLElement>("article");
    if (!page) return;

    const updatePageCount = () =>
      setEstimatedPageCount(getClassicCompactPageCount(Math.max(0, page.scrollHeight - 80)));
    const observer = new ResizeObserver(updatePageCount);

    updatePageCount();
    observer.observe(page);

    return () => observer.disconnect();
  }, []);

  const indexedByZone = useMemo(
    () =>
      classicCompactEditorZones.reduce(
        (acc, zone) => {
          acc[zone] = blocks
            .map((block, index) => ({ block, index }))
            .filter(({ block }) => block.zone === zone);
          return acc;
        },
        {} as Record<ClassicCompactEditorZone, Array<{ block: ResumeBlock; index: number }>>
      ),
    [blocks]
  );

  const clearCompletedStatus = () =>
    setStatus((current) => (current.kind === "success" ? { kind: "idle" } : current));

  const updateBlock = (id: string, updated: ResumeBlock) => {
    clearCompletedStatus();
    if (updated.type === "heading" && updated.level === 1 && updated.zone === "header") {
      setPersonName(updated.text);
    }
    setBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
  };

  const moveBlock = (idx: number, direction: MoveDirection) => {
    clearCompletedStatus();
    setBlocks((prev) => moveWithinZone(prev, idx, direction));
  };

  const dragOverBlock = (idx: number) => {
    if (draggedIndex === null || draggedIndex === idx) return;
    const next = moveToIndexWithinZone(blocks, draggedIndex, idx);
    if (next === blocks) return;

    clearCompletedStatus();
    setBlocks(next);
    setDraggedIndex(idx);
  };

  const dropBlock = () => setDraggedIndex(null);

  const addBlock = (kind: AddBlockKind, afterIndex?: number) => {
    clearCompletedStatus();
    setBlocks((prev) => insertBlockAfter(prev, createBlockFromKind(kind), afterIndex));
  };

  const removeBlock = (id: string) => {
    clearCompletedStatus();
    const result = deleteBlockWithUndo(blocks, id);
    if (!result.deleted) return;

    setBlocks(result.blocks);
    setLastDeletion(result.deleted);
  };

  const undoDelete = () => {
    if (!lastDeletion) return;
    clearCompletedStatus();
    setBlocks((prev) => restoreDeletedBlock(prev, lastDeletion));
    setLastDeletion(null);
  };

  const createFromScratch = () => {
    const starter = createEditorResume("", []);
    setPersonName("");
    setBlocks([]);
    setDocumentBase(starter);
    setSelectedTemplateName("");
    setLastDeletion(null);
    setStatus({ kind: "idle" });
  };

  const saveBlocks = () => {
    const nextBlocks = resume.layoutBlocks;
    setStatus({ kind: "busy", label: "Saving browser draft..." });
    try {
      writeLocalDraft(window.localStorage, resume);
      setBlocks(nextBlocks);
      setDocumentBase(resume);
      setSavedDocumentSignature(JSON.stringify(resume));
      setStatus({ kind: "success", label: "Draft saved in this browser" });
    } catch {
      setStatus({ kind: "error", label: "Browser draft save failed" });
    }
  };

  const replaceDocument = (importedResume: Resume, templateName = "") => {
    setPersonName(importedResume.person.fullName);
    setBlocks(importedResume.layoutBlocks);
    setDocumentBase(importedResume);
    setSelectedTemplateName(templateName);
    setLastDeletion(null);
    setStatus({ kind: "success", label: "Local document imported" });
  };

  const confirmConnectedImport = () => {
    if (!pendingConnectedImport) return;
    const connection = readRelayConnection(window.sessionStorage);
    if (!connection) {
      setPendingConnectedImport(null);
      setConnectedImportState({ kind: "expired", label: "Connected Builder link has expired" });
      return;
    }
    replaceDocument(pendingConnectedImport.resume);
    setPendingConnectedImport(null);
    const acknowledgement = { ...connection, phase: "ack" as const };
    writeRelayConnection(window.sessionStorage, acknowledgement);
    void acknowledgeConnectedImport(acknowledgement);
  };

  const cancelConnectedImport = () => {
    clearRelayConnection(window.sessionStorage);
    setPendingConnectedImport(null);
    setConnectedImportState({
      kind: "error",
      label: "Connected Builder import was cancelled. The link will expire.",
      retry: null
    });
  };

  const retryConnectedImport = () => {
    const connection = readRelayConnection(window.sessionStorage);
    if (!connection || connectedImportState.kind !== "error" || !connectedImportState.retry) return;
    if (connectedImportState.retry === "ack") void acknowledgeConnectedImport(connection);
    else void claimConnectedImport(connection);
  };

  const applyTemplate = (name: string) => {
    const match = builtInContentTemplates.find((template) => template.name === name);
    if (!match) return;

    replaceDocument(createResumeFromContentTemplate(match), match.name);
    setStatus({ kind: "success", label: `Applied “${match.name}”` });
  };

  const resetDocument = () => {
    const template = builtInContentTemplates.find((item) => item.name === selectedTemplateName);
    if (template) {
      replaceDocument(createResumeFromContentTemplate(template), template.name);
      setStatus({ kind: "success", label: `Reset to “${template.name}”` });
    } else {
      createFromScratch();
      setStatus({ kind: "success", label: "Document reset" });
    }
    setResetConfirmationOpen(false);
  };

  const openExportPanel = () => {
    setExportPdfFileName(pdfFileName(resume.person.fullName));
    setExportPanelOpen(true);
  };

  const downloadPdf = async () => {
    setStatus({ kind: "busy", label: "Building PDF" });
    try {
      const fontBaseUrl = new URL("fonts/pt-serif-pdf/", document.baseURI).toString();
      const blob = await renderResumePdfBlob({ fontBaseUrl, resume });
      downloadBlob(blob, pdfFileName(exportPdfFileName));
      setStatus({ kind: "success", label: "PDF downloaded" });
    } catch {
      setStatus({ kind: "error", label: "PDF export failed" });
    }
  };

  const exportFile = (format: "Markdown" | "JSON") => {
    try {
      const name = safeFilePart(resume.person.fullName);
      if (format === "Markdown") {
        downloadText(exportResumeMarkdown(resume), `${name}.md`, "text/markdown;charset=utf-8");
      } else {
        downloadText(
          exportResumeJson(resume),
          `${name}.cv-builder.json`,
          "application/json;charset=utf-8"
        );
      }
      setStatus({ kind: "success", label: `Exported ${format}` });
    } catch {
      setStatus({ kind: "error", label: "Export failed" });
    }
  };

  const clearLocalData = () => {
    removeLocalDraft(window.localStorage);
    window.localStorage.removeItem(legacyContentTemplatesKey);
    setSavedDocumentSignature("");
    setClearConfirmationOpen(false);
    setStatus({ kind: "success", label: "Local data cleared" });
  };

  const copyAgentSetupPrompt = async () => {
    try {
      await navigator.clipboard.writeText(CONNECTED_BUILDER_SETUP_PROMPT);
      setAgentPromptCopied(true);
    } catch {
      setAgentPromptCopied(false);
      setStatus({ kind: "error", label: "Copy failed in this browser" });
    }
  };

  const isBusy = status.kind === "busy";
  const hasCleanBlocks = resume.layoutBlocks.length > 0;
  const connectionOverridesStatus = connectedImportState.kind !== "idle";
  const statusLabel = connectionOverridesStatus
    ? connectedImportState.label
    : status.kind === "idle"
      ? hasUnsavedChanges
        ? "Unsaved changes"
        : "All changes saved"
      : status.label;
  const statusClass = connectionOverridesStatus
    ? connectedImportState.kind === "error" || connectedImportState.kind === "expired"
      ? styles.statusError
      : connectedImportState.kind === "importing"
        ? styles.statusBusy
        : styles.statusSuccess
    : status.kind === "error"
      ? styles.statusError
      : status.kind === "success"
        ? styles.statusSuccess
        : status.kind === "busy"
          ? styles.statusBusy
          : hasUnsavedChanges
            ? styles.statusDirty
            : styles.statusSaved;
  const atsSummary = `${atsReport.errorCount} ${
    atsReport.errorCount === 1 ? "error" : "errors"
  } · ${atsReport.warningCount} ${atsReport.warningCount === 1 ? "warning" : "warnings"}`;

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarSources}>
          <label className={styles.compactField}>
            <span>Template</span>
            <select
              className={styles.select}
              value={selectedTemplateName}
              onChange={(event) => {
                if (!event.target.value) {
                  createFromScratch();
                  return;
                }
                applyTemplate(event.target.value);
              }}
              aria-label="Choose a template"
            >
              <option value="">Custom</option>
              {builtInContentTemplates.map((template) => (
                <option value={template.name} key={template.name}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={`${styles.statusDisplay} ${statusClass}`} role="status" aria-live="polite">
          {isBusy || connectedImportState.kind === "importing" ? (
            <span className={styles.statusSpinner} aria-hidden="true" />
          ) : null}
          <span>{statusLabel}</span>
          {connectedImportState.kind === "error" && connectedImportState.retry ? (
            <button className={styles.statusRetry} type="button" onClick={retryConnectedImport}>
              Retry
            </button>
          ) : null}
        </div>

        <div className={styles.toolbarActions}>
          <button
            className={styles.btn}
            onClick={() => setResetConfirmationOpen(true)}
            disabled={isBusy}
          >
            Reset
          </button>
          <button className={styles.btn} onClick={() => setImportPanelOpen(true)} disabled={isBusy}>
            Import
          </button>
          <button className={styles.btn} onClick={saveBlocks} disabled={isBusy || !hasCleanBlocks}>
            Save draft in browser
          </button>
          <button
            className={styles.btnPrimary}
            onClick={openExportPanel}
            disabled={isBusy || !hasCleanBlocks}
          >
            Export
          </button>
          <PdfInspector disabled={isBusy} />
          <button
            className={styles.btn}
            onClick={() => setConnectPanelOpen(true)}
            disabled={isBusy}
          >
            Connect agent
          </button>
          <button
            className={styles.helpButton}
            type="button"
            onClick={() => setHelpOpen(true)}
            aria-label="Help and privacy"
            title="Help and privacy"
          >
            ?
          </button>
          <button
            className={styles.btn}
            onClick={() => setClearConfirmationOpen(true)}
            disabled={isBusy}
          >
            Clear local data
          </button>
        </div>

        {isBusy && (
          <div className={styles.progressTrack} aria-hidden="true">
            <span />
          </div>
        )}
      </div>

      {lastDeletion && (
        <div className={styles.undoNotice} role="status">
          <ActionIcon name="trash" />
          <span>Block deleted</span>
          <button type="button" className={styles.undoButton} onClick={undoDelete}>
            Undo
          </button>
        </div>
      )}

      {helpOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.helpModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-heading"
          >
            <div className={styles.modalHeading}>
              <h2 id="help-heading">Help and privacy</h2>
              <button className={styles.btn} type="button" onClick={() => setHelpOpen(false)}>
                Close
              </button>
            </div>
            <div className={styles.helpContent}>
              <section>
                <h3>Your data stays with you</h3>
                <p>
                  Your resume is not uploaded by this editor. Edits stay in browser memory. A draft
                  is stored in this browser only when you choose “Save draft in browser”.
                </p>
              </section>
              <section>
                <h3>Templates and files</h3>
                <p>
                  Built-in templates only replace the current editor blocks. Keep reusable resumes
                  as Markdown or JSON files on your device and import them when needed.
                </p>
                <p>
                  Import limits: Markdown {PUBLIC_FILE_LIMITS.markdown.label}, JSON{" "}
                  {PUBLIC_FILE_LIMITS.json.label}, plain text {PUBLIC_FILE_LIMITS.plainText.label}.
                </p>
              </section>
              <section>
                <h3>PDF export and check</h3>
                <p>
                  Export builds and downloads a text-based PDF directly in this browser; it does not
                  use a system PDF printer. “Check finished PDF” extracts text locally without
                  uploading or saving the PDF. Limit: {PUBLIC_FILE_LIMITS.pdf.label} and{" "}
                  {PDF_INSPECTION_LIMITS.pages} pages.
                </p>
              </section>
              <section>
                <h3>Connect to your agent</h3>
                <p>
                  You can ask an AI agent (Claude, Codex, or any MCP client) to draft your resume.
                  The agent prepares the document and hands you a one-time link; opening it here
                  fills the editor with the imported content after you confirm. Editing, ATS checks,
                  and PDF export stay local.
                </p>
                <p>
                  Use the “Connect agent” button in the toolbar to copy the endpoint and a
                  ready-to-paste setup prompt for your agent. The relay holds one Markdown payload
                  for 5 minutes and deletes it after your import.
                </p>
              </section>
            </div>
          </section>
        </div>
      )}

      <DocumentInterchange
        open={importPanelOpen}
        onClose={() => setImportPanelOpen(false)}
        onReplace={replaceDocument}
      />

      {pendingConnectedImport && (
        <div className={styles.modalBackdrop} role="presentation">
          <ImportPreview
            pending={pendingConnectedImport}
            onReplace={confirmConnectedImport}
            onCancel={cancelConnectedImport}
          />
        </div>
      )}

      <div className={styles.modalBackdrop} role="presentation" hidden={!connectPanelOpen}>
        <section
          className={styles.connectModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-agent-heading"
        >
          <div className={styles.modalHeading}>
            <h2 id="connect-agent-heading">Connect to your agent</h2>
            <button className={styles.btn} type="button" onClick={() => setConnectPanelOpen(false)}>
              Close
            </button>
          </div>
          <div className={styles.helpContent}>
            <section>
              <h3>How it works</h3>
              <p>
                Ask your agent to draft your resume and call its <code>open_builder</code> tool. The
                agent returns a one-time link that is valid for 5 minutes. Open the link in your
                browser, confirm “Replace current document”, and the resume appears here for local
                editing, ATS checks, and PDF export. The relay deletes the document as soon as you
                import it.
              </p>
            </section>
            <section>
              <h3>MCP endpoint</h3>
              <p className={styles.connectEndpoint}>{CONNECTED_BUILDER_MCP_ENDPOINT}</p>
            </section>
            <section>
              <h3>Setup prompt</h3>
              <p>Paste this into a new chat with your agent to wire it up:</p>
              <pre className={styles.connectPrompt}>{CONNECTED_BUILDER_SETUP_PROMPT}</pre>
              <div className={styles.exportActions}>
                <button
                  className={styles.btn}
                  type="button"
                  onClick={() => void copyAgentSetupPrompt()}
                >
                  Copy agent setup prompt
                </button>
                {agentPromptCopied ? <span role="status">Copied</span> : null}
              </div>
            </section>
          </div>
        </section>
      </div>

      <div className={styles.modalBackdrop} role="presentation" hidden={!exportPanelOpen}>
        <section
          className={styles.exportModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-pdf-heading"
        >
          <div className={styles.modalHeading}>
            <h2 id="export-pdf-heading">Export</h2>
            <button className={styles.btn} type="button" onClick={() => setExportPanelOpen(false)}>
              Close
            </button>
          </div>
          <div className={styles.exportActions}>
            <label className={`${styles.compactField} ${styles.exportFilename}`}>
              <span>PDF filename</span>
              <input
                className={styles.input}
                type="text"
                value={exportPdfFileName}
                onChange={(event) => setExportPdfFileName(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
            <button
              className={styles.btnPrimary}
              type="button"
              disabled={isBusy}
              onClick={() => void downloadPdf()}
            >
              Download PDF
            </button>
            <span>
              A4 · estimated {estimatedPageCount} {estimatedPageCount === 1 ? "page" : "pages"}
            </span>
          </div>
          <div className={styles.exportActions}>
            <button className={styles.btn} type="button" onClick={() => exportFile("JSON")}>
              Export JSON backup
            </button>
            <button className={styles.btn} type="button" onClick={() => exportFile("Markdown")}>
              Export Markdown
            </button>
          </div>
          <div className={styles.exportPreview} aria-label="PDF export preview">
            <ScaledPrintPreview>
              <ResumePrintDocument resume={resume} />
            </ScaledPrintPreview>
          </div>
        </section>
      </div>

      {resetConfirmationOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-document-heading"
          >
            <h2 id="reset-document-heading">Reset current document?</h2>
            <p>
              {selectedTemplateName
                ? `This restores the original “${selectedTemplateName}” content.`
                : "This clears the Custom document."}{" "}
              Unsaved changes in the editor will be lost.
            </p>
            <div className={styles.exportActions}>
              <button className={styles.dangerButton} type="button" onClick={resetDocument}>
                Reset
              </button>
              <button
                className={styles.btn}
                type="button"
                onClick={() => setResetConfirmationOpen(false)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      {clearConfirmationOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.confirmModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-local-heading"
          >
            <h2 id="clear-local-heading">Clear saved data from this device?</h2>
            <p>
              This removes the saved browser draft and any templates left by older versions. The
              current in-memory document stays open until you reload or close the page.
            </p>
            <div className={styles.exportActions}>
              <button className={styles.dangerButton} type="button" onClick={clearLocalData}>
                Clear local data
              </button>
              <button
                className={styles.btn}
                type="button"
                onClick={() => setClearConfirmationOpen(false)}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      )}

      <div className={styles.pageScroller}>
        <div className={styles.pagePreview}>
          <div className={styles.pageEstimate} role="status" aria-live="polite">
            <span>A4 editor preview</span>
            <div className={styles.previewStatusGroup}>
              <strong
                className={atsReport.issues.length === 0 ? styles.atsPassed : styles.atsNeedsWork}
              >
                ATS: {atsReport.issues.length === 0 ? "no issues" : atsSummary}
              </strong>
              <strong>
                PDF estimate: {estimatedPageCount} {estimatedPageCount === 1 ? "page" : "pages"}
              </strong>
            </div>
          </div>
          {documentAtsIssues.length > 0 && (
            <aside className={styles.documentAtsIssues} aria-label="Document ATS issues">
              <strong>ATS check</strong>
              <ul>
                {documentAtsIssues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>{issue.message}</li>
                ))}
              </ul>
            </aside>
          )}
          <article className={styles.pageSurface} aria-label="Editable A4 resume page">
            {classicCompactEditorZones.map((zone) => (
              <ZoneSurface
                key={zone}
                zone={zone}
                blocks={indexedByZone[zone]}
                atsIssuesByBlock={atsIssuesByBlock}
                showEmptyState={zone === "main" && editorIsEmpty}
                onUpdate={updateBlock}
                onRemove={removeBlock}
                onAdd={addBlock}
                onMove={moveBlock}
                onDragStart={setDraggedIndex}
                onDragOver={dragOverBlock}
                onDrop={dropBlock}
              />
            ))}
            <AddBlockControls onAdd={addBlock} />
          </article>
        </div>
      </div>

      <div ref={paginationProbeRef} className={styles.paginationProbe} aria-hidden="true">
        <ResumePrintDocument resume={resume} />
      </div>
    </div>
  );
}

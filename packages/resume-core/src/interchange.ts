import { z } from "zod";
import { isSafeHttpUrl } from "./safe-url";
import { flattenResumeBlocks } from "./block-model";
import { countResumeBlocks } from "./block-tree";
import {
  resumeIconSchema,
  resumeSchema,
  type Resume,
  type ResumeBlock,
  type ResumeLink,
  type ResumeZone
} from "./schema";

export const RESUME_INTERCHANGE_SCHEMA_VERSION = "cv-builder/v1" as const;

export const resumeInterchangeSchema = z.object({
  schema: z.literal(RESUME_INTERCHANGE_SCHEMA_VERSION),
  resume: resumeSchema
});

export type ResumeInterchange = z.infer<typeof resumeInterchangeSchema>;

export type ImportWarning = {
  code:
    | "unsupported-markdown"
    | "raw-html"
    | "unsafe-link"
    | "metadata"
    | "plain-text-structure"
    | "legacy-json";
  line: number;
  message: string;
};

export type ResumeImportPreview = {
  resume: Resume;
  language: Resume["language"];
  blockCount: number;
  warnings: ImportWarning[];
};

export type ResumeImportResult =
  | { ok: true; preview: ResumeImportPreview }
  | { ok: false; error: string };

const entryFields = ["Subtitle", "Start", "End", "Location", "Description", "Link"] as const;
type EntryField = (typeof entryFields)[number];

const emptyResume = (
  language: Resume["language"],
  fullName: string,
  blocks: ResumeBlock[],
  layout?: Resume["layout"]
): Resume =>
  resumeSchema.parse({
    language,
    layout,
    person: { fullName, links: [] },
    experience: [],
    education: [],
    projects: [],
    skills: [],
    languages: [],
    certificates: [],
    customSections: [],
    layoutBlocks: blocks
  });

const importBlockId = (index: number) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `import-${Date.now()}-${index}`;

export const isSafeMarkdownUrl = isSafeHttpUrl;

const escapeMarkdown = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("`", "\\`")
    .replaceAll("~", "\\~")
    .replaceAll("#", "\\#")
    .replaceAll("+", "\\+")
    .replaceAll("-", "\\-")
    .replaceAll("<", "\\<")
    .replaceAll(">", "\\>")
    .replace(/\r?\n/g, " ")
    .replace(
      /^:::(?=\s+(?:columns|column|endcolumn|endcolumns|table|endtable|pagebreak)\b)/,
      "\\:::"
    );

const blockAttributeGroup = /\s*\{([^{}]*)\}\s*$/;
const alignValues = ["left", "center", "right"] as const;

type ParsedBlockAttributes = {
  text: string;
  zone?: ResumeZone;
  align?: (typeof alignValues)[number];
  icon?: ResumeBlockIcon;
  columns?: 1 | 2;
  underline?: boolean;
  uppercase?: boolean;
  bold?: boolean;
};

type ResumeBlockIcon = NonNullable<Extract<ResumeBlock, { type: "heading" }>["icon"]>;

const parseBlockAttributes = (value: string): ParsedBlockAttributes => {
  const match = blockAttributeGroup.exec(value);
  if (
    !match ||
    !/^(?:(?:zone|align|icon|columns|underline|uppercase|bold)=[\w:-]+\s*)+$/.test(match[1])
  ) {
    return { text: value };
  }

  const attributes = new Map<string, string>();
  for (const part of match[1].split(/\s+/)) {
    const [key, rawValue] = part.split("=");
    if (key && rawValue && !attributes.has(key)) attributes.set(key, rawValue);
  }

  const rawAlign = attributes.get("align");
  const rawZone = attributes.get("zone");
  const zone = ["header", "sidebar", "main", "footer"].find(
    (candidate) => candidate === rawZone
  ) as ResumeZone | undefined;
  const align = alignValues.find((candidate) => candidate === rawAlign);
  const rawIcon = attributes.get("icon");
  const icon = resumeIconSchema.options.find((candidate) => candidate === rawIcon);
  const rawColumns = attributes.get("columns");
  const columns = rawColumns === "2" ? 2 : rawColumns === "1" ? 1 : undefined;

  return {
    text: value.slice(0, match.index).trimEnd(),
    ...(zone ? { zone } : {}),
    ...(align ? { align } : {}),
    ...(icon ? { icon } : {}),
    ...(columns ? { columns } : {}),
    ...Object.fromEntries(
      ["underline", "uppercase", "bold"].flatMap(
        (key): Array<[string, boolean]> =>
          attributes.get(key) === "true"
            ? [[key, true]]
            : attributes.get(key) === "false"
              ? [[key, false]]
              : []
      )
    )
  };
};

const serializeBlockAttributes = (
  attributes: Array<string | { key: string; value: string | number | boolean | undefined }>
) => {
  const parts = attributes
    .map((attribute) =>
      typeof attribute === "string" ? attribute : `${attribute.key}=${attribute.value}`
    )
    .filter((part) => !part.endsWith("=undefined"));
  return parts.length > 0 ? `{${parts.join(" ")}}` : "";
};

const unescapeMarkdown = (value: string) => value.replace(/\\([\\[\]*<>_`~#+:|\-])/g, "$1").trim();

const serializeLinkedText = (text: string, links?: ResumeLink[]) => {
  const safeLinks = (links ?? []).filter((link) => isSafeMarkdownUrl(link.url));
  const placements: Array<{ start: number; end: number; link: ResumeLink }> = [];
  let cursor = 0;

  for (const link of safeLinks) {
    const start = text.indexOf(link.label, cursor);
    if (start === -1) continue;
    placements.push({ start, end: start + link.label.length, link });
    cursor = start + link.label.length;
  }

  if (placements.length === 0) return escapeMarkdown(text);

  let result = "";
  cursor = 0;
  for (const placement of placements) {
    result += escapeMarkdown(text.slice(cursor, placement.start));
    result += `[${escapeMarkdown(placement.link.label)}](${placement.link.url})`;
    cursor = placement.end;
  }
  return result + escapeMarkdown(text.slice(cursor));
};

const parseLinkedText = (
  source: string,
  line: number,
  warnings: ImportWarning[]
): { text: string; links?: ResumeLink[] } => {
  const links: ResumeLink[] = [];
  const text = source.replace(
    /\[([^\]]+)]\(([^)\s]+)\)/g,
    (_match, rawLabel: string, url: string) => {
      const label = unescapeMarkdown(rawLabel);
      if (!isSafeMarkdownUrl(url)) {
        warnings.push({
          code: "unsafe-link",
          line,
          message: `Line ${line}: link "${label}" uses an unsafe or invalid URL and was kept as plain text.`
        });
        return label;
      }
      links.push({ label, url });
      return label;
    }
  );

  return { text: unescapeMarkdown(text), links: links.length > 0 ? links : undefined };
};

const fieldMatch = (line: string) => {
  const match = /^\*\*(Subtitle|Start|End|Location|Description|Link):\*\*\s*(.*)$/i.exec(line);
  if (!match) return null;
  const field = entryFields.find((candidate) => candidate.toLowerCase() === match[1].toLowerCase());
  return field ? { field, value: match[2] } : null;
};

const isStructuralLine = (line: string) =>
  /^:::\s*(?:columns|column|endcolumn|endcolumns|table|endtable|pagebreak)\b/.test(line) ||
  /^!\[/.test(line) ||
  /^#{1,3}\s+/.test(line) ||
  /^[-*+]\s+/.test(line) ||
  /^\*\*.+?:\*\*\s*/.test(line) ||
  /^\s*(?:---|\*\s*\*\s*\*)\s*$/.test(line);

const addUnsupportedWarning = (warnings: ImportWarning[], line: number, syntax: string) => {
  warnings.push({
    code: "unsupported-markdown",
    line,
    message: `Line ${line}: ${syntax} is outside the supported Markdown subset and was imported as plain text.`
  });
};

const inspectMarkdownLine = (value: string, line: number, warnings: ImportWarning[]) => {
  if (/(^|[^\\])<\/?[a-zA-Z!][^>]*>/.test(value)) {
    warnings.push({
      code: "raw-html",
      line,
      message: `Line ${line}: raw HTML is never executed and was imported as plain text.`
    });
  }
  const unsupported = unsupportedSyntax(value);
  if (unsupported) addUnsupportedWarning(warnings, line, unsupported);
};

const unsupportedSyntax = (line: string) => {
  if (/^\s*```|^\s*~~~/.test(line)) return "fenced code";
  if (/^\s*>/.test(line)) return "block quotes";
  if (/^\s*\d+[.)]\s+/.test(line)) return "ordered lists";
  if (/^\s*#{4,6}\s+/.test(line)) return "heading levels 4-6";
  if (/^\s*!\[/.test(line)) return "images";
  if (/^\s*\|.*\|\s*$/.test(line)) return "tables";
  if (/^\s*[-*+]\s+\[[ xX]]\s+/.test(line)) return "task lists";
  if (/^\s*(?:=+|-+)\s*$/.test(line) && line.trim() !== "---") return "setext headings";
  const inline = line
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/\[[^\]]+]\([^)\s]+\)/g, "")
    .replace(/^\*\*.+?:\*\*\s*/, "")
    .replace(/\\[\\[\]*<>_`~#+-]/g, "");
  if (/[`_~]/.test(inline) || /(^|[^\\])\*{1,2}/.test(inline)) return "inline formatting";
  if (/!?(?:\[[^\]]*$|\[[^\]]+]\([^)]*$)/.test(inline)) return "malformed links";
  return null;
};

const parseFrontmatter = (
  lines: string[],
  warnings: ImportWarning[]
): {
  bodyStart: number;
  language?: Resume["language"];
  layout?: Resume["layout"];
  error?: string;
} => {
  if (lines[0]?.trim() !== "---") return { bodyStart: 0 };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return { bodyStart: 0, error: "Markdown frontmatter is not closed with ---." };

  let schema: string | undefined;
  let language: Resume["language"] | undefined;
  let layout: Resume["layout"] | undefined;
  for (let index = 1; index < end; index += 1) {
    const match = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(lines[index].trim());
    if (!match) {
      warnings.push({
        code: "metadata",
        line: index + 1,
        message: `Line ${index + 1}: unrecognized frontmatter line was ignored.`
      });
      continue;
    }
    if (match[1] === "schema") schema = match[2];
    else if (
      match[1] === "language" &&
      (match[2] === "en" || match[2] === "ru" || match[2] === "ja")
    ) {
      language = match[2];
    } else if (match[1] === "layout" && (match[2] === "one-column" || match[2] === "two-column")) {
      layout = match[2];
    } else {
      warnings.push({
        code: "metadata",
        line: index + 1,
        message: `Line ${index + 1}: unsupported frontmatter property "${match[1]}" was ignored.`
      });
    }
  }

  if (schema !== RESUME_INTERCHANGE_SCHEMA_VERSION) {
    return {
      bodyStart: end + 1,
      error: 'Markdown frontmatter must contain "schema: cv-builder/v1".'
    };
  }
  return { bodyStart: end + 1, language, layout };
};

export function importResumeMarkdown(source: string, nesting = 0): ResumeImportResult {
  if (nesting > 16) return { ok: false, error: "Column nesting exceeds 16 levels." };
  if (!source.trim()) return { ok: false, error: "Markdown file is empty." };

  const lines = source
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .split("\n");
  const warnings: ImportWarning[] = [];
  const frontmatter = parseFrontmatter(lines, warnings);
  if (frontmatter.error) return { ok: false, error: frontmatter.error };

  const body = lines.slice(frontmatter.bodyStart);
  const detectedLanguage =
    frontmatter.language ??
    (/\p{Script=Cyrillic}/u.test(body.join("\n"))
      ? "ru"
      : /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(body.join("\n"))
        ? "ja"
        : "en");
  const blocks: ResumeBlock[] = [];
  let mainStarted = false;
  let index = 0;

  const addBlock = (
    block: Omit<ResumeBlock, "id" | "zone" | "visible">,
    zone?: ResumeBlock["zone"]
  ) => {
    blocks.push({
      ...block,
      id: importBlockId(blocks.length),
      zone: zone ?? (mainStarted ? "main" : "header"),
      visible: true
    } as ResumeBlock);
  };

  const parseZoneAttribute = (value: string | undefined): ResumeBlock["zone"] | undefined =>
    value === "header" || value === "sidebar" || value === "main" || value === "footer"
      ? value
      : undefined;

  while (index < body.length) {
    const rawLine = body[index];
    const line = rawLine.trim();
    const sourceLine = frontmatter.bodyStart + index + 1;
    if (!line) {
      index += 1;
      continue;
    }

    const pageBreak = /^::: pagebreak\{zone=(header|sidebar|main|footer)\}$/.exec(line);
    if (pageBreak) {
      addBlock({ type: "page_break" }, pageBreak[1] as ResumeZone);
      index += 1;
      continue;
    }
    const table =
      /^::: table\{zone=(header|sidebar|main|footer) widths=([^ }]+)(?: align=(left|center|right))?\}$/.exec(
        line
      );
    if (table) {
      const widths = table[2].split(",").map(Number);
      const rows: string[][] = [];
      let header = false;
      index += 1;
      while (index < body.length && body[index].trim() !== "::: endtable") {
        const row = body[index].trim();
        if (!row) {
          index += 1;
          continue;
        }
        if (!row.startsWith("|") || !row.endsWith("|"))
          return { ok: false, error: "Table rows must start and end with |." };
        const cells: string[] = [];
        let cell = "";
        for (let position = 1; position < row.length - 1; position += 1) {
          const char = row[position];
          if (char === "\\" && position + 1 < row.length - 1) {
            cell += char + row[++position];
          } else if (char === "|") {
            cells.push(cell.trim());
            cell = "";
          } else cell += char;
        }
        cells.push(cell.trim());
        if (cells.length !== widths.length)
          return { ok: false, error: "Table row has the wrong number of cells." };
        if (rows.length === 1 && !header && cells.every((value) => /^---+$/.test(value)))
          header = true;
        else
          rows.push(
            cells.map((value) =>
              value
                .split(/(?<!\\)<br>/)
                .map(unescapeMarkdown)
                .join("\n")
            )
          );
        index += 1;
      }
      if (body[index]?.trim() !== "::: endtable")
        return { ok: false, error: "Table is missing ::: endtable." };
      addBlock(
        { type: "table", widths, rows, header, ...(table[3] ? { align: table[3] } : {}) } as Omit<
          ResumeBlock,
          "id" | "zone" | "visible"
        >,
        table[1] as ResumeZone
      );
      mainStarted = true;
      index += 1;
      continue;
    }
    if (/^:::\s*(?:table|endtable|pagebreak)\b/.test(line))
      return { ok: false, error: `Unexpected table or page break marker at line ${sourceLine}.` };

    const container = /^::: columns(?:\{zone=(header|sidebar|main|footer)\})?$/.exec(line);
    if (container) {
      const columns: Extract<ResumeBlock, { type: "columns" }>["columns"] = [];
      index += 1;
      while (index < body.length && body[index].trim() !== "::: endcolumns") {
        if (!body[index].trim()) {
          index += 1;
          continue;
        }
        const column = /^::: column width=(\S+)$/.exec(body[index].trim());
        if (!column || !Number.isFinite(Number(column[1])) || Number(column[1]) <= 0)
          return {
            ok: false,
            error: `Invalid column at line ${frontmatter.bodyStart + index + 1}.`
          };
        const start = ++index;
        let depth = 0;
        while (index < body.length) {
          const marker = body[index].trim();
          if (/^::: columns(?:\{|$)/.test(marker)) depth += 1;
          if (marker === "::: endcolumns") {
            if (depth === 0) break;
            depth -= 1;
          }
          if (marker === "::: endcolumn" && depth === 0) break;
          index += 1;
        }
        if (body[index]?.trim() !== "::: endcolumn")
          return { ok: false, error: "Column is missing ::: endcolumn." };
        const content = body.slice(start, index).join("\n");
        let children: ResumeBlock[] = [];
        if (content.trim()) {
          const parsed = importResumeMarkdown(
            `---\nschema: cv-builder/v1\nlanguage: ${detectedLanguage}\n---\n${content}`,
            nesting + 1
          );
          if (!parsed.ok) return parsed;
          children = parsed.preview.resume.layoutBlocks;
          warnings.push(
            ...parsed.preview.warnings.map((warning) => ({
              ...warning,
              line: warning.line + frontmatter.bodyStart + start - 4
            }))
          );
        }
        columns.push({ width: Number(column[1]), blocks: children });
        index += 1;
      }
      if (body[index]?.trim() !== "::: endcolumns")
        return { ok: false, error: "Columns block is missing ::: endcolumns." };
      const parentId = importBlockId(blocks.length);
      const rename = (children: ResumeBlock[], prefix: string): ResumeBlock[] =>
        children.map((child, childIndex) =>
          child.type === "columns"
            ? {
                ...child,
                id: `${prefix}-${childIndex}`,
                columns: child.columns.map((column, columnIndex) => ({
                  ...column,
                  blocks: rename(column.blocks, `${prefix}-${childIndex}-${columnIndex}`)
                }))
              }
            : { ...child, id: `${prefix}-${childIndex}` }
        );
      addBlock(
        {
          type: "columns",
          columns: columns.map((column, columnIndex) => ({
            ...column,
            blocks: rename(column.blocks, `${parentId}-col-${columnIndex}`)
          }))
        } as Omit<ResumeBlock, "id" | "zone" | "visible">,
        (container[1] as ResumeZone | undefined) ?? "main"
      );
      mainStarted = true;
      index += 1;
      continue;
    }
    if (/^:::\s*(?:columns|column|endcolumn|endcolumns)\b/.test(line))
      return { ok: false, error: `Unexpected column marker at line ${sourceLine}.` };

    const image = /^!\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)\s*(?:\{([^{}]*)\})?\s*$/.exec(line);
    if (image) {
      const imageAttributes = new Map<string, string>();
      for (const part of (image[3] ?? "").split(/\s+/)) {
        const [key, rawValue] = part.split("=");
        if (key && rawValue && !imageAttributes.has(key)) imageAttributes.set(key, rawValue);
      }
      const width = Number(imageAttributes.get("width"));
      const height = Number(imageAttributes.get("height"));
      const shape = imageAttributes.get("shape");
      const placement = imageAttributes.get("placement");
      addBlock(
        {
          type: "image",
          src: image[2] ?? "",
          alt: unescapeMarkdown(image[1] ?? "") || "Photo",
          ...(Number.isInteger(width) && width > 0 ? { width } : {}),
          ...(Number.isInteger(height) && height > 0 ? { height } : {}),
          ...(shape === "square" || shape === "rounded" || shape === "circle" ? { shape } : {}),
          ...(placement === "left" || placement === "right" || placement === "above"
            ? { placement }
            : {})
        } as Omit<ResumeBlock, "id" | "zone" | "visible">,
        parseZoneAttribute(imageAttributes.get("zone"))
      );
      index += 1;
      continue;
    }

    inspectMarkdownLine(rawLine, sourceLine, warnings);

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      if (level === 2) mainStarted = true;
      const headingAttributes = parseBlockAttributes(heading[2]);
      const parsedTitle = parseLinkedText(headingAttributes.text, sourceLine, warnings);
      if (level === 3) {
        let next = index + 1;
        while (next < body.length && !body[next].trim()) next += 1;
        if (fieldMatch(body[next]?.trim() ?? "")) {
          const entry: Extract<ResumeBlock, { type: "entry" }>["entry"] = {
            title: parsedTitle.text,
            bullets: []
          };
          const links: ResumeLink[] = [];
          index = next;
          while (index < body.length) {
            const entryLine = body[index].trim();
            if (!entryLine) {
              let nextLine = index + 1;
              while (nextLine < body.length && !body[nextLine].trim()) nextLine += 1;
              if (parseBlockAttributes(body[nextLine]?.trim() ?? "").zone) break;
              index += 1;
              continue;
            }
            inspectMarkdownLine(body[index], frontmatter.bodyStart + index + 1, warnings);
            const metadata = fieldMatch(entryLine);
            if (metadata) {
              const parsed = parseLinkedText(
                metadata.value,
                frontmatter.bodyStart + index + 1,
                warnings
              );
              if (metadata.field === "Link") {
                if (parsed.links) links.push(...parsed.links);
                else if (parsed.text) {
                  warnings.push({
                    code: "unsupported-markdown",
                    line: frontmatter.bodyStart + index + 1,
                    message: `Line ${frontmatter.bodyStart + index + 1}: an entry Link field must contain a safe Markdown link.`
                  });
                }
              } else {
                const property = metadata.field.toLowerCase() as Lowercase<
                  Exclude<EntryField, "Link">
                >;
                if (parsed.text) entry[property] = parsed.text;
              }
              index += 1;
              continue;
            }
            const bullet = /^[-*+]\s+(.+)$/.exec(entryLine);
            if (bullet) {
              entry.bullets.push(
                parseLinkedText(bullet[1], frontmatter.bodyStart + index + 1, warnings).text
              );
              index += 1;
              continue;
            }
            break;
          }
          if (links.length > 0) entry.links = links;
          addBlock(
            { type: "entry", entry } as Omit<ResumeBlock, "id" | "zone" | "visible">,
            headingAttributes.zone
          );
          continue;
        }
      }

      addBlock(
        {
          type: "heading",
          level,
          text: parsedTitle.text,
          textLinks: parsedTitle.links,
          ...(headingAttributes.align ? { align: headingAttributes.align } : {}),
          ...(headingAttributes.icon ? { icon: headingAttributes.icon } : {}),
          underline: headingAttributes.underline,
          uppercase: headingAttributes.uppercase,
          bold: headingAttributes.bold
        } as Omit<ResumeBlock, "id" | "zone" | "visible">,
        headingAttributes.zone
      );
      index += 1;
      continue;
    }

    const lineAttributes = parseBlockAttributes(line);
    if (/^(?:---|\*\s*\*\s*\*)$/.test(lineAttributes.text)) {
      addBlock(
        { type: "divider" } as Omit<ResumeBlock, "id" | "zone" | "visible">,
        lineAttributes.zone
      );
      index += 1;
      continue;
    }

    const labeled = /^\*\*(.+?):\*\*\s+(.+)$/.exec(line);
    if (labeled) {
      const labeledAttributes = parseBlockAttributes(labeled[2]);
      const parsed = parseLinkedText(labeledAttributes.text, sourceLine, warnings);
      addBlock(
        {
          type: "labeled_text",
          label: unescapeMarkdown(labeled[1]),
          text: parsed.text,
          textLinks: parsed.links,
          ...(labeledAttributes.align ? { align: labeledAttributes.align } : {})
        } as Omit<ResumeBlock, "id" | "zone" | "visible">,
        labeledAttributes.zone
      );
      index += 1;
      continue;
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      const items: string[] = [];
      const links: ResumeLink[] = [];
      const firstBulletIndex = index;
      let bulletAlign: ParsedBlockAttributes["align"];
      let bulletColumns: ParsedBlockAttributes["columns"];
      let bulletZone: ResumeZone | undefined;
      while (index < body.length) {
        const item = /^[-*+]\s+(.+)$/.exec(body[index].trim());
        if (!item) break;
        if (index !== firstBulletIndex) {
          inspectMarkdownLine(body[index], frontmatter.bodyStart + index + 1, warnings);
        }
        const itemAttributes =
          index === firstBulletIndex ? parseBlockAttributes(item[1]) : undefined;
        const parsed = parseLinkedText(
          itemAttributes?.text ?? item[1],
          frontmatter.bodyStart + index + 1,
          warnings
        );
        if (itemAttributes?.align) bulletAlign = itemAttributes.align;
        if (itemAttributes?.columns) bulletColumns = itemAttributes.columns;
        if (itemAttributes?.zone) bulletZone = itemAttributes.zone;
        items.push(parsed.text);
        if (parsed.links) links.push(...parsed.links);
        index += 1;
      }
      addBlock(
        {
          type: "bullet_list",
          items,
          textLinks: links.length > 0 ? links : undefined,
          ...(bulletAlign ? { align: bulletAlign } : {}),
          ...(bulletColumns ? { columns: bulletColumns } : {})
        } as Omit<ResumeBlock, "id" | "zone" | "visible">,
        bulletZone
      );
      continue;
    }

    const paragraphLines = [rawLine.trim()];
    index += 1;
    while (index < body.length && body[index].trim() && !isStructuralLine(body[index].trim())) {
      paragraphLines.push(body[index].trim());
      index += 1;
    }
    const paragraphAttributes = parseBlockAttributes(paragraphLines[0]);
    if (paragraphAttributes.text === "") {
      paragraphLines.shift();
    } else {
      paragraphLines[0] = paragraphAttributes.text;
    }
    const parsed = parseLinkedText(paragraphLines.join(" "), sourceLine, warnings);
    addBlock(
      {
        type: "paragraph",
        text: parsed.text,
        textLinks: parsed.links,
        ...(paragraphAttributes.align ? { align: paragraphAttributes.align } : {})
      } as Omit<ResumeBlock, "id" | "zone" | "visible">,
      paragraphAttributes.zone
    );
  }

  const parsedBlocks = resumeSchema.shape.layoutBlocks.safeParse(blocks);
  if (!parsedBlocks.success) {
    return {
      ok: false,
      error: `Markdown does not produce a valid document: ${parsedBlocks.error.issues[0]?.message ?? "unknown validation error"}`
    };
  }
  if (parsedBlocks.data.length === 0) {
    return { ok: false, error: "Markdown does not contain any supported resume blocks." };
  }

  const fullName =
    flattenResumeBlocks(parsedBlocks.data).find(
      (block): block is Extract<ResumeBlock, { type: "heading" }> =>
        block.type === "heading" && block.level === 1
    )?.text ?? "Resume";
  const resume = emptyResume(detectedLanguage, fullName, parsedBlocks.data, frontmatter.layout);
  return {
    ok: true,
    preview: {
      resume,
      language: resume.language,
      blockCount: countResumeBlocks(resume.layoutBlocks),
      warnings
    }
  };
}

const serializeEntry = (block: Extract<ResumeBlock, { type: "entry" }>) => {
  const { entry } = block;
  const lines = [
    `### ${escapeMarkdown(entry.title)}{zone=${block.zone}}`,
    `**Subtitle:** ${escapeMarkdown(entry.subtitle ?? "")}`,
    `**Start:** ${escapeMarkdown(entry.start ?? "")}`,
    `**End:** ${escapeMarkdown(entry.end ?? "")}`,
    `**Location:** ${escapeMarkdown(entry.location ?? "")}`,
    `**Description:** ${escapeMarkdown(entry.description ?? "")}`
  ];
  for (const link of entry.links ?? []) {
    if (isSafeMarkdownUrl(link.url))
      lines.push(`**Link:** [${escapeMarkdown(link.label)}](${link.url})`);
  }
  lines.push(...entry.bullets.map((item) => `- ${escapeMarkdown(item)}`));
  return lines.map((line) => line.trimEnd()).join("\n");
};

export function exportResumeMarkdown(resumeInput: Resume): string {
  const resume = resumeSchema.parse(resumeInput);
  const layout =
    resume.layout ??
    (resume.layoutBlocks.some((block) => block.zone === "sidebar") ? "two-column" : "one-column");
  const serializeBlocks = (blocks: ResumeBlock[]): string[] =>
    blocks
      .filter((block) => block.visible)
      .flatMap((block): string[] => {
        switch (block.type) {
          case "page_break":
            return [`::: pagebreak{zone=${block.zone}}`];
          case "table": {
            const rows = block.rows.map(
              (row) =>
                `| ${row.map((cell) => cell.split("\n").map(escapeMarkdown).join("<br>").replaceAll("|", "\\|")).join(" | ")} |`
            );
            if (block.header) rows.splice(1, 0, `| ${block.widths.map(() => "---").join(" | ")} |`);
            return [
              `::: table{zone=${block.zone} widths=${block.widths.join(",")}${block.align ? ` align=${block.align}` : ""}}\n${rows.join("\n")}\n::: endtable`
            ];
          }
          case "columns":
            return [
              `::: columns{zone=${block.zone}}\n\n${block.columns.map((column) => `::: column width=${column.width}\n\n${serializeBlocks(column.blocks).join("\n\n")}\n\n::: endcolumn`).join("\n\n")}\n\n::: endcolumns`
            ];
          case "heading":
            return [
              `${"#".repeat(block.level)} ${serializeLinkedText(block.text, block.textLinks)}${serializeBlockAttributes(
                [
                  `zone=${block.zone}`,
                  { key: "icon", value: block.icon },
                  { key: "align", value: block.align },
                  { key: "underline", value: block.underline },
                  { key: "uppercase", value: block.uppercase },
                  { key: "bold", value: block.bold }
                ]
              )}`
            ];
          case "paragraph":
            return [
              `${serializeLinkedText(block.text, block.textLinks)}${serializeBlockAttributes([
                `zone=${block.zone}`,
                { key: "align", value: block.align }
              ])}`
            ];
          case "labeled_text":
            return [
              `**${escapeMarkdown(block.label)}:** ${serializeLinkedText(block.text, block.textLinks)}${serializeBlockAttributes(
                [`zone=${block.zone}`, { key: "align", value: block.align }]
              )}`
            ];
          case "bullet_list": {
            const [firstItem, ...restItems] = block.items;
            const firstLine = `- ${serializeLinkedText(firstItem, block.textLinks)}${serializeBlockAttributes(
              [
                `zone=${block.zone}`,
                { key: "columns", value: block.columns },
                { key: "align", value: block.align }
              ]
            )}`;
            return [
              [
                firstLine,
                ...restItems.map((item) => `- ${serializeLinkedText(item, block.textLinks)}`)
              ].join("\n")
            ];
          }
          case "divider":
            return [`---{zone=${block.zone}}`];
          case "entry":
            return [serializeEntry(block)];
          case "spacer":
            return [];
          case "image":
            return [
              `![${escapeMarkdown(block.alt)}](${block.src})${serializeBlockAttributes([
                `zone=${block.zone}`,
                { key: "shape", value: block.shape },
                { key: "placement", value: block.placement },
                { key: "width", value: block.width },
                { key: "height", value: block.height }
              ])}`
            ];
        }
      });

  return [
    `---\nschema: ${RESUME_INTERCHANGE_SCHEMA_VERSION}\nlanguage: ${resume.language}\nlayout: ${layout}\n---`,
    ...serializeBlocks(resume.layoutBlocks)
  ]
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}

export function exportResumeJson(resume: Resume): string {
  const interchange: ResumeInterchange = {
    schema: RESUME_INTERCHANGE_SCHEMA_VERSION,
    resume: resumeSchema.parse(resume)
  };
  return `${JSON.stringify(interchange, null, 2)}\n`;
}

export function importResumeJson(source: string): ResumeImportResult {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    return { ok: false, error: "JSON file is not valid JSON." };
  }

  let resume: Resume;
  const warnings: ImportWarning[] = [];
  const isEnvelope =
    typeof value === "object" && value !== null && ("schema" in value || "resume" in value);

  if (isEnvelope) {
    const parsed = resumeInterchangeSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return {
        ok: false,
        error: `JSON backup is not a valid ${RESUME_INTERCHANGE_SCHEMA_VERSION} document: ${path}${issue?.message}.`
      };
    }
    resume = parsed.data.resume;
  } else {
    const parsed = resumeSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return { ok: false, error: `JSON backup is not a valid Resume: ${path}${issue?.message}.` };
    }
    resume = parsed.data;
    warnings.push({
      code: "legacy-json",
      line: 1,
      message: `Legacy unversioned JSON was imported. Export it again to save ${RESUME_INTERCHANGE_SCHEMA_VERSION}.`
    });
  }

  return {
    ok: true,
    preview: {
      resume,
      language: resume.language,
      blockCount: countResumeBlocks(resume.layoutBlocks),
      warnings
    }
  };
}

export function importResumePlainText(source: string): ResumeImportResult {
  const normalized = source
    .replace(/^\uFEFF/, "")
    .replaceAll("\r\n", "\n")
    .trim();
  if (!normalized) return { ok: false, error: "Plain-text file is empty." };

  const lines = normalized.split("\n");
  const firstLineIndex = lines.findIndex((line) => line.trim());
  const fullName = lines[firstLineIndex].trim();
  const rest = lines
    .slice(firstLineIndex + 1)
    .join("\n")
    .trim();
  const paragraphs = rest
    ? rest
        .split(/\n\s*\n+/u)
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const blocks: ResumeBlock[] = [
    {
      id: importBlockId(0),
      type: "heading",
      zone: "header",
      level: 1,
      text: fullName,
      visible: true
    },
    ...paragraphs.map(
      (text, index): ResumeBlock => ({
        id: importBlockId(index + 1),
        type: "paragraph",
        zone: "main",
        text: text.replace(/\s*\n\s*/gu, " "),
        visible: true
      })
    )
  ];
  const language: Resume["language"] = /\p{Script=Cyrillic}/u.test(normalized) ? "ru" : "en";
  const resume = emptyResume(language, fullName, blocks);

  return {
    ok: true,
    preview: {
      resume,
      language,
      blockCount: blocks.length,
      warnings: [
        {
          code: "plain-text-structure",
          line: 1,
          message:
            "Plain text cannot restore sections or entries. The first non-empty line becomes the headline; remaining blank-line-separated paragraphs become main text."
        }
      ]
    }
  };
}

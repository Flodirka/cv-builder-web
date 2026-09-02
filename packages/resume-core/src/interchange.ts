import { z } from "zod";
import { isSafeHttpUrl } from "./safe-url";
import { resumeSchema, type Resume, type ResumeBlock, type ResumeLink } from "./schema";

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
  blocks: ResumeBlock[]
): Resume =>
  resumeSchema.parse({
    language,
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
    .replace(/\r?\n/g, " ");

const unescapeMarkdown = (value: string) => value.replace(/\\([\\[\]*<>_`~#+-])/g, "$1").trim();

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
): { bodyStart: number; language?: Resume["language"]; error?: string } => {
  if (lines[0]?.trim() !== "---") return { bodyStart: 0 };
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return { bodyStart: 0, error: "Markdown frontmatter is not closed with ---." };

  let schema: string | undefined;
  let language: Resume["language"] | undefined;
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
    else if (match[1] === "language" && (match[2] === "en" || match[2] === "ru")) {
      language = match[2];
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
  return { bodyStart: end + 1, language };
};

export function importResumeMarkdown(source: string): ResumeImportResult {
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
    frontmatter.language ?? (/\p{Script=Cyrillic}/u.test(body.join("\n")) ? "ru" : "en");
  const blocks: ResumeBlock[] = [];
  let mainStarted = false;
  let index = 0;

  const addBlock = (block: Omit<ResumeBlock, "id" | "zone" | "visible">) => {
    blocks.push({
      ...block,
      id: importBlockId(blocks.length),
      zone: mainStarted ? "main" : "header",
      visible: true
    } as ResumeBlock);
  };

  while (index < body.length) {
    const rawLine = body[index];
    const line = rawLine.trim();
    const sourceLine = frontmatter.bodyStart + index + 1;
    if (!line) {
      index += 1;
      continue;
    }

    inspectMarkdownLine(rawLine, sourceLine, warnings);

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      if (level === 2) mainStarted = true;
      const parsedTitle = parseLinkedText(heading[2], sourceLine, warnings);

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
          addBlock({ type: "entry", entry } as Omit<ResumeBlock, "id" | "zone" | "visible">);
          continue;
        }
      }

      addBlock({
        type: "heading",
        level,
        text: parsedTitle.text,
        textLinks: parsedTitle.links
      } as Omit<ResumeBlock, "id" | "zone" | "visible">);
      index += 1;
      continue;
    }

    if (/^(?:---|\*\s*\*\s*\*)$/.test(line)) {
      addBlock({ type: "divider" } as Omit<ResumeBlock, "id" | "zone" | "visible">);
      index += 1;
      continue;
    }

    const labeled = /^\*\*(.+?):\*\*\s+(.+)$/.exec(line);
    if (labeled) {
      const parsed = parseLinkedText(labeled[2], sourceLine, warnings);
      addBlock({
        type: "labeled_text",
        label: unescapeMarkdown(labeled[1]),
        text: parsed.text,
        textLinks: parsed.links
      } as Omit<ResumeBlock, "id" | "zone" | "visible">);
      index += 1;
      continue;
    }

    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      const items: string[] = [];
      const links: ResumeLink[] = [];
      const firstBulletIndex = index;
      while (index < body.length) {
        const item = /^[-*+]\s+(.+)$/.exec(body[index].trim());
        if (!item) break;
        if (index !== firstBulletIndex) {
          inspectMarkdownLine(body[index], frontmatter.bodyStart + index + 1, warnings);
        }
        const parsed = parseLinkedText(item[1], frontmatter.bodyStart + index + 1, warnings);
        items.push(parsed.text);
        if (parsed.links) links.push(...parsed.links);
        index += 1;
      }
      addBlock({
        type: "bullet_list",
        items,
        textLinks: links.length > 0 ? links : undefined
      } as Omit<ResumeBlock, "id" | "zone" | "visible">);
      continue;
    }

    const paragraphLines = [rawLine.trim()];
    index += 1;
    while (index < body.length && body[index].trim() && !isStructuralLine(body[index].trim())) {
      paragraphLines.push(body[index].trim());
      index += 1;
    }
    const parsed = parseLinkedText(paragraphLines.join(" "), sourceLine, warnings);
    addBlock({
      type: "paragraph",
      text: parsed.text,
      textLinks: parsed.links
    } as Omit<ResumeBlock, "id" | "zone" | "visible">);
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
    parsedBlocks.data.find(
      (block): block is Extract<ResumeBlock, { type: "heading" }> =>
        block.type === "heading" && block.level === 1
    )?.text ?? "Resume";
  const resume = emptyResume(detectedLanguage, fullName, parsedBlocks.data);
  return {
    ok: true,
    preview: {
      resume,
      language: resume.language,
      blockCount: resume.layoutBlocks.length,
      warnings
    }
  };
}

const serializeEntry = (block: Extract<ResumeBlock, { type: "entry" }>) => {
  const { entry } = block;
  const lines = [
    `### ${escapeMarkdown(entry.title)}`,
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
  return lines.join("\n");
};

export function exportResumeMarkdown(resumeInput: Resume): string {
  const resume = resumeSchema.parse(resumeInput);
  const sections = resume.layoutBlocks
    .filter((block) => block.visible)
    .flatMap((block): string[] => {
      switch (block.type) {
        case "heading":
          return [`${"#".repeat(block.level)} ${serializeLinkedText(block.text, block.textLinks)}`];
        case "paragraph":
          return [serializeLinkedText(block.text, block.textLinks)];
        case "labeled_text":
          return [
            `**${escapeMarkdown(block.label)}:** ${serializeLinkedText(block.text, block.textLinks)}`
          ];
        case "bullet_list":
          return [
            block.items.map((item) => `- ${serializeLinkedText(item, block.textLinks)}`).join("\n")
          ];
        case "divider":
          return ["---"];
        case "entry":
          return [serializeEntry(block)];
        case "spacer":
          return [];
      }
    });

  return [
    `---\nschema: ${RESUME_INTERCHANGE_SCHEMA_VERSION}\nlanguage: ${resume.language}\n---`,
    ...sections
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
      blockCount: resume.layoutBlocks.length,
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

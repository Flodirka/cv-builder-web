import type { ResumeBlock, ResumeEntry } from "./schema";
import { toSafeHttpUrl } from "./safe-url";

export type AtsIssueSeverity = "error" | "warning";

export type AtsIssue = {
  code: string;
  severity: AtsIssueSeverity;
  message: string;
  blockId?: string;
};

export type AtsReport = {
  issues: AtsIssue[];
  errorCount: number;
  warningCount: number;
};

const sectionOrder = new Map<string, number>([
  ["summary", 0],
  ["profile", 0],
  ["about", 0],
  ["о себе", 0],
  ["профиль", 0],
  ["experience", 1],
  ["work experience", 1],
  ["опыт", 1],
  ["опыт работы", 1],
  ["education", 2],
  ["образование", 2],
  ["projects", 3],
  ["проекты", 3],
  ["skills", 4],
  ["навыки", 4],
  ["languages", 5],
  ["языки", 5],
  ["certificates", 6],
  ["certifications", 6],
  ["сертификаты", 6],
  ["additional information", 7],
  ["дополнительно", 7],
  ["дополнительная информация", 7]
]);

const normalizeHeading = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");

const blockText = (block: ResumeBlock) => {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return block.text;
    case "labeled_text":
      return `${block.label}: ${block.text}`;
    case "bullet_list":
      return block.items.join(" ");
    case "entry":
      return [
        block.entry.title,
        block.entry.subtitle,
        block.entry.location,
        block.entry.description,
        ...block.entry.bullets,
        ...(block.entry.links ?? []).map((link) => `${link.label} ${link.url}`)
      ]
        .filter(Boolean)
        .join(" ");
    case "divider":
    case "spacer":
      return "";
  }
};

const hasLetters = (value: string) => /\p{L}/u.test(value);

const emailCandidates = (value: string) =>
  value
    .split(/\s+/u)
    .map((part) => part.replace(/^[<(\[{]+|[>),.;\]}]+$/gu, ""))
    .filter((part) => part.includes("@"));

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value);

const phoneCandidates = (value: string) => value.match(/\+?\d[\d\s().-]{5,}\d/gu) ?? [];

const isValidPhone = (value: string) => {
  const digits = value.replace(/\D/gu, "");
  return digits.length >= 7 && digits.length <= 15;
};

const urlCandidates = (value: string) =>
  (value.match(/(?:https?:\/\/|www\.)[^\s<>()]+/giu) ?? []).map((candidate) =>
    candidate.replace(/[),.;\]}]+$/gu, "")
  );

const isValidUrl = (value: string) => {
  const safeUrl = toSafeHttpUrl(value.startsWith("www.") ? `https://${value}` : value);
  return safeUrl ? new URL(safeUrl).hostname.includes(".") : false;
};

const isValidDateText = (value: string) => {
  const text = value.trim();
  if (!text) return false;
  if (!/\d/u.test(text)) return hasLetters(text);

  const year = text.match(/(?:^|\D)((?:19|20|21)\d{2})(?:\D|$)/u);
  if (!year) return false;

  const monthFirst = text.match(/(?:^|\D)(\d{1,2})[./-]((?:19|20|21)\d{2})(?:\D|$)/u);
  if (monthFirst && Number(monthFirst[1]) > 12) return false;

  const yearFirst = text.match(/(?:^|\D)((?:19|20|21)\d{2})[./-](\d{1,2})(?:\D|$)/u);
  if (yearFirst && Number(yearFirst[2]) > 12) return false;

  return true;
};

const sortableDate = (value: string) => {
  const monthFirst = value.match(/(?:^|\D)(\d{1,2})[./-]((?:19|20|21)\d{2})/u);
  if (monthFirst) return Number(monthFirst[2]) * 12 + Number(monthFirst[1]);

  const yearFirst = value.match(/(?:^|\D)((?:19|20|21)\d{2})(?:[./-](\d{1,2}))?/u);
  if (yearFirst) return Number(yearFirst[1]) * 12 + Number(yearFirst[2] ?? 1);

  return undefined;
};

const isEntryEmpty = (entry: ResumeEntry) =>
  ![
    entry.title,
    entry.subtitle,
    entry.start,
    entry.end,
    entry.location,
    entry.description,
    ...entry.bullets,
    ...(entry.links ?? []).flatMap((link) => [link.label, link.url])
  ].some((value) => value?.trim());

const checkEmptyBlock = (block: ResumeBlock, issues: AtsIssue[]) => {
  const add = (code: string, message: string) =>
    issues.push({ code, severity: "error", message, blockId: block.id });

  switch (block.type) {
    case "heading":
    case "paragraph":
      if (!block.text.trim()) add("empty-block", "Remove this empty block or add text.");
      break;
    case "labeled_text":
      if (!block.label.trim() || !block.text.trim()) {
        add("empty-labeled-text", "Both the label and its text are required.");
      }
      break;
    case "bullet_list":
      if (block.items.length === 0 || block.items.some((item) => !item.trim())) {
        add("empty-bullet", "Remove empty bullets or add text to them.");
      }
      break;
    case "entry":
      if (isEntryEmpty(block.entry)) {
        add("empty-entry", "Remove this empty entry or add its content.");
      } else {
        if (!block.entry.title.trim()) add("missing-entry-title", "Add a title to this entry.");
        if (block.entry.bullets.some((bullet) => !bullet.trim())) {
          add("empty-entry-bullet", "Remove empty bullets or add text to them.");
        }
      }
      break;
    case "divider":
    case "spacer":
      break;
  }
};

const checkEntry = (block: Extract<ResumeBlock, { type: "entry" }>, issues: AtsIssue[]) => {
  const { entry } = block;

  for (const [field, value] of [
    ["start", entry.start],
    ["end", entry.end]
  ] as const) {
    if (value && !isValidDateText(value)) {
      issues.push({
        code: "invalid-date",
        severity: "error",
        message: `Use a clear ${field} date, for example 2024, 05/2024, or a current-date word.`,
        blockId: block.id
      });
    }
  }

  if (entry.start && entry.end) {
    const start = sortableDate(entry.start);
    const end = sortableDate(entry.end);
    if (start !== undefined && end !== undefined && start > end) {
      issues.push({
        code: "reversed-date-range",
        severity: "error",
        message: "The start date must not be later than the end date.",
        blockId: block.id
      });
    }
  }

  for (const link of entry.links ?? []) {
    if (!link.label.trim() || !isValidUrl(link.url)) {
      issues.push({
        code: "invalid-link",
        severity: "error",
        message: "Use a non-empty link label and a complete http(s) URL.",
        blockId: block.id
      });
    }
  }
};

export function analyzeResumeBlocks(blocks: ResumeBlock[]): AtsReport {
  const visibleBlocks = blocks.filter((block) => block.visible);
  const issues: AtsIssue[] = [];
  const fallbackBlockId = visibleBlocks[0]?.id;
  const headerBlocks = visibleBlocks.filter((block) => block.zone === "header");
  const mainBlocks = visibleBlocks.filter((block) => block.zone === "main");
  const nameBlocks = headerBlocks.filter(
    (block): block is Extract<ResumeBlock, { type: "heading" }> =>
      block.type === "heading" && block.level === 1
  );
  const anchorBlockId = nameBlocks[0]?.id ?? headerBlocks[0]?.id ?? fallbackBlockId;
  const contactAnchorBlockId =
    headerBlocks.find((block) => {
      const text = blockText(block);
      return (
        emailCandidates(text).length > 0 ||
        phoneCandidates(text).length > 0 ||
        urlCandidates(text).length > 0
      );
    })?.id ??
    headerBlocks.find((block) => block.type === "paragraph" || block.type === "labeled_text")?.id ??
    anchorBlockId;

  for (const block of visibleBlocks) {
    checkEmptyBlock(block, issues);
    if (block.type === "entry") checkEntry(block, issues);

    for (const link of block.textLinks ?? []) {
      if (!link.label.trim() || !isValidUrl(link.url)) {
        issues.push({
          code: "invalid-link",
          severity: "error",
          message: "Use a non-empty link label and a complete http(s) URL.",
          blockId: block.id
        });
      }
    }

    for (const candidate of urlCandidates(blockText(block))) {
      if (!isValidUrl(candidate)) {
        issues.push({
          code: "invalid-link",
          severity: "error",
          message: "Use a complete http(s) URL.",
          blockId: block.id
        });
      }
    }
  }

  if (nameBlocks.length === 0) {
    issues.push({
      code: "missing-name",
      severity: "error",
      message: "Add the candidate name as an H1 block in the header.",
      blockId: anchorBlockId
    });
  } else {
    if (!hasLetters(nameBlocks[0].text)) {
      issues.push({
        code: "invalid-name",
        severity: "error",
        message: "Use ordinary text for the candidate name.",
        blockId: nameBlocks[0].id
      });
    }
    for (const block of nameBlocks.slice(1)) {
      issues.push({
        code: "duplicate-name",
        severity: "error",
        message: "Keep one H1 name block in the header.",
        blockId: block.id
      });
    }
  }

  const emailMatches = visibleBlocks.flatMap((block) =>
    emailCandidates(blockText(block)).map((candidate) => ({ block, candidate }))
  );
  const validEmails = emailMatches.filter(({ candidate }) => isValidEmail(candidate));
  for (const { block } of emailMatches.filter(({ candidate }) => !isValidEmail(candidate))) {
    issues.push({
      code: "invalid-email",
      severity: "error",
      message: "Correct the email address format.",
      blockId: block.id
    });
  }
  if (validEmails.length === 0) {
    issues.push({
      code: "missing-email",
      severity: "warning",
      message: "Add an email address in the header.",
      blockId: contactAnchorBlockId
    });
  }
  for (const { block } of validEmails.filter(({ block }) => block.zone !== "header")) {
    issues.push({
      code: "misplaced-email",
      severity: "warning",
      message: "Move the email address to the header.",
      blockId: block.id
    });
  }

  const phoneMatches = headerBlocks.flatMap((block) =>
    phoneCandidates(blockText(block)).map((candidate) => ({ block, candidate }))
  );
  for (const { block } of phoneMatches.filter(({ candidate }) => !isValidPhone(candidate))) {
    issues.push({
      code: "invalid-phone",
      severity: "error",
      message: "Correct the phone number format; use 7 to 15 digits.",
      blockId: block.id
    });
  }

  let hasSection = false;
  const sectionHeadings: Array<Extract<ResumeBlock, { type: "heading" }>> = [];
  for (const block of mainBlocks) {
    if (block.type === "heading" && block.level === 2) {
      hasSection = true;
      sectionHeadings.push(block);
    } else if (
      !hasSection &&
      block.type !== "divider" &&
      block.type !== "spacer" &&
      blockText(block).trim()
    ) {
      issues.push({
        code: "content-before-section",
        severity: "warning",
        message: "Add an H2 section heading before this content.",
        blockId: block.id
      });
      hasSection = true;
    }
  }

  const seenHeadings = new Set<string>();
  let highestKnownOrder = -1;
  for (const heading of sectionHeadings) {
    const normalized = normalizeHeading(heading.text);
    if (seenHeadings.has(normalized)) {
      issues.push({
        code: "duplicate-section",
        severity: "warning",
        message: "Merge or rename this duplicate section.",
        blockId: heading.id
      });
    }
    seenHeadings.add(normalized);

    const order = sectionOrder.get(normalized);
    if (order !== undefined) {
      if (order < highestKnownOrder) {
        issues.push({
          code: "section-order",
          severity: "warning",
          message: "Move this section earlier to keep the usual ATS reading order.",
          blockId: heading.id
        });
      }
      highestKnownOrder = Math.max(highestKnownOrder, order);
    }

    const headingIndex = mainBlocks.indexOf(heading);
    const following = mainBlocks.slice(headingIndex + 1);
    const nextHeadingIndex = following.findIndex(
      (block) => block.type === "heading" && block.level === 2
    );
    const sectionContent =
      nextHeadingIndex === -1 ? following : following.slice(0, nextHeadingIndex);
    if (
      !sectionContent.some(
        (block) =>
          block.type !== "divider" && block.type !== "spacer" && Boolean(blockText(block).trim())
      )
    ) {
      issues.push({
        code: "empty-section",
        severity: "error",
        message: "Add content to this section or remove its heading.",
        blockId: heading.id
      });
    }
  }

  return {
    issues,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length
  };
}

import {
  PDF_INSPECTION_LIMITS,
  PUBLIC_FILE_LIMITS,
  PublicFileLimitError,
  assertPublicFileSize
} from "./file-limits";

export type PdfInspectionSeverity = "error" | "warning";

export type PdfInspectionIssue = {
  code: string;
  severity: PdfInspectionSeverity;
  message: string;
  pageNumber?: number;
};

export type PdfInspectionPage = {
  pageNumber: number;
  text: string;
  characterCount: number;
  itemCount: number;
  readingOrderStable: boolean;
};

export type PdfInspection = {
  fileName: string;
  fileSize: number;
  pageCount: number;
  pages: PdfInspectionPage[];
  issues: PdfInspectionIssue[];
  hasCyrillic: boolean;
  hasLatin: boolean;
  emails: string[];
  phones: string[];
  urls: string[];
  dates: string[];
  readingOrderStable: boolean;
};

export type BrowserPdfFile = Pick<File, "name" | "size" | "type" | "arrayBuffer">;

type PdfTextItem = {
  str: string;
  transform?: ArrayLike<number>;
  width?: number;
  height?: number;
};

type PdfPage = {
  getTextContent: () => Promise<{ items: unknown[] }>;
};

export type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  hasJSActions?: () => Promise<boolean>;
  destroy?: () => Promise<void> | void;
};

export type PdfDocumentLoader = (data: Uint8Array) => Promise<PdfDocument>;

export class PdfInspectionError extends Error {
  constructor(
    readonly code:
      | "not-pdf"
      | "encrypted"
      | "corrupted"
      | "too-large"
      | "too-many-pages"
      | "too-much-content"
      | "unsafe-features"
      | "unknown",
    message: string
  ) {
    super(message);
    this.name = "PdfInspectionError";
  }
}

const normalizeWhitespace = (value: string) => value.replace(/\s+/gu, " ").trim();

const isTextItem = (item: unknown): item is PdfTextItem =>
  typeof item === "object" && item !== null && "str" in item && typeof item.str === "string";

const itemPosition = (item: PdfTextItem) => ({
  x: Number(item.transform?.[4] ?? 0),
  y: Number(item.transform?.[5] ?? 0),
  height: Math.max(1, Math.abs(Number(item.height ?? item.transform?.[3] ?? 1)))
});

const visualOrder = (items: PdfTextItem[]) =>
  items
    .map((item, sourceIndex) => ({ item, sourceIndex, ...itemPosition(item) }))
    .sort((left, right) => {
      const lineTolerance = Math.max(2, Math.min(left.height, right.height) * 0.45);
      if (Math.abs(left.y - right.y) > lineTolerance) return right.y - left.y;
      if (Math.abs(left.x - right.x) > 0.5) return left.x - right.x;
      return left.sourceIndex - right.sourceIndex;
    });

const pageText = (items: PdfTextItem[]) => {
  const ordered = visualOrder(items);
  const lines: Array<{
    y: number;
    height: number;
    parts: Array<{ text: string; x: number; width: number }>;
  }> = [];

  for (const positioned of ordered) {
    if (!positioned.item.str.trim()) continue;
    const previous = lines.at(-1);
    const tolerance = Math.max(
      2,
      Math.min(previous?.height ?? positioned.height, positioned.height) * 0.45
    );

    if (!previous || Math.abs(previous.y - positioned.y) > tolerance) {
      lines.push({
        y: positioned.y,
        height: positioned.height,
        parts: [
          {
            text: positioned.item.str,
            x: positioned.x,
            width: Number(positioned.item.width ?? 0)
          }
        ]
      });
    } else {
      previous.parts.push({
        text: positioned.item.str,
        x: positioned.x,
        width: Number(positioned.item.width ?? 0)
      });
    }
  }

  return lines
    .map((line) => {
      let text = "";
      let rightEdge: number | undefined;

      for (const part of line.parts) {
        const gap = rightEdge === undefined ? 0 : part.x - rightEdge;
        if (text && gap > Math.max(1.5, line.height * 0.15)) text += " ";
        text += part.text;
        rightEdge = part.x + part.width;
      }

      return normalizeWhitespace(text);
    })
    .filter(Boolean)
    .join("\n");
};

const hasStableReadingOrder = (items: PdfTextItem[]) => {
  const raw = items.map((item) => normalizeWhitespace(item.str)).filter(Boolean);
  const visual = visualOrder(items)
    .map(({ item }) => normalizeWhitespace(item.str))
    .filter(Boolean);

  return raw.length === visual.length && raw.every((token, index) => token === visual[index]);
};

const uniqueMatches = (matches: Iterable<string>) => [
  ...new Set([...matches].map((match) => match.trim()))
];

const findEmails = (text: string) =>
  uniqueMatches(text.matchAll(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}/gu).map((match) => match[0]));

const findPhones = (text: string) =>
  uniqueMatches(
    (text.match(/\+?\d[\d\s().-]{5,}\d/gu) ?? []).filter((match) => {
      const digits = match.replace(/\D/gu, "");
      return digits.length >= 7 && digits.length <= 15;
    })
  );

const findUrls = (text: string) =>
  uniqueMatches(
    (text.match(/(?:https?:\/\/|www\.)[^\s<>()]+/giu) ?? []).map((match) =>
      match.replace(/[),.;\]}]+$/gu, "")
    )
  );

const findDates = (text: string) =>
  uniqueMatches(
    text
      .matchAll(
        /\b(?:(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19|20|21)\d{2}|(?:0?[1-9]|1[0-2])[./-](?:19|20|21)\d{2}|(?:19|20|21)\d{2}(?:[./-](?:0?[1-9]|1[0-2]))?)\b/gu
      )
      .map((match) => match[0])
  );

const hasPdfHeader = (data: Uint8Array) => {
  const header = new TextDecoder("latin1").decode(data.slice(0, 1024));
  return header.includes("%PDF-");
};

export const PDFJS_INSPECTOR_OPTIONS = {
  disableAutoFetch: true,
  disableFontFace: true,
  disableRange: true,
  disableStream: true,
  enableXfa: false,
  isImageDecoderSupported: false,
  isOffscreenCanvasSupported: false,
  maxImageSize: 0,
  stopAtErrors: true,
  useSystemFonts: false,
  useWasm: false,
  useWorkerFetch: false
} as const;

const browserPdfLoader: PdfDocumentLoader = async (data) => {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const task = pdfjs.getDocument({ data, ...PDFJS_INSPECTOR_OPTIONS });
  return task.promise;
};

export const describePdfLoadError = (error: unknown) => {
  if (error instanceof PdfInspectionError) return error;

  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") {
    return new PdfInspectionError(
      "encrypted",
      "This PDF is password-protected and cannot be inspected."
    );
  }
  if (name === "InvalidPDFException" || name === "FormatError") {
    return new PdfInspectionError("corrupted", "The PDF is damaged or has an invalid structure.");
  }

  return new PdfInspectionError("unknown", "The PDF could not be read in this browser.");
};

export const inspectPdfFile = async (
  file: BrowserPdfFile,
  loadDocument: PdfDocumentLoader = browserPdfLoader
): Promise<PdfInspection> => {
  try {
    assertPublicFileSize(file, "pdf");
  } catch (error) {
    if (error instanceof PublicFileLimitError) {
      throw new PdfInspectionError("too-large", error.message);
    }
    throw error;
  }

  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);

  if (data.byteLength > PUBLIC_FILE_LIMITS.pdf.bytes) {
    throw new PdfInspectionError(
      "too-large",
      `The selected file exceeds the ${PUBLIC_FILE_LIMITS.pdf.label} PDF limit.`
    );
  }

  if (!hasPdfHeader(data)) {
    throw new PdfInspectionError("not-pdf", "The selected file is not a valid PDF.");
  }

  let document: PdfDocument;
  try {
    document = await loadDocument(data);
  } catch (error) {
    throw describePdfLoadError(error);
  }

  try {
    if (document.numPages > PDF_INSPECTION_LIMITS.pages) {
      throw new PdfInspectionError(
        "too-many-pages",
        `The PDF has more than ${PDF_INSPECTION_LIMITS.pages} pages.`
      );
    }
    if (await document.hasJSActions?.()) {
      throw new PdfInspectionError(
        "unsafe-features",
        "The PDF contains JavaScript actions, which are not allowed by this inspector."
      );
    }

    const pages: PdfInspectionPage[] = [];
    const issues: PdfInspectionIssue[] = [];
    let extractedCharacters = 0;

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      if (content.items.length > PDF_INSPECTION_LIMITS.textItemsPerPage) {
        throw new PdfInspectionError(
          "too-much-content",
          `Page ${pageNumber} contains more than ${PDF_INSPECTION_LIMITS.textItemsPerPage.toLocaleString("en-US")} text objects.`
        );
      }
      const items = content.items.filter(isTextItem);
      const text = pageText(items);
      const readingOrderStable = hasStableReadingOrder(items);
      extractedCharacters += text.length;
      if (extractedCharacters > PDF_INSPECTION_LIMITS.characters) {
        throw new PdfInspectionError(
          "too-much-content",
          `The PDF contains more than ${PDF_INSPECTION_LIMITS.characters.toLocaleString("en-US")} extractable characters.`
        );
      }

      pages.push({
        pageNumber,
        text,
        characterCount: text.length,
        itemCount: items.length,
        readingOrderStable
      });

      if (!text) {
        issues.push({
          code: "blank-page",
          severity: "warning",
          message: `Page ${pageNumber} has no extractable text.`,
          pageNumber
        });
      }
      if (!readingOrderStable && text) {
        issues.push({
          code: "reading-order",
          severity: "warning",
          message: `Page ${pageNumber} text objects are stored in a different order from their visual positions.`,
          pageNumber
        });
      }
    }

    const text = pages
      .map((page) => page.text)
      .filter(Boolean)
      .join("\n");
    const emails = findEmails(text);
    const phones = findPhones(text);
    const urls = findUrls(text);
    const dates = findDates(text);
    const brokenGlyphs = text.match(/\uFFFD|\(cid:\d+\)|[□▯]/giu) ?? [];

    if (!text) {
      issues.unshift({
        code: "no-text",
        severity: "error",
        message: "No extractable text was found. The PDF may be scanned or rendered as an image."
      });
    }
    if (brokenGlyphs.length > 0) {
      issues.push({
        code: "broken-glyphs",
        severity: "error",
        message: "Broken glyph markers were found: replacement boxes, �, or (cid:...)."
      });
    }
    if (text && emails.length + phones.length + urls.length === 0) {
      issues.push({
        code: "missing-contacts",
        severity: "warning",
        message: "No email, phone number, or web link was found in the extracted text."
      });
    }
    if (text && dates.length === 0) {
      issues.push({
        code: "missing-dates",
        severity: "warning",
        message: "No recognizable dates were found in the extracted text."
      });
    }

    return {
      fileName: file.name,
      fileSize: file.size,
      pageCount: document.numPages,
      pages,
      issues,
      hasCyrillic: /\p{Script=Cyrillic}/u.test(text),
      hasLatin: /\p{Script=Latin}/u.test(text),
      emails,
      phones,
      urls,
      dates,
      readingOrderStable: pages.every((page) => page.readingOrderStable)
    };
  } finally {
    await document.destroy?.();
  }
};

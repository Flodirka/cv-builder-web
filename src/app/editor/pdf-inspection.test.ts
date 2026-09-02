import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PDFJS_INSPECTOR_OPTIONS,
  PdfInspectionError,
  describePdfLoadError,
  inspectPdfFile,
  type BrowserPdfFile,
  type PdfDocument
} from "./pdf-inspection";

const pdfBytes = new TextEncoder().encode("%PDF-1.7\nfixture");

const file = (arrayBuffer = vi.fn(async () => pdfBytes.buffer as ArrayBuffer)): BrowserPdfFile => ({
  name: "resume.pdf",
  size: pdfBytes.byteLength,
  type: "application/pdf",
  arrayBuffer
});

const documentWithPages = (pages: unknown[][]): PdfDocument => ({
  numPages: pages.length,
  getPage: async (pageNumber) => ({
    getTextContent: async () => ({ items: pages[pageNumber - 1] })
  }),
  destroy: vi.fn()
});

const textItem = (str: string, x: number, y: number) => ({
  str,
  transform: [1, 0, 0, 10, x, y],
  width: str.length * 5,
  height: 10
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser PDF inspection", () => {
  it("uses a text-only PDF.js configuration with active features disabled", () => {
    expect(PDFJS_INSPECTOR_OPTIONS).toEqual({
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
    });
  });

  it("reads File.arrayBuffer locally and extracts bilingual text page by page", async () => {
    const arrayBuffer = vi.fn(async () => pdfBytes.buffer as ArrayBuffer);
    const loadDocument = vi.fn(async (data: Uint8Array) => {
      expect([...data]).toEqual([...pdfBytes]);
      return documentWithPages([
        [
          textItem("Ирина Смирнова", 40, 780),
          textItem("irina@example.com", 40, 760),
          textItem("ОПЫТ", 40, 720),
          textItem("Example Studio", 40, 700),
          textItem("2022–2026", 300, 700)
        ],
        [
          textItem("PROJECTS", 40, 780),
          textItem("https://example.com", 40, 760),
          textItem("01/2021", 40, 740)
        ]
      ]);
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await inspectPdfFile(file(arrayBuffer), loadDocument);

    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(loadDocument).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(result.pageCount).toBe(2);
    expect(result.pages[0].text).toContain("Ирина Смирнова");
    expect(result.pages[1].text).toContain("PROJECTS");
    expect(result.hasCyrillic).toBe(true);
    expect(result.hasLatin).toBe(true);
    expect(result.emails).toEqual(["irina@example.com"]);
    expect(result.urls).toEqual(["https://example.com"]);
    expect(result.dates).toEqual(["2022", "2026", "01/2021"]);
    expect(result.readingOrderStable).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("finds broken glyphs, blank pages, and suspicious content-stream order", async () => {
    const result = await inspectPdfFile(file(), async () =>
      documentWithPages([
        [textItem("Lower (cid:12) �", 40, 700), textItem("Upper", 40, 780)],
        [textItem("   ", 40, 780)]
      ])
    );

    expect(result.pages[0].text).toBe("Upper\nLower (cid:12) �");
    expect(result.pages[1].text).toBe("");
    expect(result.readingOrderStable).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["reading-order", "blank-page", "broken-glyphs"])
    );
  });

  it("keeps adjacent glyph items together while separating visually spaced words", async () => {
    const result = await inspectPdfFile(file(), async () =>
      documentWithPages([
        [
          { ...textItem("A", 40, 780), width: 5 },
          { ...textItem("T", 45, 780), width: 5 },
          { ...textItem("S", 50, 780), width: 5 },
          { ...textItem("ready", 65, 780), width: 25 },
          textItem("qa@example.com", 40, 760),
          textItem("2026", 40, 740)
        ]
      ])
    );

    expect(result.pages[0].text).toContain("ATS ready");
  });

  it("reports PDFs with no extractable text", async () => {
    const result = await inspectPdfFile(file(), async () => documentWithPages([[], []]));

    expect(result.issues[0]).toMatchObject({ code: "no-text", severity: "error" });
    expect(result.pages.every((page) => page.text === "")).toBe(true);
  });

  it("rejects non-PDF bytes before starting the parser", async () => {
    const bytes = new TextEncoder().encode("not a PDF");
    const loadDocument = vi.fn();

    await expect(
      inspectPdfFile(
        {
          name: "broken.pdf",
          size: bytes.byteLength,
          type: "application/pdf",
          arrayBuffer: async () => bytes.buffer as ArrayBuffer
        },
        loadDocument
      )
    ).rejects.toMatchObject({ code: "not-pdf" });
    expect(loadDocument).not.toHaveBeenCalled();
  });

  it("rejects oversized files before reading their bytes", async () => {
    const arrayBuffer = vi.fn();

    await expect(
      inspectPdfFile({
        name: "oversized.pdf",
        size: 20 * 1024 * 1024 + 1,
        type: "application/pdf",
        arrayBuffer
      })
    ).rejects.toMatchObject({ code: "too-large" });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects excessive page counts and embedded JavaScript actions", async () => {
    const destroyPages = vi.fn();
    await expect(
      inspectPdfFile(file(), async () => ({
        ...documentWithPages([]),
        numPages: 51,
        destroy: destroyPages
      }))
    ).rejects.toMatchObject({ code: "too-many-pages" });
    expect(destroyPages).toHaveBeenCalledOnce();

    const destroyActions = vi.fn();
    await expect(
      inspectPdfFile(file(), async () => ({
        ...documentWithPages([]),
        numPages: 1,
        hasJSActions: async () => true,
        destroy: destroyActions
      }))
    ).rejects.toMatchObject({ code: "unsafe-features" });
    expect(destroyActions).toHaveBeenCalledOnce();
  });

  it("rejects pages with excessive text-object counts", async () => {
    const items = Array.from({ length: 50_001 }, () => textItem("x", 0, 0));

    await expect(
      inspectPdfFile(file(), async () => documentWithPages([items]))
    ).rejects.toMatchObject({ code: "too-much-content" });
  });

  it("turns parser failures into clear damaged and encrypted PDF errors", () => {
    const invalid = Object.assign(new Error("invalid"), { name: "InvalidPDFException" });
    const password = Object.assign(new Error("password"), { name: "PasswordException" });

    expect(describePdfLoadError(invalid)).toMatchObject({ code: "corrupted" });
    expect(describePdfLoadError(password)).toMatchObject({ code: "encrypted" });
    expect(describePdfLoadError(new PdfInspectionError("not-pdf", "Invalid"))).toMatchObject({
      code: "not-pdf",
      message: "Invalid"
    });
  });
});

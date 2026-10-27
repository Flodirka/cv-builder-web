"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import styles from "./BlockEditor.module.css";

export function PdfExportPreview({ blob }: { blob: Blob }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const pages = pagesRef.current;
    if (!pages) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    const render = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({
          data,
          disableFontFace: true,
          useSystemFonts: false,
          useWasm: false,
          useWorkerFetch: false
        });
        const document = await task.promise;
        for (let number = 1; number <= document.numPages; number++) {
          if (cancelled) return;
          const page = await document.getPage(number);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.5 });
          const figure = window.document.createElement("figure");
          const caption = window.document.createElement("figcaption");
          caption.textContent = `Page ${number} of ${document.numPages}`;
          const canvas = window.document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `PDF page ${number} of ${document.numPages}`);
          figure.append(caption, canvas);
          pages.append(figure);
          await page.render({ canvas, viewport }).promise;
          page.cleanup();
        }
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    };
    void render();
    return () => {
      cancelled = true;
      void task?.destroy();
      pages.replaceChildren();
    };
  }, [blob]);

  return (
    <>
      {state === "loading" && <p role="status">Preparing page previews…</p>}
      {state === "error" && <p role="alert">PDF preview could not be displayed.</p>}
      <div className={styles.pdfExportPages} ref={pagesRef} aria-busy={state === "loading"} />
    </>
  );
}

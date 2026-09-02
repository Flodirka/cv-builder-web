"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { describePdfLoadError, inspectPdfFile, type PdfInspection } from "./pdf-inspection";
import styles from "./BlockEditor.module.css";

type InspectorState =
  | { kind: "idle" }
  | { kind: "loading"; fileName: string }
  | { kind: "ready"; result: PdfInspection }
  | { kind: "error"; fileName: string; message: string };

type PdfInspectorProps = {
  disabled?: boolean;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function PdfInspector({ disabled = false }: PdfInspectorProps) {
  const [state, setState] = useState<InspectorState>({ kind: "idle" });
  const requestId = useRef(0);

  const inspectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setState({ kind: "loading", fileName: file.name });

    try {
      const result = await inspectPdfFile(file);
      if (requestId.current === currentRequest) setState({ kind: "ready", result });
    } catch (error) {
      if (requestId.current !== currentRequest) return;
      setState({
        kind: "error",
        fileName: file.name,
        message: describePdfLoadError(error).message
      });
    }
  };

  const result = state.kind === "ready" ? state.result : null;
  const contactCount = result
    ? result.emails.length + result.phones.length + result.urls.length
    : 0;

  const close = () => {
    requestId.current += 1;
    setState({ kind: "idle" });
  };

  return (
    <>
      <label className={styles.pdfUploadButton} aria-disabled={disabled}>
        Check finished PDF
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={inspectFile}
          disabled={disabled}
        />
      </label>

      {state.kind !== "idle" && (
        <div className={styles.modalBackdrop} role="presentation">
          <section
            className={styles.exportModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-inspector-heading"
          >
            <div className={styles.pdfInspector}>
              <div className={styles.pdfInspectorHeader}>
                <h2 id="pdf-inspector-heading">PDF text check</h2>
                <button className={styles.btn} type="button" onClick={close}>
                  Close
                </button>
              </div>

              {state.kind === "loading" && (
                <p className={styles.pdfInspectorState} role="status">
                  Reading {state.fileName} locally…
                </p>
              )}

              {state.kind === "error" && (
                <p
                  className={`${styles.pdfInspectorState} ${styles.pdfInspectorError}`}
                  role="alert"
                >
                  {state.fileName}: {state.message}
                </p>
              )}

              {result && (
                <div className={styles.pdfInspectionResult}>
                  <div className={styles.pdfFileSummary}>
                    <strong>{result.fileName}</strong>
                    <span>
                      {formatFileSize(result.fileSize)} · {result.pageCount}{" "}
                      {result.pageCount === 1 ? "page" : "pages"}
                    </span>
                  </div>

                  <dl className={styles.pdfChecks}>
                    <div>
                      <dt>Cyrillic</dt>
                      <dd>{result.hasCyrillic ? "Detected" : "Not detected"}</dd>
                    </div>
                    <div>
                      <dt>Latin</dt>
                      <dd>{result.hasLatin ? "Detected" : "Not detected"}</dd>
                    </div>
                    <div>
                      <dt>Contacts</dt>
                      <dd>{contactCount > 0 ? `${contactCount} found` : "Not found"}</dd>
                    </div>
                    <div>
                      <dt>Dates</dt>
                      <dd>
                        {result.dates.length > 0 ? `${result.dates.length} found` : "Not found"}
                      </dd>
                    </div>
                    <div>
                      <dt>Reading order</dt>
                      <dd>{result.readingOrderStable ? "Consistent" : "Review needed"}</dd>
                    </div>
                  </dl>

                  <div
                    className={
                      result.issues.length === 0
                        ? styles.pdfInspectionPassed
                        : styles.pdfInspectionIssues
                    }
                  >
                    <strong>
                      {result.issues.length === 0
                        ? "No extraction issues found"
                        : "Review findings"}
                    </strong>
                    {result.issues.length > 0 && (
                      <ul>
                        {result.issues.map((issue, index) => (
                          <li key={`${issue.code}-${issue.pageNumber ?? "document"}-${index}`}>
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className={styles.pdfPages} aria-label="Extracted PDF text by page">
                    {result.pages.map((page) => (
                      <details key={page.pageNumber} open={result.pageCount === 1}>
                        <summary>
                          Page {page.pageNumber} · {page.characterCount} characters
                        </summary>
                        <pre>{page.text || "[No extractable text]"}</pre>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

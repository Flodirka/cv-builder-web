"use client";

import { useState, type ChangeEvent } from "react";
import {
  importResumeJson,
  importResumeMarkdown,
  importResumePlainText,
  type Resume,
  type ResumeImportPreview
} from "@/resume";
import { assertPublicFileSize, type PublicFileKind } from "./file-limits";
import styles from "./DocumentInterchange.module.css";

type DocumentInterchangeProps = {
  open: boolean;
  onClose: () => void;
  onReplace: (resume: Resume) => void;
};

export type PendingImport = ResumeImportPreview & {
  fileName: string;
  format: "Markdown" | "JSON" | "Plain text";
};

export function ImportPreview({
  pending,
  onReplace,
  onCancel
}: {
  pending: PendingImport;
  onReplace: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.preview} role="dialog" aria-labelledby="import-preview-heading">
      <div>
        <h3 id="import-preview-heading">Import preview</h3>
        <dl>
          <div>
            <dt>File name</dt>
            <dd>{pending.fileName}</dd>
          </div>
          <div>
            <dt>Detected language</dt>
            <dd>{pending.language.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Block count</dt>
            <dd>{pending.blockCount}</dd>
          </div>
        </dl>
      </div>
      <div className={styles.warningList}>
        <strong>Warnings</strong>
        {pending.warnings.length > 0 ? (
          <ul>
            {pending.warnings.map((warning, index) => (
              <li key={`${warning.code}-${warning.line}-${index}`}>{warning.message}</li>
            ))}
          </ul>
        ) : (
          <p>No warnings.</p>
        )}
      </div>
      <div className={styles.previewActions}>
        <button type="button" className={styles.replaceButton} onClick={onReplace}>
          Replace current document
        </button>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function DocumentInterchange({ open, onClose, onReplace }: DocumentInterchangeProps) {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readImport = async (
    event: ChangeEvent<HTMLInputElement>,
    format: "Markdown" | "JSON" | "Plain text"
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setPending(null);
    setError(null);
    try {
      const kind: PublicFileKind =
        format === "Markdown" ? "markdown" : format === "JSON" ? "json" : "plainText";
      assertPublicFileSize(file, kind);
      const source = await file.text();
      const result =
        format === "Markdown"
          ? importResumeMarkdown(source)
          : format === "JSON"
            ? importResumeJson(source)
            : importResumePlainText(source);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPending({ ...result.preview, fileName: file.name, format });
    } catch (error) {
      setError(error instanceof Error ? error.message : `${format} file could not be read.`);
    }
  };

  const confirmReplacement = () => {
    if (!pending) return;
    onReplace(pending.resume);
    setPending(null);
    setError(null);
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} role="presentation" hidden={!open}>
      <section
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-interchange-heading"
      >
        <div className={styles.heading}>
          <h2 id="document-interchange-heading">Import a document</h2>
          <button type="button" className={styles.button} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.examples}>
          Examples:
          <a href="examples/cv-example-en.md" download>
            EN Markdown
          </a>
          <a href="examples/cv-example-ru.md" download>
            RU Markdown
          </a>
        </div>

        <div className={styles.actions}>
          <label className={styles.fileButton}>
            Import Markdown
            <input
              id="resume-markdown-import"
              type="file"
              accept="text/markdown,text/plain,.md,.markdown"
              onChange={(event) => void readImport(event, "Markdown")}
            />
          </label>
          <label className={styles.fileButton}>
            Import JSON backup
            <input
              id="resume-json-import"
              type="file"
              accept="application/json,.json"
              onChange={(event) => void readImport(event, "JSON")}
            />
          </label>
          <label className={styles.fileButton}>
            Import plain text
            <input
              id="resume-text-import"
              type="file"
              accept="text/plain,.txt"
              onChange={(event) => void readImport(event, "Plain text")}
            />
          </label>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            <strong>Import failed.</strong> {error} The current document was not changed.
          </div>
        )}

        {pending && (
          <ImportPreview
            pending={pending}
            onReplace={confirmReplacement}
            onCancel={() => setPending(null)}
          />
        )}
      </section>
    </div>
  );
}

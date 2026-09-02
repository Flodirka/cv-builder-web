export const PUBLIC_FILE_LIMITS = {
  json: { bytes: 2 * 1024 * 1024, label: "2 MiB", displayName: "JSON" },
  markdown: { bytes: 1024 * 1024, label: "1 MiB", displayName: "Markdown" },
  plainText: { bytes: 512 * 1024, label: "512 KiB", displayName: "plain-text" },
  pdf: { bytes: 20 * 1024 * 1024, label: "20 MiB", displayName: "PDF" }
} as const;

export const PDF_INSPECTION_LIMITS = {
  pages: 50,
  textItemsPerPage: 50_000,
  characters: 2_000_000
} as const;

export type PublicFileKind = keyof typeof PUBLIC_FILE_LIMITS;

export type BrowserFileSize = Pick<File, "size">;

export class PublicFileLimitError extends Error {
  constructor(
    readonly kind: PublicFileKind,
    readonly limitBytes: number,
    message: string
  ) {
    super(message);
    this.name = "PublicFileLimitError";
  }
}

export const assertPublicFileSize = (file: BrowserFileSize, kind: PublicFileKind) => {
  const limit = PUBLIC_FILE_LIMITS[kind];
  if (!Number.isFinite(file.size) || file.size < 0 || file.size > limit.bytes) {
    throw new PublicFileLimitError(
      kind,
      limit.bytes,
      `The selected file exceeds the ${limit.label} ${limit.displayName} limit.`
    );
  }
};

import type { ResumeIcon } from "@cv-builder/resume-core";
import lucideIcons from "./lucide-icons.json" with { type: "json" };

// Single source of the A4 icon glyphs used by both the preview and the direct PDF download.
// Paths are drawn on a 24x24 viewBox so the same data works in HTML `<svg>` and `@react-pdf` `<Svg>`.
//
// License note: the Aria-Icons catalog (https://github.com/LeulAria/Aria-Icons) is MIT-licensed,
// but it only indexes third-party sets — vendored Lucide (ISC), Tabler (MIT), Heroicons (MIT),
// theSVG brands, and Iconify collections (mixed open licenses). The twelve glyphs below are
// original single-path fill glyphs drawn for CV Builder, not copied paths, so they ship with
// the static export free of attribution. If these are ever swapped for exact Lucide/Tabler
// artwork, stay on MIT/ISC-only sets and keep this comment in sync.
export const resumeIconPaths: Record<ResumeIcon, string> = {
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0v1H5v-1Z",
  briefcase: "M4 8h16v11H4V8Zm2-3h12v3H6V5Zm-2 14h16v2H4v-2Z",
  tools: "M4 5h4v2H6v2H4V5Zm14 0h2v4h-2V7h-2V5h2Zm-4 4 2-2 4 4-2 2-4-4ZM5 15l6-6 2 2-6 6H5v-2Z",
  languages: "M4 5h16v3H4V5Zm2 5h12v2H6v-2Zm-2 4h16v3H4v-3Z",
  education: "M12 4 2 9l10 5 10-5-10-5ZM6 11.5V16l6 3 6-3v-4.5l-6 3-6-3Z",
  award: "M12 3l2.5 5.3 5.5.7-4 4 1 5.7-5-2.7-5 2.7 1-5.7-4-4 5.5-.7L12 3Z",
  mail: "M4 6h16v12H4V6Zm2 2 8 6 8-6v-1H6v1Z",
  phone: "M7 4h3l2 5-2.5 1.5a12 12 0 0 0 5 5L16 13l5 2v3l-2 1a16 16 0 0 1-14-14l2-1Z",
  location:
    "M12 3a7 7 0 0 0-7 7c0 5.2 7 11 7 11s7-5.8 7-11a7 7 0 0 0-7-7Zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 1 0-6-6l-1.5 1.5 1.4 1.4L14 6.5a2 2 0 1 1 3 3l-3 3a2 2 0 0 1-3 0l-1-1ZM14 10a4 4 0 0 0-6 0l-3 3a4 4 0 1 0 6 6L12.5 17.5 11.1 16.1 10 17.5a2 2 0 1 1-3-3l3-3a2 2 0 0 1 3 0l1 1 1.4-1.4L14 10Z",
  summary: "M5 4h14v13H5V4Zm2 2v2h10V6H7Zm0 4v2h10v-2H7Zm0 4v1h6v-1H7Z",
  skills: "M4 5h7v2H6v12H4V5Zm9 0h7v14h-2V7h-5V5ZM6 8h12v2H6V8Z"
};

export const resumeIconPath = (icon?: ResumeIcon): string | undefined =>
  icon ? resumeIconPaths[icon] : undefined;

export type ResumeIconNode = {
  tag: "path" | "circle" | "ellipse" | "rect" | "line" | "polygon" | "polyline";
  props: Record<string, string>;
};

export const resumeIconDrawing = (
  icon?: ResumeIcon
): { outline: boolean; nodes: ResumeIconNode[] } | undefined => {
  if (!icon) return undefined;
  const nodes = (lucideIcons as unknown as Record<string, ResumeIconNode[]>)[icon];
  if (nodes) return { outline: true, nodes };
  const path = resumeIconPath(icon);
  return path ? { outline: false, nodes: [{ tag: "path", props: { d: path } }] } : undefined;
};

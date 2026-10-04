import { createElement } from "react";
import type { ResumeIcon } from "@cv-builder/resume-core";
import { resumeIconDrawing } from "./resume-icon-paths";

export function ResumeIconSvg({ icon, className }: { icon?: ResumeIcon; className?: string }) {
  const drawing = resumeIconDrawing(icon);
  if (!drawing) return null;
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox="0 0 24 24"
      fill={drawing.outline ? "none" : "currentColor"}
      stroke={drawing.outline ? "currentColor" : "none"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawing.nodes.map((node, index) => createElement(node.tag, { ...node.props, key: index }))}
    </svg>
  );
}

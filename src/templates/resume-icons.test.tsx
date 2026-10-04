import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { lucideIconNames, resumeIconSchema } from "@/resume";
import { ResumeIconSvg } from "./index";

describe("local Lucide catalog", () => {
  it("renders every schema-supported Lucide icon as inert inline vector elements", () => {
    expect(lucideIconNames).toHaveLength(1664);
    for (const icon of lucideIconNames) {
      expect(resumeIconSchema.safeParse(icon).success, icon).toBe(true);
      const svg = renderToStaticMarkup(<ResumeIconSvg icon={icon} />);
      expect(svg, icon).toContain("<svg");
      expect(svg, icon).toMatch(/<(?:path|circle|ellipse|rect|line|polygon|polyline)\b/);
      expect(svg, icon).not.toMatch(/<image|<script|<foreignObject|\bhref=|\bon\w+=/);
    }
    expect(resumeIconSchema.safeParse("lucide:not-an-icon").success).toBe(false);
  });
});

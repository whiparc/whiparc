import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import WhiparcThinking from "../WhiparcThinking";
import fs from "node:fs";
import path from "node:path";

describe("WhiparcThinking", () => {
  const html = renderToStaticMarkup(<WhiparcThinking />);

  it("shows the brand mark and a caption that screen readers announce", () => {
    expect(html).toContain('data-testid="ai-thinking"');
    // Both halves of the mark are drawn, and the orange arc carries the whip class.
    expect(html).toMatch(/<path[^>]*class="wp-think-arc"/);
    expect(html).toContain("#FF6A3D");
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Reading your description");
  });

  it("hides the decoration from assistive technology", () => {
    expect(html).toMatch(/class="wp-think-stage" aria-hidden="true"/);
  });

  it("takes custom phrases", () => {
    expect(renderToStaticMarkup(<WhiparcThinking phrases={["One", "Two"]} />)).toContain("One");
  });

  it("stops moving for people who ask for reduced motion", () => {
    const css = fs.readFileSync(path.join(__dirname, "..", "WhiparcThinking.css"), "utf8");
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    for (const cls of [".wp-think-hop", ".wp-think-arc", ".wp-think-shadow", ".wp-think-mark"]) {
      expect(reduced).toContain(cls);
    }
    expect(reduced).toContain("animation: none");
  });
});

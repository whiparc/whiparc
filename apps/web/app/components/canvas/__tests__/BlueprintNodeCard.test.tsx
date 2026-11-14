import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import BlueprintNodeCard from "../BlueprintNodeCard";

const card = (extra: Partial<React.ComponentProps<typeof BlueprintNodeCard>> = {}) =>
  renderToStaticMarkup(<BlueprintNodeCard tech="Terraform" icon="lucide:box" label="web_server" categoryLabel="Provisioning" {...extra} />);

describe("BlueprintNodeCard summary line", () => {
  it("shows the settings under the title when there are any", () => {
    const html = card({ summary: "t3.small · 50 GB" });
    expect(html).toContain('data-testid="node-summary"');
    expect(html).toContain("t3.small · 50 GB");
    // The full text is also the tooltip, for when the card truncates it.
    expect(html).toContain('title="t3.small · 50 GB"');
  });

  it("leaves the face unchanged for a node with nothing to show", () => {
    for (const summary of [undefined, ""]) {
      expect(card({ summary })).not.toContain("node-summary");
    }
  });

  it("renders a summary as text, never as markup", () => {
    const html = card({ summary: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

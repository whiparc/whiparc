import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotIncluded from "../NotIncluded";

describe("NotIncluded", () => {
  it("lists each note under a Not included heading", () => {
    const html = renderToStaticMarkup(<NotIncluded notes={["Google Cloud is not available.", "SSH keys cannot be set here."]} />);
    expect(html).toContain("Not included");
    expect(html).toContain("<li>Google Cloud is not available.</li>");
    expect(html).toContain("<li>SSH keys cannot be set here.</li>");
  });

  it("renders a model's text as text, never as markup or a link", () => {
    const html = renderToStaticMarkup(
      <NotIncluded notes={['<script>alert(1)</script>', '<a href="https://example.test">click</a>', "[click](https://example.test)"]} />,
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<a ");
    expect(html).toContain("&lt;script&gt;");
    // Markdown is not interpreted either: the brackets stay literal.
    expect(html).toContain("[click](https://example.test)");
  });
});

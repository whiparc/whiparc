# Whiparc — Human-Craft Pass (instructions for Claude Code)

**For:** Claude Code, implementing directly against the live `apps/web` code.
**Context:** the previous two docs in this folder (`marketing-and-app-home-plan.md`, `marketing-and-app-home-redesign-v2.md`) were an audit and a copy/structure spec, both written against static mockups. Claude Code has since implemented most of that spec for real — copy, live data wiring, the GitHub star button, the FAQ, the dashboard's activation checklist and sandbox-agent widget, and a new left-nav sidebar on `/dashboard`. This doc reviews that live implementation (read directly from `apps/web/app/page.tsx` and `apps/web/app/dashboard/page.tsx`) and gives instructions for the one thing still missing: the marketing page reads as templated rather than designed, even though the copy and data behind it are genuinely good. This doc is scoped to fixing that, plus a couple of small honesty/cleanup items found along the way.

**Do not undo:** the copy, the live GitHub star count, the real `$49`/`$149` pricing, the FAQ content, the dashboard's honest empty states, or the activation checklist. All of that is correct and should stay exactly as implemented.

---

## 1. What's genuinely working (keep this)

- Copy is specific and technical throughout — "Terraform. Ansible. Kubernetes. One canvas. One real deploy," "Practice free. Pay only when you're shipping for real," FAQ answers that name real competitors and real tradeoffs. None of the generic "Empower / Unlock / Supercharge your infrastructure" language that AI-generated marketing copy usually defaults to. Don't touch this.
- The dashboard (`dashboard/page.tsx`) is the strongest part of the whole app precisely because it *doesn't* decorate: honest empty states ("No runs yet — deploy something to see it here"), a skippable activation checklist that disappears once done, a sandbox-agent widget wired to a real heartbeat endpoint instead of a fake "connected" state, and a `$0.00` spend card explicitly framed as "doesn't meter yet" rather than a fabricated number. This is what "genuine platform for devs" actually looks like — more of the app should read like this page does.
- `FeaturedTemplatesSection` renders nothing at all when there's no data rather than showing a loading spinner or empty box on a marketing page — the right instinct, keep it.

## 2. The actual diagnosis: one recipe, repeated seven times

Open `apps/web/app/page.tsx` and look at `HeroSection`, `FeaturesSection`, `HowItWorksSection`, `CodePreviewSection`, `PricingSection`, `CTASection`, and `CliSection` side by side. Every single one of them is built from the exact same three ingredients, in the exact same order:

1. An eyebrow label (`text-xs uppercase tracking-widest text-{color}-400`) above a bold `h2`.
2. A grid of 3–4 cards, each wrapped in `TiltCard` with `spotlight` and a tilt effect, each card containing an icon-in-a-gradient-box + title + one-paragraph description (`FeaturesSection` L288-384, `HowItWorksSection` L478-564; even the two single-item "cards" in `CodePreviewSection` L669-712 and `CliSection` L992-1015 get the identical treatment).
3. A blurred, colored, `blur-[120px]`–`blur-[140px]` gradient blob floating behind the section (L150, L331, L626, L761, L890, L937).

That is the tell. Not any single choice — each one is fine on its own — but the fact that the page never once breaks its own rhythm in seven sections is exactly what "generated, not designed" looks like. A person laying this out by hand would vary the shape of at least two or three sections: a full-bleed visual with no card grid, an asymmetric two-column split that isn't "text left, code-window right" again, a section that sits on a flat background because the surrounding blobs already did the work of drawing the eye.

**Instructions:**

- **Retire the tilt+spotlight effect as a default.** `TiltCard` currently wraps every card on the page — feature cards, how-it-works cards, the pricing cards, *and* the two code/terminal panels. Keep it on the two places where "something to inspect up close" is the actual point: the `CodePreviewSection` code window (L669) and the `CliSection` terminal (L992). Remove `TiltCard` from `FeaturesSection` (L361), `HowItWorksSection` (L539), and `PricingSection` (L830) — render those as plain static cards. Losing the tilt gimmick on six-plus repeated blocks is most of the fix by itself.
- **Give `FeaturesSection` a real visual instead of a fourth icon grid.** The product's actual differentiator is "you watch it deploy for free" — that's a screen recording or screenshot of the canvas mid-deploy, not four more icon-in-a-box cards. Replace the 4-card grid (L358-380) with a two-column layout: copy + a short list on the left, an actual GIF/screenshot of the live canvas (or the terminal proof panel already built for the hero, reused at larger size) on the right. If no real capture exists yet, ship the section without a placeholder rather than a stock icon grid standing in for it — see the "renders nothing when there's no data" instinct already used correctly elsewhere on this same page.
- **Let some sections sit on flat background.** Not every section needs its own blur blob (L150, L331, L626, L761, L890, L937 — six blobs across one page). Drop the blob from `HowItWorksSection` and `CliSection`; keep it on the Hero and one other section you want to visually anchor (Pricing is a reasonable choice, since that's the section people should stop and read). Fewer blobs makes the ones that remain feel like a deliberate spotlight instead of wallpaper.
- **Vary the section-opener pattern.** Every `h2` is preceded by the identical eyebrow-label formula. For at least `CodePreviewSection` and `CliSection`, drop the eyebrow and lead with the headline directly, or replace it with something concrete (e.g., a live-looking file path or command instead of a generic all-caps label).

## 3. Two things that break the site's own honesty standard

The dashboard is careful never to fake a state it can't back up. The marketing page has two spots that don't hold to that:

- **`Footer` → `Company` column** (`page.tsx` L1114-1118): `About`, `Security`, `Contact` all point at `href: '#'`. And the bottom bar's `Privacy` / `Terms` / `Security` (L1204-1206) aren't even `#` — they're plain `<span>` elements styled to look clickable with no destination at all. Either write the three pages (even one paragraph each) and link them for real, or remove the column and those bottom-bar items entirely. Dead links that only exist to fill a grid are the second-biggest "template" tell on the page, right after the repeated card recipe.
- **`Footer` newsletter form** (L1092-1099): `handleSubscribe` always shows "Subscribed successfully" after a fake 1-second `setTimeout`, regardless of what's typed or whether anything happened server-side. Either wire it to a real list (even a simple webhook/Mailchimp-style endpoint) or remove the form. A fake success state is worse than no form — it's the one place on the page that actively lies to a visitor.

## 4. One thing worth a founder decision, not just a design fix

`LogoCloud` (`page.tsx` L247-284) renders "HashiCorp, AWS, Docker, Kubernetes, Ansible, GitHub" under the line "Works with the stack you already run." As plain text chips (not real logos) this is on the safer side, but it still reads as an implied association with those companies. Confirm this is meant as "we're compatible with / compile to these tools" (true, and fine to say) rather than something that could be read as a partnership or endorsement claim (not confirmed, and not fine to imply) — a one-word copy tweak like "Compiles to the tools you already run" removes the ambiguity without losing the section.

## 5. Small cleanup (not visual, just hygiene)

`apps/web/app/components/Sidebar.tsx` is dead code — it's the legacy node-palette panel for the canvas editor, already carries its own `// TODO: ... legacy version ... Future engineers should integrate or remove this legacy component` comment, and has no relationship to the new `DashboardSidebar` function inside `dashboard/page.tsx` that actually renders the left-nav on `/dashboard`. Having two components both conceptually named "sidebar" — one live, one dead — is exactly the kind of thing that causes a future edit to land in the wrong file. Delete it, per its own TODO, now that the search for "where does the sidebar live" has an actual answer.

## Suggested order

1. Remove `TiltCard` from the three sections listed in §2 (cheap, immediate visual de-templating).
2. Fix or remove the two dishonest footer elements (§3) — low effort, real credibility risk if shipped as-is.
3. Rebuild `FeaturesSection` around a real visual (§2) — the highest-effort item, but the highest-leverage one, since it's the section that's supposed to prove the product's core claim.
4. Thin out the blur blobs and eyebrow-label repetition (§2) — polish pass once the structural changes above are in.
5. Confirm the Logo Cloud framing with the founder (§4) before or after — doesn't block anything else.
6. Delete `components/Sidebar.tsx` (§5) — whenever convenient, zero risk.

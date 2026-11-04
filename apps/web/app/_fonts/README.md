# Self-hosted fonts

Loaded by `../fonts.ts` through `next/font/local`. Latin subset, woff2.

| File | Family | Weights | Source |
| :--- | :--- | :--- | :--- |
| `space-grotesk-latin.woff2` | Space Grotesk | 300-700 (variable) | Google Fonts |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | 100-800 (variable) | Google Fonts |
| `barlow-400-latin.woff2`, `barlow-500-latin.woff2`, `barlow-600-latin.woff2` | Barlow | 400, 500, 600 | Google Fonts |
| `barlow-condensed-700-latin.woff2` | Barlow Condensed | 700 | Google Fonts |

All four families are licensed under the SIL Open Font License 1.1
(<https://openfontlicense.org>), which permits bundling and redistribution.

To refresh a file, request the family from the Google Fonts CSS API with a
modern browser user agent, take the `/* latin */` block's `src` URL, and
download it over the existing file. The Google-hosted loader is deliberately
not used: see the comment at the top of `../fonts.ts`.

# Design reference

These files are the mockups exported from the design canvas. They rely on the design tool's runtime (`support.js`, `<x-dc>`, `<sc-for>`, `{{holes}}`, `<dc-import>`), so they won't render by opening them in a browser. Read them as markup: every colour, size, radius and gap is inline, and each file's `renderVals()` at the bottom holds the sample data and the computed colours.

| File | Screen |
| --- | --- |
| `trip-overview.dc.html` | Trip overview (the main redesign) |
| `homepage.dc.html` | My trips homepage |
| `sign-in.dc.html` | Sign-in page (`mode` prop: signin or signup; `invite` prop toggles the banner) |
| `tab-icon.dc.html` | Tab icon at 64, 32 and 16px, plus tab previews |
| `photo-placeholder.dc.html` | Flat illustrations standing in for photos in the mockups. Don't ship these; use real images or the fallback in SPEC.md |

Do not copy the markup into the app. Rebuild it as React components on the existing stack, as SPEC.md describes. Sample names and numbers (Cachuma Lake, Maya, $48) are mockup data only.

Live canvas (owner access): https://claude.ai/artifact/XXJhFeSWpT8NBDgsqPDcHT

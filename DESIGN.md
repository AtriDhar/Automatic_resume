# Design System — ARS-MME "Agentic Control Room"

## Product Context
- **What this is:** An agentic resume engine — AI agents verify credentials, scan the job market, compute ATS match, and synthesize a tailored resume in real time, with zero data retention.
- **Who it's for:** Job seekers (entry-level to senior) who want a resume tailored to live market demand, and who respond to seeing *how* the machine works, not just the output.
- **Space/industry:** AI resume builders. Peers: Rezi (clean ATS-first), Teal (job-tracking dashboard), Kickresume (template-forward). None of them show agents working — that gap is our identity.
- **Project type:** Web app (SPA), two-mode workflow (Expertise / Market).

## The Memorable Thing
> "I watched AI agents build my resume in real time."

Every design decision serves this. The chrome is a **control room**: dark, precise, monospaced telemetry. The resume is **paper**: white, serif, the only lit surface in the room. Your eye goes exactly where the value is.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian — function-first, data-dense chrome; the document as a crafted artifact.
- **Decoration level:** Intentional. No gradients, no glows except the single active-agent accent ring. The paper's drop shadow is the one moment of depth.
- **Mood:** Capable machinery working on your behalf. Serious, transparent, quietly technical. Never "hacker toy," never corporate-bland.

## Typography
- **UI (headings, buttons, labels, body):** **Geist** — Inter-class neutrality with a point of view; tabular-nums for scores. Never use Inter, Roboto, or system-ui as primary.
- **Agent telemetry (logs, stage details, keyword chips, scores, timestamps):** **JetBrains Mono** — the machine's voice. Scoped strictly: never headings, never body copy.
- **The document (generated resume only):** **Source Serif 4** — the resume renders as a credible printed document, not app output. This is deliberate differentiation; no competitor separates output from chrome typographically.
- **Loading:** Google Fonts:
  `https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=swap`
- **Scale (UI):** 11px (mono micro-labels) / 13px (secondary) / 14px (body) / 15px (emphasized) / 18px (card titles) / 24px (page titles). Document scale: 26px name / 14px headline / 13.5px body.

## Color
- **Approach:** Restrained — ONE accent. Cyan means exactly one thing: *an agent is working*. Purple is retired everywhere (AI-slop signature; also created a two-accent identity crisis between modes). Modes are distinguished by content and iconography, never by competing hues.

| Token | Hex | Usage |
|---|---|---|
| `--bg` (base) | `#0A0E14` | App background |
| `--surface-1` | `#111721` | Cards, panels |
| `--surface-2` | `#1A2230` | Nested surfaces, inputs on cards |
| `--surface-3` | `#232D3F` | Borders, highest elevation |
| `--text` | `#E6EBF2` | Primary text |
| `--text-muted` | `#8B98AB` | Secondary text |
| `--text-faint` | `#5A6678` | Tertiary, micro-labels |
| `--accent` | `#22D3EE` | Agent activity ONLY: active stage, primary CTA, live telemetry |
| `--success` | `#34D399` | Verified, complete, matched keywords |
| `--warning` | `#FBBF24` | Inconclusive, cold-start notices |
| `--error` | `#F87171` | Failures, missing keywords |
| `--paper` | `#FDFDFB` | Document surface ONLY |
| `--paper-text` | `#1C2128` | Document ink |

- **Elevation by lightness, not borders-everywhere.** Surfaces step up `base → surface-1 → surface-2 → surface-3`. Borders use `surface-3` and only where a surface step isn't enough.
- **Text on accent:** dark (`#06282E`), never white.
- **Dark mode:** the product is dark-first; the paper document is the intentional light region. No light theme for v1 chrome.

## Spacing
- **Base unit:** 4px.
- **Density:** Compact-comfortable — control-room density in chrome (12–16px card padding gaps), generous on paper (40–48px document padding).
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48).

## Layout
- **Approach:** Grid-disciplined. 12-col; controls left (≈1/3), output right (≈2/3).
- **Max content width:** 1280px.
- **Border radius:** sm(4px) chips/inputs · md(8px) buttons/cards · lg(12px) panels. Never fully-rounded pills.
- **Signature patterns:**
  1. **Pipeline rail** (replaces status badge rows): vertical connected stages — Ingestion → Verifier → Scout → Analyst → Synthesizer. Each stage shows a dot (done ✓ green / active accent ring / pending hollow), name, and a one-line mono detail of *what it produced* ("confidence 0.94", "3 trends identified"). Completed stages connect with a green thread.
  2. **Paper document:** the generated resume sits on `--paper` with a real shadow (`0 8px 40px rgba(0,0,0,0.45)`), Source Serif 4, real heading hierarchy — never raw markdown in a `<pre>`.
  3. **ATS report:** score in mono tabular figures, thin progress bar, matched/missing keyword chips in mono.

## Motion
- **Approach:** Minimal-functional. Motion communicates state, never decorates.
- **Allowed:** active-stage accent ring (steady glow, no pulse-spam), 150–250ms ease-out for state transitions, paper fade-in on synthesis complete.
- **Banned:** pulsing badges, gradient animations, spinners longer than the wait they represent.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out). Duration: micro(100ms) short(200ms) medium(300ms).

## Anti-Patterns (hard bans)
- Purple/violet anywhere. Gradient buttons. `slate-*` default palette.
- Inter / Roboto / system-ui as a chosen font.
- Rendering the resume as monospace or `<pre>` output.
- More than one accent hue. Decorative glows. Pulse animations on status.
- Tailwind default look — every color must come from the tokens above.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-10 | Initial system created via /design-consultation | Competitive research (Rezi/Teal/Kickresume) + 2026 agent-UX patterns; memorable thing = "watching agents work" |
| 2026-07-10 | Serif paper document (Risk #1) | No competitor separates output from chrome; deliverable reads as print |
| 2026-07-10 | Pipeline rail over badges (Risk #2) | Strongest 2026 agent pattern: per-stage output, not binary status flips |
| 2026-07-10 | Single accent, purple retired (Risk #3) | Ownable identity; cyan = agent activity, semantically consistent |
| 2026-07-10 | Tailwind kept via CDN + token config for now | Full build-time Tailwind is tracked debt; tokens enforced through inline config so no raw slate/purple classes survive |

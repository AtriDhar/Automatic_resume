# ARS-MME — Project Instructions

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

Hard rules from DESIGN.md worth repeating:
- One accent only (`#22D3EE` = agent activity). Purple is banned.
- Fonts: Geist (UI), JetBrains Mono (telemetry only), Source Serif 4 (document only).
- The generated resume renders on the paper surface with real typography — never `<pre>`/monospace.
- Colors come from the DESIGN.md tokens, never Tailwind default slate/cyan/purple classes.

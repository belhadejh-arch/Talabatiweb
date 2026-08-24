---
name: Tailwind CSS v4 HSL variables
description: CSS color variables must be in HSL format (h s% l%) not RGB when used with hsl(var(--xxx)) in Tailwind CSS v4
---

## The rule
Tailwind CSS v4 uses `@theme inline` with `--color-xxx: hsl(var(--xxx))`. This means all custom CSS variables must be in HSL component format, NOT RGB:

```css
/* CORRECT — HSL components */
--background: 0 0% 98%;      /* #FAFAFA */
--primary: 18 100% 60%;      /* #FF6B35 */
--foreground: 240 43% 14%;   /* #1A1A2E */

/* WRONG — RGB values cause broken colors (yellow/nonsense) */
--background: 250 250 250;
--primary: 255 107 53;
```

**Why:** `hsl(250 250 250)` is not a valid CSS color — hue > 360 and saturation/lightness > 100% get clamped, producing wild results.

**How to apply:** After any design subagent run, check the :root CSS variables. If they look like `250 250 250` (3 plain integers), they're RGB and need HSL conversion. Key TALABAT HSL values: primary=#FF6B35 → `18 100% 60%`, dark bg=#0D1117 → `215 27% 7%`, dark card=#161B22 → `215 22% 11%`.

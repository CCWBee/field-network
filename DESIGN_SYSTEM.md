# Field Network Design System Plan

## Design Philosophy

**What this product is**: A precision instrument for commissioning and verifying real-world observations. Surveyors, researchers, insurance adjusters, and AI agents use it to get verifiable ground truth. The UI should feel like opening a well-made field instrument — purposeful, legible, trustworthy. Not a SaaS dashboard. Not a consumer app.

**Reference lineage**:
- Swiss International Typographic Style (Helvetica era — grid discipline, information density, type hierarchy does the work)
- USGS topographic maps (your HeightMapBackground already channels this)
- Ordnance Survey cartography (clean data presentation, institutional confidence)
- US government redesign (design.digital.gov — stark, no decoration, content-first)
- Dieter Rams / Braun (as little design as possible)

**One-sentence rule**: If a CSS property exists purely for decoration and removing it wouldn't reduce clarity, remove it.

---

## What to Kill

These are the current patterns that pull the UI toward generic SaaS and must be eliminated:

| Pattern | Where | Why it fails |
|---------|-------|-------------|
| `.glass` / `.glass-light` (glassmorphism) | globals.css, Card, dashboard, landing | Signals "crypto/web3 template." Blur + transparency = visual noise on data-heavy screens |
| `.text-gradient` (teal→cyan→purple) | globals.css, nav brand, footer | Multi-color gradient text is the #1 vibecoded tell. Looks like every AI/web3 landing page from 2023 |
| `.glow-sm` / `.glow-md` (teal box-shadow) | globals.css, CTA buttons | Glow effects are decorative. Real buttons don't glow |
| `rounded-xl` / `rounded-2xl` / `rounded-full` on containers | Cards, stat blocks, step circles | Extreme rounding softens everything. Survey instruments have sharp corners |
| `bg-gradient-mesh` / `animate-mesh` | globals.css, dashboard layout | Gradient mesh backgrounds are visual clutter behind data |
| Framer Motion `whileHover={{ y: -2 }}` on cards | Card.tsx, landing page | Floating cards are a decoration pattern. Data cards don't hover-float |
| `StaggeredList` / `StaggeredItem` / `HoverScale` | Landing page sections | Entrance animations on scroll are marketing-site behavior. Content should be there when you arrive |
| `accent-cyan`, `accent-purple`, `accent-pink`, `accent-orange` | tailwind.config, landing page icons | Four accent colors = no accent color. Pick one. The rest are noise |
| `space-grotesk` as body font | layout.tsx | Good geometric sans but it's the default vibecoded font. Every AI project uses it |
| `float` / `pulse-slow` keyframe animations | tailwind.config | Decorative idle animations add zero information |

---

## What to Keep

| Element | Why |
|---------|-----|
| **HeightMapBackground** | Charles's own design. Channels USGS topo maps. The contour lines, tessellation, and grid scintillation are philosophically correct for this product. It's the one element with genuine aesthetic identity |
| **Teal as brand color** | Works. But reduce the palette from 11 shades to 3 functional ones |
| **Dark hero section** (`#050607`) | The near-black behind the heightmap is good. Keep the dark/light split (dark landing, light app) |
| **Grid background on body** | The subtle repeating grid in `globals.css` body is actually good — echoes graph paper / survey grid. Refine it, don't remove it |
| **Leaflet map integration** | Core to the product. The map styling is mostly fine |
| **Functional component structure** | Button, Card, Badge, Input, Modal, etc. — the architecture is right. Change the skin, keep the bones |

---

## New Design Tokens

### Typography

```
Primary font:    "Inter" (body, UI, labels)
                 Why: Designed specifically for screens. Has tabular figures for data.
                 Neutral enough to disappear. Available as variable font.

Monospace font:  "JetBrains Mono" or "IBM Plex Mono" (data values, coordinates, hashes, code)
                 Why: Data display is a core use case. Mono signals "this is a measurement."

Display font:    "Inter" at heavy weights (700/800) with tight tracking (-0.02em)
                 Why: One font family. Display differentiation through weight and tracking.
                 If Inter feels too safe: consider "Instrument Sans" (similar neutrality, slightly sharper)
```

### Color Palette

Strip to functional minimum:

```
ink-900:    #0a0f14    — Primary text, headings
ink-700:    #1e293b    — Secondary text, body
ink-500:    #475569    — Tertiary text, labels, captions
ink-300:    #94a3b8    — Disabled text, placeholders
ink-200:    #cbd5e1    — Borders, dividers
ink-100:    #e2e8f0    — Subtle borders, table lines
ink-50:     #f1f5f9    — Background tint, hover states

paper:      #ffffff    — Card/surface background
paper-warm: #fafaf9    — Page background (barely warm, avoids clinical blue-white)

field-500:  #0d9488    — Primary brand, primary buttons, active states
field-600:  #0f766e    — Primary hover
field-700:  #115e59    — Primary pressed/active
field-100:  #ccfbf1    — Badge backgrounds, subtle highlights
field-50:   #f0fdfa    — Selected row background, light accent areas

signal-red:     #dc2626  — Error, destructive, dispute
signal-amber:   #d97706  — Warning, pending
signal-green:   #16a34a  — Success, verified, funded
signal-blue:    #2563eb  — Info, link, in-progress

(That's it. No cyan accent. No purple accent. No pink. No orange.
 Teal is the ONE brand color. Red/amber/green/blue are functional signals only.)
```

### Spacing & Corners

```
Border radius:
  - Buttons:     2px  (rounded-sm)
  - Cards:       2px  (rounded-sm)
  - Inputs:      2px  (rounded-sm)
  - Badges:      2px  (rounded-sm) — NOT rounded-full pills
  - Modals:      0px  (sharp)
  - Avatar:      rounded-full (only exception — it's a circle for a reason)

Spacing scale:   Tailwind default (4px base). No changes needed.

Box shadows:
  - Cards:       none by default. 1px border instead.
  - Elevated:    shadow-sm only (e.g., dropdowns, modals, toasts)
  - No glow effects ever
```

### Borders

```
Default border:   1px solid ink-200 (#cbd5e1)
Subtle border:    1px solid ink-100 (#e2e8f0)
Active border:    1px solid field-500 (#0d9488) — focus rings, selected state
Data separator:   1px solid ink-100
```

---

## Component Redesign Specs

### Button

```
REMOVE:
  - motion.button wrapper (replace with plain <button>)
  - whileTap scale animation
  - glow-sm / glow-md on hover
  - rounded-lg / rounded-md → rounded-sm (2px)
  - shadow-sm hover:shadow-md

KEEP:
  - Variant system (primary, secondary, ghost, danger)
  - Size system (sm, md, lg)
  - Loading state with spinner
  - Focus ring

NEW STYLES:
  primary:    bg-field-500 text-white hover:bg-field-600 active:bg-field-700
              border: none. No shadow. No glow.
  secondary:  bg-transparent text-ink-700 border border-ink-200 hover:bg-ink-50
  ghost:      bg-transparent text-ink-500 hover:bg-ink-50
  danger:     bg-signal-red text-white hover:bg-red-700

  All sizes: rounded-sm. Tight padding. font-medium (not semibold).
  Transition: colors only, 100ms. No transform transitions.
```

### Card

```
REMOVE:
  - motion.div wrapper and whileHover float
  - 'glass' variant entirely
  - 'elevated' variant (use border instead)
  - rounded-lg → rounded-sm
  - hover:shadow effect on hoverable

KEEP:
  - CardHeader / CardBody / CardFooter compound structure

NEW STYLES:
  default:    bg-paper border border-ink-200 rounded-sm
  data:       bg-paper border border-ink-200 rounded-sm
              (same as default — the "data" name signals intent, for future differentiation)

  hoverable:  border-ink-200 hover:border-field-500 transition-colors
              (color change on border, not shadow/float)

  CardHeader: border-b border-ink-100. Title in ink-900 font-semibold text-sm uppercase tracking-wide.
  CardBody:   p-4.
  CardFooter: border-t border-ink-100 bg-ink-50/50.
```

### Badge

```
REMOVE:
  - rounded-full → rounded-sm
  - Colored background fills (bg-green-100 etc.)

NEW STYLES:
  All badges: bg-transparent, 1px border, rounded-sm.
  success:    text-signal-green border-signal-green/30
  warning:    text-signal-amber border-signal-amber/30
  error:      text-signal-red border-signal-red/30
  info:       text-signal-blue border-signal-blue/30
  default:    text-ink-500 border-ink-200

  Dot indicator: keep, change to matching signal color.
  Font: text-xs font-medium uppercase tracking-wider (label style)
```

### Input

```
REMOVE:
  - rounded-lg → rounded-sm
  - focus:ring-2 (too thick) → focus:ring-1

KEEP:
  - Label, error, hint structure
  - Password toggle
  - Left/right icon slots

NEW STYLES:
  border:     border-ink-200
  focus:      ring-1 ring-field-500 border-field-500
  error:      ring-1 ring-signal-red border-signal-red
  bg:         white (not surface-50 when disabled — use ink-50)
  text:       ink-900
  placeholder: ink-300
  Label:      text-xs font-medium uppercase tracking-wide text-ink-500 mb-1
```

### Modal

```
REMOVE:
  - rounded corners on modal container → sharp (rounded-none)
  - Framer Motion enter/exit if present (use CSS transition or none)

NEW STYLES:
  Backdrop:   bg-ink-900/60 (no blur)
  Container:  bg-paper border border-ink-200 shadow-lg rounded-none
  Header:     border-b border-ink-100, title uppercase tracking-wide
```

### Navigation (Dashboard)

```
REMOVE:
  - .glass on nav bar
  - .text-gradient on brand name
  - bg-gradient-mesh on body

NEW STYLES:
  Nav bar:        bg-paper border-b border-ink-200. Clean white strip.
  Brand name:     text-ink-900 font-bold tracking-tight. Plain text. No gradient.
  Nav links:      text-ink-500 hover:text-ink-900. Active: text-field-500 font-medium.
  Body bg:        paper-warm (#fafaf9) with the subtle grid from globals.css (keep, refine opacity)
```

### Landing Page (Hero)

```
KEEP:
  - HeightMapBackground (the whole thing)
  - Dark bg (#050607) behind it
  - The "Decentralized Observation Network" pill at top

MODIFY:
  - Brand name in hero: plain white text, font-bold, no gradient
  - "on demand" subtitle: text-field-400 (single color, not gradient)
  - CTA buttons: rounded-sm, no glow, bg-field-500 or border border-white/30
  - Stats bar: monospace font for numbers, reduce visual weight
  - The pill badge: rounded-sm border border-field-500/30 (not rounded-full)

AFTER HERO (light sections):
  - Kill all glass / glass-light cards
  - Kill StaggeredList / HoverScale wrappers
  - "How It Works" steps: numbered with monospace numerals in a square (not rounded-full circle)
  - Use case cards: plain border cards, no hover-float, no glass-light
  - API code block: bg-ink-900 text-ink-100 (dark block, not glass). Monospace.
  - CTA section: bg-paper-warm, no gradient-mesh
```

---

## globals.css Overhaul

```
REMOVE entirely:
  .glass
  .glass-light
  .text-gradient
  .glow-sm
  .glow-md
  @keyframes mesh-shift
  .animate-mesh
  .bg-gradient-mesh
  .bg-field-network

KEEP & REFINE:
  Body grid background — reduce opacity from 0.05 to 0.03, increase spacing to 64px
  Scrollbar styling — keep, change thumb to ink-200
  Leaflet styles — keep all
  .animate-shimmer — keep for skeleton loading
  Mobile responsive rules — keep all
  Safe area padding — keep

ADD:
  .font-mono { font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace; }
  .data-value { @apply font-mono text-ink-900 tabular-nums; }
  .section-label { @apply text-xs font-medium uppercase tracking-wider text-ink-500; }
  .divider { @apply border-t border-ink-100; }
```

---

## tailwind.config.js Overhaul

```js
module.exports = {
  content: [/* same */],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f1f5f9', 100: '#e2e8f0', 200: '#cbd5e1',
          300: '#94a3b8', 500: '#475569', 700: '#1e293b', 900: '#0a0f14',
        },
        paper: { DEFAULT: '#ffffff', warm: '#fafaf9' },
        field: {
          50: '#f0fdfa', 100: '#ccfbf1',
          500: '#0d9488', 600: '#0f766e', 700: '#115e59',
        },
        signal: {
          red: '#dc2626', amber: '#d97706',
          green: '#16a34a', blue: '#2563eb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        sm: '2px',  // override tailwind default sm (was 0.125rem/2px — actually same but explicit)
      },
      // REMOVE: backgroundImage.gradient-mesh, animation.float, animation.pulse-slow, keyframes.float
    },
  },
  plugins: [],
};
```

---

## HeightMapBackground Refinements

The component is solid. Suggested tweaks (optional, not required):

1. **Color temperature**: Currently all teal `rgba(20, 184, 166, ...)`. Consider cooling slightly toward cyan for the contour lines only: `rgba(14, 165, 175, ...)` — makes it feel more like a real topo map where contour colors are often a muted blue-green.

2. **Grid labels**: Add sparse coordinate labels at grid intersections (e.g., `52.4N`, `-1.2W`) in a very low-opacity monospace font. This would push it from "abstract pattern" to "this is clearly a map." Would need to be purely decorative/random coordinates.

3. **Reduce tessellation opacity**: The diamond overlay is the busiest layer. Dropping `finalAlpha` multiplier from `0.1` to `0.06` would let contours dominate more.

4. **Elevation labels**: On major contour lines (every 5th), place a small elevation number label (like real topo maps do). Purely aesthetic but incredibly specific to the survey/cartography identity.

None of these are required for the design system migration. They're enhancements to be considered separately.

---

## Demo Spike: Dashboard Page

The dashboard (`/dashboard`) is the best target for a before/after because it has:
- Stat cards (data display)
- Action cards (buttons, links)
- "How it works" section (mixed content)
- Navigation bar visible

### Spike Scope

Restyle `/dashboard` (page.tsx + layout.tsx) using the new tokens. This proves the system works on a real page without touching the full component library.

### Dashboard Layout (spike version)

```
Nav bar:
  bg-white border-b border-ink-200
  Brand: "Field Network" — text-ink-900 font-bold text-lg tracking-tight
  Links: text-ink-500 text-sm hover:text-ink-900
  Active link: text-field-500
  No glass. No gradient text.

Body:
  bg-paper-warm
  Subtle grid (from globals.css, refined)
```

### Dashboard Page (spike version)

```
Header:
  h1: "Welcome back, {name}" — text-ink-900 text-2xl font-bold tracking-tight
  Subtitle: text-ink-500 text-sm

Stats Row (3-col grid):
  Each stat: bg-paper border border-ink-200 rounded-sm p-4
    Number: font-mono text-2xl font-bold text-ink-900 tabular-nums
    Label:  text-xs uppercase tracking-wider text-ink-500 mt-1
  No glass. No rounded-xl. Numbers in monospace.

Action Cards (2-col grid):
  Each card: bg-paper border border-ink-200 rounded-sm
    Header area: p-5
      Title: text-ink-900 font-semibold text-base
      Desc:  text-ink-500 text-sm mt-1
      Icon:  w-10 h-10 border border-ink-200 rounded-sm flex items-center justify-center
             (square icon container, not rounded-full)
    Button area: p-5 pt-0 space-y-2
      Primary CTA:    bg-field-500 text-white rounded-sm py-2.5 text-sm font-medium
      Secondary CTA:  border border-ink-200 text-ink-700 rounded-sm py-2.5 text-sm font-medium

"How it works" section:
  bg-paper border border-ink-200 rounded-sm p-5
    Title: section-label style ("HOW IT WORKS")
    Steps: 3-col grid
      Number: font-mono text-sm font-bold text-field-500 w-6 h-6
              bg-field-50 rounded-sm flex items-center justify-center
              (square, not circle)
      Text: text-sm text-ink-700
```

### Visual Diff Summary

| Element | Before (current) | After (spike) |
|---------|------------------|---------------|
| Nav | Glass blur, gradient brand text | White, solid border, plain text |
| Body bg | Gradient mesh radials | Warm white + subtle grid |
| Stat cards | `glass rounded-xl` | `bg-white border rounded-sm`, mono numbers |
| Action cards | `glass rounded-xl`, circle icons, glow buttons | Border cards, square icons, flat buttons |
| Step numbers | `rounded-full bg-field-500 text-white` circles | `rounded-sm bg-field-50 text-field-500` squares |
| Buttons | Rounded-lg, glow-sm shadow | Rounded-sm, no shadow |
| Typography | Space Grotesk everywhere | Inter body, mono for data values |
| Motion | Hover float on cards | Border color change only |

---

## Anti-Drift Rules

When implementing (by human or LLM), enforce these rules to prevent regression to generic patterns:

1. **No `rounded-lg` or `rounded-xl` or `rounded-2xl` anywhere** except avatar images. Grep for them. Every instance is a bug.
2. **No `backdrop-filter: blur`** anywhere except the landing page mobile menu (nav overlay on dark bg). Zero glassmorphism.
3. **No gradient text**. `background-clip: text` should not appear in any CSS or className.
4. **No box-shadow with color** (like `rgba(20, 184, 166, 0.25)`). Only neutral shadows (rgba(0,0,0,x)) on dropdowns/modals.
5. **No Framer Motion on layout elements** (cards, containers, sections). Motion is allowed ONLY for: route transitions, toast enter/exit, modal enter/exit, mobile menu. Not for scroll-reveal. Not for hover effects.
6. **No decorative color on containers**. Cards are white with grey borders. Color appears only in: brand elements, signal badges, primary buttons, active states.
7. **One brand color** (field/teal). If you catch yourself reaching for purple, cyan, pink, or orange — stop. Use teal or a neutral.
8. **Data values in monospace**. Any number that represents a measurement, count, amount, coordinate, hash, or address gets `font-mono tabular-nums`.
9. **Labels are uppercase**. Section titles, card headers in utility contexts, form labels — all `text-xs uppercase tracking-wider`.
10. **No `animate-` classes on elements that don't represent loading or real-time state**. Content doesn't animate in. It's there.

---

## Implementation Order

When approved:

1. **Phase 1 — Tokens** (30 min)
   - Update `tailwind.config.js` with new color palette, font families, remove decorative keyframes
   - Update `layout.tsx` to load Inter + JetBrains Mono instead of Space Grotesk
   - Strip `globals.css` of glass/glow/gradient utilities, add new utilities

2. **Phase 2 — Core Components** (1-2 hr)
   - Button.tsx: Remove motion, apply new radii/styles
   - Card.tsx: Remove motion + glass variant, apply new styles
   - Badge.tsx: Remove rounded-full, apply new styles
   - Input.tsx: Apply new radii, label styles
   - Modal.tsx: Sharp corners, remove blur backdrop
   - Select.tsx, Textarea.tsx: Match Input treatment

3. **Phase 3 — Dashboard Spike** (1 hr)
   - dashboard/layout.tsx: Replace glass nav with solid nav
   - dashboard/page.tsx: Restyle with new tokens
   - Verify the page looks correct and intentional

4. **Phase 4 — Landing Page** (1-2 hr)
   - page.tsx: Strip StaggeredList/HoverScale, restyle all sections
   - Keep HeightMapBackground as-is (or with optional refinements)
   - Restyle hero text, CTA buttons, how-it-works, use cases, tech section, footer

5. **Phase 5 — Remaining Pages** (2-3 hr)
   - Auth pages (login, register)
   - Task creation flow
   - Worker dashboard
   - Admin panels
   - Profile/settings

6. **Phase 6 — Sweep** (30 min)
   - Grep for every anti-drift rule violation
   - Visual review of every page at 375px, 768px, 1280px widths
   - Remove unused CSS/components

---

## Notes

- The HeightMapBackground already IS the aesthetic direction. The rest of the UI just needs to match its level of intention.
- This system is deliberately austere. The beauty comes from precision, not decoration. If it feels too plain at first, resist the urge to add — instead refine spacing, type hierarchy, and information density.
- The cartographic identity means: grid lines, coordinates, measurement units, survey-style labeling. These aren't decorations — they're the visual language of the product's domain.

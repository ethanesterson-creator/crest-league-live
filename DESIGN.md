---
name: Crest League Live
description: CBSN at Dusk. The Camp Bauercrest Sports Network graphics package on deep navy, built from the camp's own crest and dusk-lake photo.
colors:
  paper: "#050d1c"
  sheet: "#0a1830"
  sheet-2: "#0f2447"
  ink: "#f4f8ff"
  on-ink: "#06142b"
  ink-2: "#b4c4de"
  ink-3: "#8196b8"
  accent: "#3b96f2"
  accent-2: "#8cc3ff"
  live: "#ff3d52"
  live-ink: "#ff9aa5"
  good: "#2fd08a"
  good-ink: "#7ce8b7"
  warn: "#ffb454"
  warn-ink: "#ffd08a"
  banquet: "#e0b252"
  cw-blue: "#1d5bff"
typography:
  display:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(56px, 12vw, 120px)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "0"
  page-title:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(48px, 10vw, 92px)"
    fontWeight: 800
    lineHeight: 0.88
    letterSpacing: "0"
  score:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "104px"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "0"
  section:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0"
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.1em"
  button:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    letterSpacing: "0.06em"
rounded:
  control: "6px"
  row: "8px"
  sheet-menu: "10px"
  chamfer: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.button}"
    height: "50px"
    padding: "0 26px"
  button-primary-hover:
    backgroundColor: "#ffffff"
  button-secondary:
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    height: "50px"
  button-danger:
    textColor: "{colors.live-ink}"
    typography: "{typography.button}"
  button-danger-hover:
    backgroundColor: "{colors.live}"
    textColor: "#ffffff"
  button-good:
    textColor: "{colors.good-ink}"
  stepper:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    size: "52px"
  input:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "10px 12px"
  plate:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    padding: "24px"
  chip:
    textColor: "{colors.ink}"
    height: "28px"
    padding: "0 12px"
  live-badge:
    backgroundColor: "{colors.live}"
    textColor: "#ffffff"
    height: "30px"
    padding: "0 14px"
  score-tap:
    textColor: "{colors.ink}"
    height: "176px"
---

# Design System: Crest League Live

## Overview

**Creative North Star: "CBSN at Dusk"**

The system is the Camp Bauercrest Sports Network graphics package: a dark navy broadcast look made from the camp's own assets, the league shield and the dusk-lake photo. A counselor sees a scoreboard that feels like television; campers see standings like a league table that moves; the wall board reads as a broadcast. It replaced an earlier white "scorebook" look that read as bland; the atmosphere is the point, and it stays sleek rather than plain.

Navy and white carry identity. Panels are chamfered plates with a hairline edge that catches light and a short blue tab at the top-left; buttons and tags are parallelograms like a scorebug. Numerals are huge and roll like a mechanical counter. Every page opens on a full-bleed dusk-photo banner with the title set large. Color has jobs: white is the primary fill, crest blue is the accent, red means live, green means confirmed, gold belongs to the banquet.

**Key Characteristics:**
- One dark mode only (`data-theme="night"` stays in markup but there is no light theme).
- Chamfered plates, slanted controls, slanted section-head tabs: the silhouette is the brand.
- Big Shoulders numerals and titles, Barlow body, Barlow Condensed labels and buttons, all uppercase where condensed.
- Odometer numerals that roll on load and on every change.
- Dusk photo as fixed, heavily scrimmed page atmosphere and as banner with a slow push-in.
- 44-58px tap targets wherever a thumb scores.

## Colors

A deep-navy ground with white ink, one blue accent, and three single-purpose signals plus a fenced gold.

### Primary
- **Broadcast White** (`ink`, #f4f8ff): text, numerals, and the primary button, stepper, selected-segment and FINAL-tag fill. Text on that fill is `on-ink` (#06142b).
- **Crest Blue** (`accent`, #3b96f2; `accent-2` #8cc3ff for text, focus rings, and lit edges): plate tabs, section-head slants, nav underline, meters, caps badge, focus glow. It is emphasis, never a fill for primary actions.

### Secondary (signals, one job each)
- **Live Red** (`live` #ff3d52; text-safe `live-ink` #ff9aa5): the LIVE badge, running clock, live score-bug tag, and destructive buttons. Nothing else.
- **Confirmed Green** (`good` #2fd08a; `good-ink` #7ce8b7): finalized, saved, success button.
- **Attention Amber** (`warn` #ffb454; `warn-ink` #ffd08a): stuck or unfinalized; rare.

### Tertiary
- **Banquet Gold** (`banquet`, #e0b252): only on `/awards`, banquet board scenes (`.board-banquet`), and award chips. Nowhere else.
- **Color War Blue** (`cw-blue`, #1d5bff): Color War team identity only, never a general accent.

### Neutral
- **Dusk Navy** (`paper`, #050d1c): page ground and theme color.
- **Plate Navy** (`sheet` #0a1830, `sheet-2` #0f2447): panels and raised panels; plate interiors use a #0d2044 to #091730 gradient.
- **Mist** (`ink-2` #b4c4de, `ink-3` #8196b8): secondary and tertiary text; `ink-3` is the dimmest text allowed.
- **Hairline** (rgba(160,190,235,0.16); strong 0.5 white-blue): dividers and plate edges.

### Named Rules
**The One Job Rule.** Red is live (and destructive), green is confirmed, amber is attention, gold is banquet, blue is emphasis. No color takes a second meaning.
**The White Fill Rule.** The primary fill is white on navy. Blue is never the primary button; Tailwind blue, sky, indigo, purple, cyan and teal utilities are remapped to the accent and `white` maps to `ink` in `globals.css`.
**The Gold Fence Rule.** Gold appears only on awards and banquet surfaces (`.cl-banquet`, `.board-banquet`, award chips). The legacy `--bc-gold` alias deliberately resolves to white ink, so stray uses cannot turn gold.

## Typography

**Display Font:** Big Shoulders (`--font-display`, opsz axis, next/font/google; fallback Arial Narrow)
**Body Font:** Barlow (`--font-ui`; fallback system UI sans)
**Label Font:** Barlow Condensed (`--font-label`; weights 500-800); Geist Mono is loaded for identifiers only.

**Character:** Big Shoulders is the scoreboard: condensed, uppercase, engineered. Barlow Condensed is the lower-third: nav, tags, buttons, captions. Barlow reads running text and forms.

### Hierarchy
- **Display / Hero** (800, clamp 56-120px, 0.88, uppercase): closed screen and hero moments.
- **Page Title** (800, clamp 48-92px, 0.88, uppercase): one per page, inside the banner.
- **Score** (800, 104px; 124px on the tap plate; 60-68px in short landscape, 0.86): live numerals. Game-detail headline goes to clamp 96-200px; podium first place 112px.
- **Section** (800, 30px, 1, uppercase): section head beside a slanted blue tab.
- **Body** (400, 17px, 1.45): running text, descriptions capped near 52ch.
- **Label** (600, 14px, +0.1em, uppercase, Barlow Condensed): table heads, field labels, captions. Buttons are Barlow Condensed 700 at 18px (+0.06em); nav 17px.

### Named Rules
**The Tabular Rule.** Body sets `font-variant-numeric: tabular-nums`; numerals never jitter.
**The Display Fence Rule.** Big Shoulders is for numerals, titles and section heads; never running text. Condensed labels are uppercase and short.

## Layout

One content column, `.bc-container`, max 1120px, 16px padding (24px from 768px). Gaps follow 4/8/12/16/24. The banner bleeds full viewport width, pulling up under the header, and closes on a diagonal bottom cut (22px). Below 900px a fixed five-slot bottom tab bar (64px with safe-area) carries navigation with a sliding blue indicator and a More sheet for staff tools; from 900px a sticky 64px top bar (inner width up to 1360px) carries every destination with an underline that scales in. The footer reserves 96px on phones. `/live/[id]` is a fixed full-screen root (z-index 999) with a sticky head; `/display` is a full-bleed board. Short landscape phones (max-height 520px) shrink numerals and tap plates. Podium is three columns from 768px with first place centered and taller.

## Elevation & Depth

Depth is hybrid: layered navy plates with a light-catching hairline, plus light as glow. Resting plates carry no drop shadow; emphasis is glow in accent blue.

### Shadow Vocabulary
- **Plate tab glow** (`box-shadow: 0 0 18px var(--accent)`): the 72px tab on every plate; section-head slant uses 14px at 60%.
- **Lead glow** (`0 0 40px rgba(59,150,242,0.25)` row, `0 0 60px rgba(59,150,242,0.3)` podium first): the leader only.
- **Numeral glow** (`filter: drop-shadow(0 0 22px rgba(59,150,242,0.45))` on the rolling wrapper; flash peaks at 20px accent-2 plus 5px white): scores.
- **Running clock** (`filter: drop-shadow(0 0 14px rgba(255,61,82,0.7))` pulsing): red, only while running.
- **More sheet** (`0 -16px 40px rgba(0,0,0,0.5)`) and **input focus** (`0 0 0 3px` accent at 35%).
- **Glass**: topbar and tab bar use backdrop blur (16px) over 78-92% navy; modal overlay 6px.

### Named Rules
**The Filter Glow Rule.** Glow on rolling numerals is `filter: drop-shadow` on the `.rn` wrapper, never `text-shadow`, because each digit column clips overflow and a text-shadow is cut into rectangles.
**The Scrim Rule.** The photo sits only behind atmosphere and banners, under 78-94% navy scrims, so data never lands on busy pixels.

## Shapes

Chamfer and slant, not pill and round. Plates, pods, rows, bugs and the wall board clip two opposite corners (top-right and bottom-left) at 14-26px; buttons, steppers, chips, rank boxes and tags are parallelograms (skewed ends 6-10px); the section head carries a 10x26 tab skewed -20 degrees. Inputs, selects, empty and error boxes use a 6px radius; list rows and segmented strips 6-8px. Nested plates drop the chamfer and fall back to a plain hairline 6px box. Focus-visible removes the clip-path on slanted buttons so the ring is not clipped. The only circles are the 8px live dot and the crest. Icons are inline SVG, `currentColor`.

## Components

### Buttons
- **Shape:** slanted parallelogram, 50px tall (44px `btn-sm`), Barlow Condensed 700, uppercase.
- **Primary:** white fill, navy text, 0 26px padding; hover floods to pure white and a diagonal shine sweeps across in 0.6s; press scales to 0.97; disabled 35% opacity.
- **Secondary:** translucent blue-white fill with a 1px inset edge; hover brightens the edge to accent-2.
- **Danger / Good:** tinted fill and inset edge in red or green; hover floods solid (red with white text, green with dark text).

### Stepper (scoring)
Slanted 52px white tile, 22px Barlow Condensed 800 (58px tall, 24px in the add row; 56px in stat rows). Press scales to 0.92 and turns accent-2. Undo is the quiet twin: translucent with an inset edge.

### Segmented control
Translucent 8px-radius strip, 46px buttons; selected segment is a white fill with navy text and a soft blue glow.

### Inputs / Fields
46px, 5% white fill, 1px blue-gray border, 6px radius; hover strengthens the border; focus turns it accent-2 with a 3px blue ring. Labels are always visible above, 14px condensed caps. Selects use an inline SVG chevron.

### Plates (Sheet)
`.bc-card`: chamfered, hairline gradient edge, navy interior, blue tab top-left, 18px padding (24px from 768px). `Sheet` adds an optional slanted-tab section head. Wall board cards (`.board-card`) use a 26px chamfer; the banquet variant swaps the edge to gold.

### Banner (PageHeader)
`.cl-hero`: full-bleed dusk photo, slow Ken Burns push-in (38s), navy side and floor scrims, diagonal bottom cut, huge title, optional floating crest (230px, 104px on phones; text keeps clear of it). Each page re-crops the photo through `--hero-pos`.

### Chips and status
28px slanted chip, 14px caps. LIVE badge is a red slanted tag with a pulsing white dot (never color alone). Rank boxes are slanted 34px; the leader inverts to white.

### Score bug
`.bug`: chamfered broadcast strip with a slanted status tag (LIVE red, FINAL white, otherwise translucent), stacked team names in 21px condensed, 34px rolling scores; the losing side of a final dims. Live bugs get a slow shine sweep.

### Odometer numerals
`FlashNumber` renders each digit as a 0-9 column translating in `em` on a 0.9s ease-out (counting up from 0 on load, flashing only on real change). Non-integer values fall back to plain text.

### Leaderboard row and podium
`.lb-row`: chamfered row, 54px rank numeral, clamp 30-46px name, right-aligned value, meter under; leader gets a blue-lit gradient and glow; hover nudges 4px. `.podium`/`.pod`: three chamfered pods with outlined ghost numerals; first is centered, larger, blue-lit.

### Meter
6px slanted bar filling with an accent gradient, growing from the left on load with a stagger; `lead` goes white-to-accent-2.

### Navigation
Top bar: crest wordmark that overhangs the bar, Barlow Condensed 17px links, a 3px blue underline scales in on hover (40%) and current (100%). Phone tab bar: five slots with 24px SVG icons, a 3px blue indicator that slides between slots (`--tab-i`), the active label goes white and the icon lifts 2px.

### Live scoreboard (`/live`)
Dark fixed scoreboard: 104px rolling scores, a slanted clock that turns live red and glows while running (the clock is an isolated component), 176px chamfered score-tap plates with 124px numerals, slanted steppers, player rows with a slanted captain mark.

### Motion
Transform, opacity and filter only. Blur-rise reveals (0.75s, 70ms stagger up to 9 steps), page fade, scene wipes on the wall board (0.7s clip reveal), shine sweeps, meter grow-in, sliding tab indicator, skeleton shimmer. `prefers-reduced-motion` collapses durations to near zero and stops the banner push-in and crest float.

### Named Rules
**The Compositor Rule.** Animate only transform, opacity and filter. **Never put a transform or opacity animation on `<main>`:** it creates a stacking context that traps the `/live` fixed overlay's z-index.

### Assets and provenance
- `public/crest-logo.png`: the BAUERCREST league live shield, transparent. Derived from the camp's own `public/icon-512.png` by `design-review/make-crest.mjs` (headless Chrome canvas, edge-connected white flood-fill so the white band inside the shield survives).
- `public/camp-bg.jpg`: the dusk-lake photo, the camp's existing asset carried in `public/` since before the redesign (PRODUCT.md lists it); the photographer and original capture are not recorded in the repo.

## Do's and Don'ts

### Do:
- **Do** build pages from `PageHeader`, `Sheet`, `Field`, `EmptyState`, `ErrorNote`, `SkeletonRows`, `Meter`, `ScoreBug` in `src/components/ui.jsx`, and show scores through `FlashNumber`.
- **Do** keep white as the primary fill and crest blue as emphasis only.
- **Do** keep red for live and destructive, green for confirmed, gold inside banquet surfaces only.
- **Do** pair LIVE red with a label and dot; scoring tap targets stay 44px minimum (52-58px for steppers).
- **Do** apply glow to rolling numerals as a `filter: drop-shadow` on the wrapper.
- **Do** design empty, loading (skeleton rows), error and success states, and keep a reduced-motion path for any new motion.

### Don't:
- **Don't** use text-shadow glow on rolling numerals.
- **Don't** animate transform or opacity on `<main>` or any ancestor of the `/live` fixed overlay.
- **Don't** tick state at the top of a large component for live updates; isolate it as `ClockButton` does.
- **Don't** use gold outside awards and banquet surfaces, or blue as a primary fill.
- **Don't** put the photo behind data without a heavy navy scrim, or return to a white-ledger or generic blue-gradient glass-card look.
- **Don't** use Big Shoulders for running text.

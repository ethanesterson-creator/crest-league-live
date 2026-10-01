---
version: 1
slug: "src-app-layout-js"
primary_target: "src/app/layout.js"
related_targets: []
---

# Surface brief: whole app (Operate + broadcast)

Mode: Operate. Scorers on phones (90%), wall board (10%). Direction REVISED after the user rejected the white "Scorebook" look as bland: the original dark, atmospheric, broadcast feel was the thing they loved; the upgrade must be sleeker and more alive, not plainer.

## Direction contract

THESIS: CBSN at Dusk. The Camp Bauercrest Sports Network graphics package, built from the camp's own assets: the real BAUERCREST league live crest and the real dusk-lake photo. Refuses the white-ledger minimalism it replaced and the generic blue-gradient glass-card dashboard.

OWN-WORLD: Deep navy #050D1C ground, panels #0A1830/#0D2044 with chamfered corners and a 1px light-catching edge, a short blue tab at each plate's top-left, parallelogram (slanted) buttons and tags, the dusk photo as fixed scrimmed atmosphere and as full-bleed page banners with a slow push-in and a diagonal bottom cut. White primary fills; crest blue #3B96F2 accent; red = live only; green = confirmed; gold only on the banquet (/awards, banquet scenes, award chips). Big Shoulders numerals/titles, Barlow body, Barlow Condensed labels/nav.

STORY: A counselor sees a scoreboard that feels like television and never loses a tap. Campers see standings like a league table that moves. The wall reads as a broadcast.

FIRST VIEWPORT: Every page opens on a dusk-photo banner with the title huge; home adds the floating crest and live games as broadcast score bugs; /live is a dark scoreboard with 100px rolling numerals, slanted 56px steppers and a glowing red running clock; /display is a full-bleed broadcast board with wipe transitions.

MOTION: Odometer numerals that roll on load and on every score change (glow on change); staggered blur-rise reveals; proportional meters that grow in; sliding tab indicator; shine sweep on live bugs and buttons; Ken Burns on banners; scene wipes on the wall board; all via transform/opacity/filter, no top-level ticking state (ClockButton isolation preserved), full prefers-reduced-motion path.

FORM: Broadcast graphics package (catalog world "medium-native / signals" fused with the original CBSN concept); seed 627a7676 retained, direction re-decided by the user's correction.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

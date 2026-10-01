# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Camp Bauercrest counselors scoring games live on their phones, courtside, one-handed, in sun and noise. This is about 90% of use (`/live/[id]`, `/post`, `/post/[id]`). The other ~10% is the `/display` board projected on the dining-hall wall at every meal for the whole camp (campers, staff). Campers and parents also browse standings, leaders, highlights, and player pages on phones.

## Product Purpose
Live sports scoring and stats for Camp Bauercrest's summer league and Color War. Counselors log scores and player stats as games happen; everyone else sees standings, leaders, awards, and past games update live. Success: a counselor never misses or double-taps a score because of the UI, and the wall board is readable from the back of the room.

## Positioning
A purpose-built scoring tool for one camp's leagues (seniors, juniors, sophomores, Crest Cup), with per-sport rules for hoop, soccer, softball, volleyball, football, speedball, euro, hockey, kickball, newcomb, and a Color War mode with its own team names and logos.

## Operating Context
Two modes (`league`, `color_war`) and two sessions (`s1`, `s2`). No login for counselors (they use a link); `/admin` requires sign-in. Live screen isolates the clock into its own component so taps are never eaten by re-renders; any visual work must keep that isolation. The app is currently closed for the off-season (`OFF_SEASON` in `src/app/layout.js`); it is flipped to false locally during the redesign and must be relocked to true when finished.

## Capabilities and Constraints
Next.js 16 App Router, React 19, Tailwind v4, all client-side Supabase. No logic, route, data, or schema changes in a visual revamp. The real database holds minors' data and the summer 2026 season must never be modified: visual work views pages read-only and never triggers scoring, save, or delete controls.

## Brand Commitments
Navy and white are the identity. Gold is reserved for the banquet only (not general UI accent). Camp and Color War logos stay. Current display face is Bebas Neue; existing assets in `public/` (camp-bg.jpg, icons).

## Evidence on Hand
Real camp data via Supabase (names, teams, stats). No testimonials or marketing claims exist and none should be invented.

## Product Principles
1. Scorer first: phone, one thumb, big unambiguous tap targets, nothing that shifts under a finger.
2. The wall board is a broadcast: legible at distance, no interaction.
3. Navy and white carry the identity; gold is earned, banquet only.
4. Visual changes never alter behavior, data, or routes.

## Accessibility & Inclusion
Outdoor glare and small phones: high contrast, large tap targets, visible keyboard focus. Audience includes children, so copy stays plain.

Plan: minimalist, light UI/UX redesign

Branch: ui/redesign-light (branched from game/msl-edl). Do not touch main.

Goal

The UI of the Mission Architect game (frontend/src/mission-architect/) moves to a light, minimalist style, inspired by the "Welcome, Salung / Schedule" reference: warm gray background, almost-white cards with large rounded corners, soft shadows, lots of breathing room, clean typography and pill buttons. Accent colors are taken from the NASA logo (colors only: no logo or branding, see the restrictions in CLAUDE.md).

Visual language (tokens)
Token	Value	Use
--bg	
#ECEBE8	page background (warm gray)
--surface	
#F7F6F4	cards
--surface-2	
#FFFFFF	inner card / input / highlighted note
--line	
#E2E0DC	1px borders, dividers
--text	
#1A1A1A	headings and text
--text-muted	
#8A8885	subtitles, states ("Upcoming")
--primary	
#0B3D91	NASA blue: primary button, selection, card side bar
--primary-soft	#0B3D9114	chip/selection background
--accent	
#FC3D21	NASA red: only one key element per screen (alert, indicator, risk CTA)
--ok / --warn / --error	
#2E9E6A / 
#C98A12 / 
#FC3D21	states
--radius-lg / --radius / --radius-pill	24px / 14px / 999px	card / control / button
--shadow	0 1px 2px #0000000a, 0 8px 24px #0000000d	single elevation
--sans	Inter, system-ui	all text (Google Fonts)

Rules:

A single elevation (--shadow); 1px borders separate elements, not stacked shadows.
Primary button: solid blue pill. Secondary: white pill with a border. Icon button: 40px white circle.
List cards: 3px vertical bar on the left (blue; red if it is an alert), title + state in gray.
Navigation: floating pill-shaped bar with icons; the active item sits in a white circle.
Red is used sparingly: one accent per screen, like the orange in the reference.
No forced uppercase, no diagonal clip-path, no halftone, no skew.
The 3D scenes (Three/Cesium) keep their dark space background; only the frame/HUD around them changes, becoming translucent light cards (backdrop-filter: blur).

Scope: the game only. The GMAT editor (App.module.css, mission/, resources/, results/) is not touched.

Work (in order)
Font — Inter from Google Fonts in frontend/index.html.
Game — mission-architect/styles.css (910 lines): remap the .ma variables (--bg --panel --panel2 --line --text --dim --lime --pink --cyan…) to the new tokens so everything changes at once; then clean up section by section: buttons (remove diagonal cuts), top bar (steps as pills), title, dialogue (speech bubble as a white card), hangar, mapping, report, setup. Delete dead rules (.halftone, skew).
Hard-coded colors in the game's TSX — ui/Portrait.tsx, ui/Patch.tsx, three/Backdrop3D.tsx, three/HomeScene.tsx, three/CoreSample.tsx and loose style={{}}: move only the UI parts to var(--…); 3D art and portraits are left alone unless they clash with the light background.
UX polish — consistent spacing (multiples of 8), visible hover/focus/disabled states (blue :focus-visible), AA contrast for gray text on --bg, layout with no horizontal scroll at 1280px and 390px.
Verification
cd frontend && npm run build with no errors.
Walk through the full game in Chrome (Claude in Chrome) (title → story → setup → orbit → hangar → landing → report). Screenshot of every screen.
No changes to logic or texts (i18n) unless the user asks for them.
sh docs/docs.sh stale and update whatever it lists.
Out of scope

GMAT editor, dark mode, new screens, physics/engine changes, redesign of the 3D art and portraits.
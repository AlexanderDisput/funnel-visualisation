# Recruiting Funnel

An interactive, dependency-free visualization for sales demos. It shows how
recruiting levers change who discovers your jobs, who applies, and who you hire —
candidates rain down as glowing bubbles, get caught by a funnel, leak out through
brand-driven holes, and collect in bins at the bottom.

![Recruiting Funnel](https://github.com/AlexanderDisput/funnel-visualisation/raw/main/preview.png)

## Run it

No build step, no install. Just open `index.html` in any modern browser
(double-click it, or `open index.html` on macOS).

## The levers

| Lever | What it controls | The story |
|-------|------------------|-----------|
| **Visibility** | Funnel **mouth width** | Driven by budget, keywords, and employer brand awareness (EBA). Wider reach catches more candidates; those outside the mouth never engage and fall into **NOT REACHED**. |
| **Conversion** | **Hole size** in the funnel's V-shaped walls | Driven by employer branding, keyword match, benefits & salary. Low conversion = big holes; candidates slide down the walls and leak out into **DROPPED OFF**, high-quality (red) candidates first. |

Candidates trickle in at a constant rate. Survivors flow through the outlet into **APPLICATIONS**.

## Controls

- **Scenario presets** — *Tight budget · weak brand*, *Balanced*, *Full Indeed stack* — set both levers at once.
- **Pause / Reset** — freeze the scene or clear the bins.
- High-quality candidates are red (with a glow halo); standard candidates are neutral.

## How it works

Plain `index.html` + `style.css` + `script.js`:

- Custom canvas particle system — candidates are lightweight particles with a small
  state machine (falling → in-funnel → leaking / to-outlet → settling).
- Candidates collide with the funnel's V-shaped walls (simple circle-vs-segment
  physics) and slide down into the outlet; gaps in the walls let some leak out.
- Bubbles are pre-rendered glowing sprites, blitted per frame for performance.
- The collection bins use light collision physics so candidates pack naturally.
- Fully offline; the only external request is the Inter webfont.

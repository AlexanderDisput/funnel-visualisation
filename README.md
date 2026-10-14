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
| **Budget & Visibility** | Funnel **mouth width** | Wider reach catches more of the falling candidates. Those outside the mouth never engage — they fall into **NOT REACHED**. |
| **Employer Branding** | **Hole size** in the funnel slopes | Weak brand = big holes; candidates leak out into **DROPPED OFF**. High-quality (red) candidates walk first. Strong brand closes the gaps. |
| **Candidate Volume** | Spawn rate | The size of the talent pool reaching the market. |

Survivors flow through the outlet into **APPLICATIONS**.

## Controls

- **Scenario presets** — *Tight budget · weak brand*, *Balanced*, *Full Indeed stack* — set all three levers at once.
- **Pause / Reset** — freeze the scene or clear the bins.
- High-quality candidates are red (with a glow halo); standard candidates are neutral.

## How it works

Plain `index.html` + `style.css` + `script.js`:

- Custom canvas particle system — candidates are lightweight particles with a small
  state machine (falling → in-funnel → leaking / to-outlet → settling).
- Bubbles are pre-rendered glowing sprites, blitted per frame for performance.
- The collection bins use light collision physics so candidates pack naturally.
- Fully offline; the only external request is the Inter webfont.

# Plan: the big expansion (branch `dev`, not released)

User request (2026-11-26):
- Add a couple of hundred hours of content.
- Tighten the gameplay loop.
- Add interstellar elements and some custom content.
- Remake the menus, art and graphics with smoother, cooler effects and cinematics.
- Build it with opencode, using local ollama where possible.
- Test on Linux; Windows comes at the end.

Nobody hand-writes 200 hours. That length comes from systemic, procedural content:
- a campaign that scales across about 60 stars;
- a large event deck;
- a tech tree;
- an endless mode.

The handcrafted parts (acts, story beats, set pieces) give it shape.

## 1. The tightened loop

The current loop is one-shot: Tau Ceti → Taumoeba → deliver to two stars. The new loop repeats for every infected star:

```
SCOUT  (relays reveal stars, their infection and their biosphere needs)
  → TRAVEL  (relativistic jumps; events happen in flight)
  → SURVEY  (scan and sample planets, which gives genes and research)
  → ADAPT   (breed a strain that fits the target star's biosphere profile)
  → DELIVER (fly there yourself, or send a Beetle probe with the strain)
  → HARVEST and UPGRADE (fuel from the Petrova line; Rocky crafts, research unlocks tech)
```

The single "Directive" becomes a **mission board** with three or four live contracts and their deadlines, picked from
the galaxy's state. The player always has a choice and always knows why it matters.

## 2. Systems (sim, pure JS, node-testable)

| # | Module | What it adds |
|---|---|---|
| S1 | `sim/content.js` + `content/*.js` | Data registry for events, POIs, techs, star extras and strain traits. Content packs are plain ES modules, so custom content is added by dropping in a file and listing it in `content/index.js`. |
| S2 | `sim/galaxy.js` | About 60 stars: the real catalog plus seeded procedural stars within 25 ly. Fog of war (`known` / `surveyed`). Infection spreads star to star over time along "Astrophage lanes". Relays reveal a radius. |
| S3 | `sim/genetics.js` | Strains get traits instead of one tolerance number: nitrogen, CO₂, cold, heat, radiation, generation speed. Each star has a biosphere profile. A delivery works when the strain covers that profile. Breeding picks which traits to push. Escape risk is kept. |
| S4 | `sim/beetles.js` | Beetle courier probes, crafted from xenonite and fuel. They carry a strain to a star, arrive after the relativistic flight time, and can be lost to events. This is what makes saving many stars possible. |
| S5 | `sim/events.js` | An event deck. Events trigger in flight, on arrival, on survey, or at random by world time. Each is a card with 2–3 choices and their effects (fuel, hull, samples, genes, research, infection, Rocky's materials, unlocks). Events can chain through flags. |
| S6 | `sim/tech.js` | A tech tree of about 40 nodes in 5 branches (Drive, Lab, Xenonite, Survey, Probes), bought with research from samples, surveys and events. It folds in the existing Rocky recipes. |
| S7 | `sim/campaign.js` | Acts and the mission board (see §3), win and lose conditions per act, and endless mode. |
| S8 | `sim/poi.js` | Interstellar points of interest on the map: derelict probes, rogue planets, Astrophage clouds (harvest fuel mid-flight), nebula pockets, ancient relay buoys (original lore, see §4), and stranded ships. |

## 3. Campaign

- **Act I, "Hail Mary"** (the tutorial; about 2 h): the current game, in its current form.
- **Act II, "The Spread"** (about 20–40 h): Astrophage is detected around 12 more stars, and lanes carry it further.
  Save as many as possible. Each saved star unlocks something: a tech, a relay site or a story beat.
- **Act III, "The Lanes"** (about 20–40 h): follow the lanes outward to find where the spread comes from.
  Deep-space POIs, the original lore, and a final set-piece star.
- **Endless "Petrova Front"** (unbounded; this is where the hundreds of hours come from): seeded galaxies, harder
  modifiers each cycle, a score for star-years saved, and run-to-run unlocks.

## 4. Custom content (our own lore, not from the book)

- **The Cartographers:** a long-dead species that left relay buoys along the Astrophage lanes. They studied the
  spread long ago. Their buoys can be repaired as relays and hold story fragments.
- **Stranded ships:** several procedural alien crews met through event chains. They can trade genes or materials.
- **Strain names:** players name their bred strains, and the names appear in the log and the delivery cinematics.
- **Content packs** (`content/`): events, POIs and techs are data files, so new content means adding a file.

## 5. Presentation

- **Post-processing pass** (WebGL): bloom on stars and flares, vignette, subtle film grain and chromatic fringe, all
  toggleable and cheap.
- **Title screen:** a slow cinematic camera drift past a dimming star with a Petrova line; menu items animate in; a
  continue card shows the save's act and day.
- **Scene transitions:** fades and slides between Nav, System and Lab; no hard cuts.
- **Jump cinematic:** star streaks, a time-dilation counter (ship years vs world years), and an arrival flash.
- **Delivery cinematic:** the star re-brightens and the Petrova line fades, with the strain name on screen.
- **Act cards:** full-screen title cards between acts.
- **Map:** lanes as animated flowing lines; fog of war as a soft nebula mask; relay radii as rings.
- **UI:** consistent motion with eased CSS transitions, 120–200 ms on panels.

## 6. Build order

1. S1 content registry and S5 events, with tests. A UI event-card modal.
2. S2 galaxy and fog of war, the map changes for lanes and fog, and S8 POIs.
3. S3 genetics: migrate the lab and keep old saves loading. S4 Beetles.
4. S6 tech tree with a UI screen. S7 campaign and mission board UI, replacing the directive.
5. Presentation: post-FX, title, transitions, jump and delivery cinematics, act cards.
6. Balance: a headless autoplayer (node) plays seeded runs to measure act lengths and catch dead ends.

Each step is an opencode task scoped to a few files, with `node --test` coverage for sim modules. The UI is checked
with headless Linux screenshots. The Windows check comes at the end.

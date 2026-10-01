# itch.io store page — Flagship: Six Seas

Copy for the itch.io project page. English only: the storefront audience is English, and mixing
languages on a store page reads as unfinished.

## Fields

| Field | Value |
|---|---|
| Title | `Flagship: Six Seas` |
| Short description / tagline | `Fast third-person naval combat you can play right now in your browser. Steer, fire a full broadside, and break six pirate captains.` |
| Classification | Game |
| Kind of project | HTML |
| Upload | `flagship-arena-itch.zip`, "This file will be played in the browser" checked |
| Embed size | 960 × 540 (16:9) |
| Pricing | Free, with an optional donation. itch only allows donations on HTML5 games; selling requires switching to a Downloadable build. |
| Tags | `naval`, `3d`, `action`, `browser`, `pirate`, `ship`, `singleplayer`, `short`, `fast-paced`, `arcade` |
| Cover | `artifacts/cover-630x500.png` |
| Screenshots | `artifacts/shots/01-menu.png` … `07-shipyard.png` (1440×900) |

Pick tags from itch's own suggested list where an equivalent exists, and only keep the ones that
are actually true — tags feed in-site discovery, which matters far more than social traffic.

## Description

**Six seas. One flagship. Nothing to install.**

*Flagship: Six Seas* is a fast, loud third-person naval battle you play in the browser. Take the
wheel, hold down the broadside, and break six pirate captains — one route at a time.

### Fight

- Steer with **WASD** or the left stick; the ship keeps cruising when you let go.
- Turn your side to the enemy and hold **Broadside** — every gun in the battery fires in sequence,
  one after another.
- **Boost** to close distance or slip out of a warning line, **Switch Target** to keep your guns on
  the ship that matters.
- Ram a barrel to repair, a crate to reload. Shells cost real barrels, so a full volley is never free.

### Grow

- Every three enemies is a wave. Clear one and the battle pauses for a three-way refit: more barrels,
  faster reload, burning shot, chain detonation, or counter-charge.
- Sink a captain and take their ship — brigantine, galleon, xebec, frigate, ship of the line, and
  finally the treasure ship.
- Salvage survives a loss. Spend it in the dock on permanent gunnery, hull and helm training.
- Finish all six routes and start the next voyage with everything carried over. Five difficulty
  tiers, and the climb keeps counting past them.

### The captains

Every route ends with a giant two and a half to three and a half times your hull, with five attack
patterns: fan barrage, leading mortar, ram, sweeping broadside and encirclement. The warning lines
are always drawn before the shot lands. Read them, turn hard, and punish the reload window for
**+35%** damage.

### Built to be picked up

- A single run is minutes, not hours.
- Mouse, keyboard or touch.
- Runs in a phone browser. No download, no account, no server.
- Progress saves locally in your browser only.

### Controls

| Action | Keyboard | Touch |
|---|---|---|
| Steer | WASD | left stick |
| Broadside | Space (hold) | Broadside (hold) |
| Boost | Shift | Boost |
| Switch target | Q | Switch Target |
| Pause | Esc | pause button |

### Credits

- Music: *Pirate Indenture* by Eldritch Grim, via [OpenGameArt](https://opengameart.org/content/pirate-indenture) — **CC0 1.0**, public domain.
- Ships, sea, islands and effects: modelled and rendered for this project with Blender and Three.js.
- Built with Three.js and Vite.

Runs on any current Chrome, Edge, Firefox or Safari, desktop or mobile. WebGL2 required.

## Devlog plan

itch devlogs are indexed even before a project has files, so the page can start gathering search
traffic while it is still a draft. Three posts, roughly one per week:

1. **Why a browser build** — shipping a naval brawler as a static site: Three.js, meshopt-compressed
   GLB ships, per-route lazy loading, and the 1.4 MiB first-route budget.
2. **Making the broadside readable** — how the warning lines, the aim hint and the +35% reload window
   teach the fight without a tutorial.
3. **Six routes in sixty seconds each** — pacing a run so a loss never feels like wasted time.

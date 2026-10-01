# X (Twitter) account — Flagship: Six Seas

Everything needed to open the account. English only: the audience is the English indie-game
circle, and a mixed-language profile reads as a personal account rather than a game.

## Account setup

| Field | Value |
|---|---|
| Display name | `Flagship: Six Seas` |
| Handle (first choice) | `@FlagshipSixSeas` — exactly 15 characters, X's limit |
| Handle (fallbacks) | `@SixSeasGame`, `@Flagship6Seas`, `@PlaySixSeas` |
| Avatar | `artifacts/x-avatar-512.png` |
| Header | `artifacts/x-header-1500x500.png` |
| Location | leave empty |
| Website | the itch.io page, once it is public |
| Pinned post | the launch post, once the page is public |

Check the handle is free before committing to it — X will not let you rename cheaply once
followers exist.

## Bio (160 character limit)

```
Third-person 3D naval combat you can play right now in a browser. Six routes, six pirate captains, no install. Made by @lemonhall
```

144 characters. Do not label this account as a bot: it is the game's own account run by its
developer, not an automated feed, and X's automated-label rule only binds accounts that post
without a human in the loop.

## Rules that apply from day one

- No links in the first two weeks. The account has to look like a developer before it looks
  like a storefront.
- At most two hashtags per post. X's public ranking documentation gives hashtags no weight,
  and its own guidance caps them at two.
- Never post the same text twice within 24–48 hours; near-duplicates are rejected outright.
- No follow-for-follow, no engagement pods, no automated following. The free tier's posting
  ceiling is 50 posts and 200 replies a day and X watches follow/unfollow cycling closely.

## First ten posts

Ordered, one every day or two. Every one is usable before the itch page exists.

1. A 10–20 second silent GIF of a full broadside landing. No caption beyond one line.
2. What this is: one paragraph and a still of the title screen. No link yet.
3. The reload window mechanic: the warning line is drawn before the shot lands, and a boss
   caught reloading takes +35%. One GIF showing the punish.
4. A wipe: three attempts at the same boss, two losses, one win. Losses get more engagement
   than wins.
5. The refit screen: three upgrades offered after a wave. Ask which one people would take.
6. A technical note: `Three.js, meshopt-compressed GLB ships, 1.4 MiB for the whole first
   route.` Include the file-size number; specifics travel.
7. `#ScreenshotSaturday` with one clean in-game shot. Two tags maximum.
8. The dock: permanent upgrades that survive a loss, plus the "salvage is never wasted" line.
9. The treasure ship, as the reward for finishing all six routes.
10. Launch post: one GIF of the boss fight, "free and playable in your browser right now",
    the itch link. Pin it.

## Expectation setting

Measured write-ups of indie launches consistently show social traffic converting poorly
compared to itch's own discovery: one published post-mortem records a from-scratch X account
producing **four** referral clicks to its itch page, while in-site browse and tags drove the
launch. The distribution that actually works, in the order one write-up measured it, is
`itch in-site > Reddit > Facebook > Bluesky > X`.

So the plan is not "grow the X account and watch sales arrive". It is:

1. Make the itch page good enough to be found and kept in itch's own browse and tag lists.
2. Use X and Bluesky as the place the account looks alive when someone checks who made the game.
3. Post the devlog on itch, not only on X — itch devlogs are indexed even for draft projects.
4. Put UTM parameters on every link so itch's referrer report can settle the argument with data
   instead of instinct, and reallocate effort towards whatever actually moved.

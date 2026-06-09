# 🦝 Trash Panda Empire

An idle tycoon prototype with a twist: raccoons flipping garbage into a corporate
"waste lifestyle brand." Web-playable now, designed to port to iOS/Android later
(e.g. via Capacitor).

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build
```

## What's in the prototype

The core loop is standard idle-tycoon (proven formula), and the differentiation
budget goes to two systems most idle games don't have:

### 1. Chaos events 📋
Every ~50–100 seconds something absurd happens (health inspector in the
dumpster, seagull union, sentient compost). You get 12 seconds to pick a
response; outcomes are weighted rolls — cash swings and temporary buffs/debuffs.
All content lives in `src/content.ts` and is trivially extensible.

### 2. Mutating prestige 📈
"Rebrand" resets the run for permanent **Street Cred** (+10% revenue each,
earned as `floor(sqrt(runEarnings / 25K))`). Each rebrand forces a choice
between two random **mutations** that change the rules of the next run
(2× speed but 2× chaos, 3× revenue but steeper prices, tap-focused
"Influencer Era", etc.) — so runs play differently instead of just being
bigger numbers.

### Standard idle-game plumbing
- 6 stations with exponential upgrade costs (~1.13–1.16× per level) and
  milestone revenue doublings at Lv 25 / 50 / every 100
- Tap-to-rush any station for instant cycle completion (active play bonus)
- Offline earnings (40% rate, 8 h cap), autosave to `localStorage`
- Buy ×1 / ×10 / ×MAX toggle
- Rotating customer reviews from named regulars (Gary the Possum, et al.)

## Code map

| File | Role |
| --- | --- |
| `src/content.ts` | All stations, chaos events, mutations, reviews (pure data) |
| `src/game.ts` | Engine: economy math, tick loop, chaos scheduling, prestige |
| `src/state.ts` | Save state shape + localStorage persistence |
| `src/ui.ts` | DOM rendering, modals, toasts |
| `src/main.ts` | Boot + tick/autosave timers |

## Roadmap ideas

- Real art + animation pass (the clip-ability layer)
- More chaos events, mutations, and station tiers
- Persistent named regulars with their own storylines
- Async social: friends' shops as neighbors, raid minigame
- "Broadcast mode": one-tap shareable clip of your last chaos event
- Rewarded-ad hooks (2× earnings, offline doubler) once the loop is proven
- Capacitor wrapper for iOS/Android

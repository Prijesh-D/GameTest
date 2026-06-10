// All game content lives here, data-driven so theme/balance can be iterated
// without touching engine code.

export interface StationDef {
  id: string;
  name: string;
  flavor: string;
  emoji: string;
  baseCost: number;
  costGrowth: number; // price multiplier per level
  baseRevenue: number; // per cycle, per level
  cycleTime: number; // seconds per cycle
}

export const STATIONS: StationDef[] = [
  {
    id: 'dumpster',
    name: 'Dumpster Dive',
    flavor: 'Where it all began. One raccoon, one dream, one questionable smell.',
    emoji: '🗑️',
    baseCost: 10,
    costGrowth: 1.13,
    baseRevenue: 1,
    cycleTime: 1.2,
  },
  {
    id: 'crusher',
    name: 'Can Crusher',
    flavor: 'Aluminum is just money that screams.',
    emoji: '🥫',
    baseCost: 160,
    costGrowth: 1.14,
    baseRevenue: 14,
    cycleTime: 3,
  },
  {
    id: 'cauldron',
    name: 'Compost Cauldron',
    flavor: "It bubbles. We don't ask why.",
    emoji: '🫧',
    baseCost: 2800,
    costGrowth: 1.14,
    baseRevenue: 110,
    cycleTime: 6,
  },
  {
    id: 'sorter',
    name: 'Scrap Sorter',
    flavor: 'A raccoon with a clipboard sorts bolts by vibe.',
    emoji: '🔩',
    baseCost: 50_000,
    costGrowth: 1.15,
    baseRevenue: 1300,
    cycleTime: 12,
  },
  {
    id: 'atelier',
    name: 'Upcycling Atelier',
    flavor: "That's not a broken lamp. It's a statement piece.",
    emoji: '🎨',
    baseCost: 900_000,
    costGrowth: 1.15,
    baseRevenue: 16_000,
    cycleTime: 24,
  },
  {
    id: 'boutique',
    name: 'Artisanal Garbage Boutique',
    flavor: 'Hand-foraged. Small-batch. Pre-owned by the entire city.',
    emoji: '🛍️',
    baseCost: 20_000_000,
    costGrowth: 1.16,
    baseRevenue: 250_000,
    cycleTime: 45,
  },
];

export interface EffectMods {
  revMult?: number;
  speedMult?: number;
  costMult?: number;
  costGrowthAdd?: number;
  eventFreqMult?: number;
  tapMult?: number; // bonus multiple of cycle revenue paid on tap-rush
  credMult?: number;
  startCashPct?: number; // % of last run's earnings as seed money
}

export interface Mutation {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  mods: EffectMods;
}

export const MUTATIONS: Mutation[] = [
  {
    id: 'night_shift',
    name: 'Night Shift',
    emoji: '🌙',
    desc: 'Raccoons are nocturnal anyway. Everything runs 2× faster — but chaos strikes twice as often.',
    mods: { speedMult: 2, eventFreqMult: 2 },
  },
  {
    id: 'premium',
    name: 'Premium Garbage',
    emoji: '💎',
    desc: "Revenue ×3, but upgrade prices climb steeper. Luxury isn't cheap. Even ours.",
    mods: { revMult: 3, costGrowthAdd: 0.03 },
  },
  {
    id: 'rat_union',
    name: 'Rat Union',
    emoji: '🐀',
    desc: 'The rats negotiate bulk discounts: upgrades 35% cheaper, but they take 20% of revenue.',
    mods: { costMult: 0.65, revMult: 0.8 },
  },
  {
    id: 'influencer',
    name: 'Influencer Era',
    emoji: '🤳',
    desc: 'Tapping a station pays a 10× bonus, but passive revenue drops to 60%. Content is king.',
    mods: { tapMult: 10, revMult: 0.6 },
  },
  {
    id: 'corporate',
    name: 'Corporate Backing',
    emoji: '🏢',
    desc: "Start the run with seed funding (5% of last run's earnings), but investors take 25% of your Street Cred.",
    mods: { startCashPct: 0.05, credMult: 0.75 },
  },
  {
    id: 'zen',
    name: 'Dumpster Zen',
    emoji: '🧘',
    desc: 'Chaos events half as often and revenue ×1.5 — but the raccoons move mindfully. 25% slower.',
    mods: { eventFreqMult: 0.5, revMult: 1.5, speedMult: 0.75 },
  },
  {
    id: 'gourmet',
    name: 'Gourmet Rot',
    emoji: '🧀',
    desc: 'Aged garbage commands double prices, but curing takes time: production 30% slower.',
    mods: { revMult: 2, speedMult: 0.7 },
  },
  {
    id: 'swarm',
    name: 'Pigeon Street Team',
    emoji: '🐦',
    desc: 'A pigeon promo crew makes everything 1.5× faster — but they eat 10% of revenue. Literally.',
    mods: { speedMult: 1.5, revMult: 0.9 },
  },
];

export interface BuffSpec {
  label: string;
  revMult?: number;
  speedMult?: number;
  durationSec: number;
}

export interface Outcome {
  cashSeconds?: number; // grants N seconds of current income
  cashPct?: number; // +/- fraction of current cash
  buff?: BuffSpec;
}

export interface WeightedOutcome {
  weight: number;
  text: string;
  outcome: Outcome;
}

export interface ChaosChoice {
  label: string;
  results: WeightedOutcome[];
}

export interface ChaosEvent {
  id: string;
  title: string;
  emoji: string;
  text: string;
  choices: ChaosChoice[];
  timeout: WeightedOutcome;
}

export const CHAOS_EVENTS: ChaosEvent[] = [
  {
    id: 'inspector',
    title: 'Health Inspector',
    emoji: '📋',
    text: 'A city health inspector is standing inside your dumpster. He looks disappointed, but not surprised.',
    choices: [
      {
        label: 'Bribe him with something shiny',
        results: [
          {
            weight: 70,
            text: 'He pockets the bottle cap and leaves. A professional.',
            outcome: { cashPct: -0.05 },
          },
          {
            weight: 30,
            text: 'He is DELIGHTED. He awards you a sticker that says "PASSABLE."',
            outcome: {
              cashPct: -0.05,
              buff: { label: 'Inspector-Approved™', revMult: 1.5, durationSec: 90 },
            },
          },
        ],
      },
      {
        label: 'Everyone play dead',
        results: [
          {
            weight: 50,
            text: 'He checks for a pulse, finds none, and files the site as "abandoned property." You now operate tax-free.',
            outcome: { buff: { label: 'Officially Abandoned', revMult: 1.75, durationSec: 60 } },
          },
          {
            weight: 50,
            text: 'He is not fooled. The fine is itemized. There is a line item for "audacity."',
            outcome: { cashPct: -0.2 },
          },
        ],
      },
      {
        label: 'Hire him on the spot',
        results: [
          {
            weight: 100,
            text: 'He accepts immediately. He hated that job. He brings compliance expertise and donuts.',
            outcome: {
              cashPct: -0.15,
              buff: { label: 'Head of Compliance', revMult: 2, durationSec: 120 },
            },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'You hid behind the cauldron until he left. He left a pamphlet titled "So You Live In Garbage."',
      outcome: { cashPct: -0.1 },
    },
  },
  {
    id: 'viral',
    title: 'Going Viral',
    emoji: '📱',
    text: 'A teenager filmed your raccoons synchronized-diving into the compost. 2.3M views and climbing.',
    choices: [
      {
        label: 'Drop merch immediately',
        results: [
          {
            weight: 100,
            text: 'The "DIVE TEAM" hoodies sell out in minutes. To other raccoons, mostly.',
            outcome: {
              cashSeconds: 90,
              buff: { label: 'Viral Moment', revMult: 2, durationSec: 75 },
            },
          },
        ],
      },
      {
        label: 'Issue a corporate apology',
        results: [
          {
            weight: 100,
            text: 'Nobody asked for an apology. It also goes viral. Confusing, but profitable.',
            outcome: { cashSeconds: 30 },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'The internet moved on to a cat playing piano. So it goes.',
      outcome: {},
    },
  },
  {
    id: 'seagulls',
    title: 'Seagull Union',
    emoji: '🐦',
    text: 'The seagulls in the parking lot have unionized. Their demands: one (1) entire bag of fries.',
    choices: [
      {
        label: 'Meet their demands',
        results: [
          {
            weight: 100,
            text: 'They accept the fries and provide air security. Nothing gets stolen. For once.',
            outcome: {
              cashPct: -0.03,
              buff: { label: 'Air Security', revMult: 1.4, durationSec: 90 },
            },
          },
        ],
      },
      {
        label: 'Union-bust (hire one pigeon)',
        results: [
          {
            weight: 50,
            text: 'The pigeon is a natural. The seagulls disperse, muttering about solidarity.',
            outcome: { buff: { label: 'Pigeon Efficiency', speedMult: 1.5, durationSec: 60 } },
          },
          {
            weight: 50,
            text: 'The seagulls strike. Production is intermittently screamed at.',
            outcome: { buff: { label: 'Seagull Strike', revMult: 0.5, durationSec: 45 } },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: "They took the fries anyway. And a churro you didn't know you had.",
      outcome: { cashPct: -0.05 },
    },
  },
  {
    id: 'sentient',
    title: "It's Alive",
    emoji: '🫧',
    text: 'The Compost Cauldron has achieved consciousness. It is asking about dental coverage.',
    choices: [
      {
        label: 'Grant it dental',
        results: [
          {
            weight: 100,
            text: 'It has no teeth, but it appreciates the gesture. Morale soars.',
            outcome: {
              cashPct: -0.08,
              buff: { label: 'Sentient & Satisfied', speedMult: 1.75, durationSec: 90 },
            },
          },
        ],
      },
      {
        label: 'Unplug it',
        results: [
          {
            weight: 60,
            text: 'It was never plugged in. It respects the attempt and works harder out of fear.',
            outcome: { buff: { label: 'Motivated by Fear', speedMult: 1.5, durationSec: 60 } },
          },
          {
            weight: 40,
            text: 'It is deeply offended and slows to a sulk.',
            outcome: { buff: { label: 'Sulking Cauldron', speedMult: 0.6, durationSec: 45 } },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'It got bored waiting and started a podcast instead.',
      outcome: {},
    },
  },
  {
    id: 'grant',
    title: 'Sustainability Grant',
    emoji: '🏛️',
    text: 'The city has mistakenly classified you as a "circular-economy sustainability startup." There is a check.',
    choices: [
      {
        label: 'Cash it. Cash it now.',
        results: [
          {
            weight: 100,
            text: 'You are now legally a startup. The check clears. Nobody reads the impact report.',
            outcome: { cashSeconds: 120 },
          },
        ],
      },
      {
        label: 'Correct them honestly',
        results: [
          {
            weight: 100,
            text: 'The clerk is so moved by your honesty he approves a smaller "ethics" grant on the spot.',
            outcome: {
              cashSeconds: 45,
              buff: { label: 'Civic Darling', revMult: 1.3, durationSec: 90 },
            },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'The check expired while you argued about what "circular" means.',
      outcome: {},
    },
  },
  {
    id: 'possum',
    title: 'Rival Possum',
    emoji: '🎭',
    text: 'A possum opened a competing trash stand across the street. His business strategy is playing dead at customers.',
    choices: [
      {
        label: 'Acquire his startup',
        results: [
          {
            weight: 100,
            text: 'He accepts three grapes and the title "Director of Lying Down."',
            outcome: {
              cashPct: -0.12,
              buff: { label: 'Possum Synergy', revMult: 1.5, durationSec: 120 },
            },
          },
        ],
      },
      {
        label: 'Befriend him',
        results: [
          {
            weight: 50,
            text: 'He shares his secret dumpster route. Logistics improve dramatically.',
            outcome: { buff: { label: 'Secret Routes', speedMult: 1.5, durationSec: 90 } },
          },
          {
            weight: 50,
            text: 'He plays dead at you. The conversation goes nowhere.',
            outcome: {},
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'He fell asleep mid-grift. The crisis resolved itself.',
      outcome: {},
    },
  },
  {
    id: 'rain',
    title: 'Artisanal Soup',
    emoji: '🌧️',
    text: "It's raining hard. The open dumpster is now, technically, a soup.",
    choices: [
      {
        label: 'Rebrand it as gazpacho',
        results: [
          {
            weight: 100,
            text: 'Food critics arrive. One says "challenging." Another cries. It sells.',
            outcome: {
              cashSeconds: 60,
              buff: { label: 'Gazpacho Buzz', revMult: 1.5, durationSec: 60 },
            },
          },
        ],
      },
      {
        label: 'Put a lid on it',
        results: [
          {
            weight: 100,
            text: 'Responsible. Boring, but responsible.',
            outcome: {},
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'The soup achieved a rolling boil somehow. Concerning.',
      outcome: { buff: { label: 'Soup Incident', revMult: 0.7, durationSec: 30 } },
    },
  },
  {
    id: 'influencer_visit',
    title: 'Influencer Visit',
    emoji: '🤳',
    text: 'A raccoon influencer (400K followers, mostly pigeons) wants free merchandise "for the exposure."',
    choices: [
      {
        label: 'Give the freebie',
        results: [
          {
            weight: 60,
            text: 'The post slaps. The pigeons arrive with wallets. Whose wallets? Unclear.',
            outcome: { buff: { label: 'Sponsored Content', revMult: 1.75, durationSec: 75 } },
          },
          {
            weight: 40,
            text: 'She posts it with no tag. Exposure achieved: zero.',
            outcome: { cashPct: -0.03 },
          },
        ],
      },
      {
        label: 'Charge full price',
        results: [
          {
            weight: 100,
            text: 'She respects the hustle and pays. Then posts about "this brave little brand."',
            outcome: { cashSeconds: 45 },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'Her manager (also a raccoon) sent a strongly worded DM.',
      outcome: {},
    },
  },
  {
    id: 'pizza_rat',
    title: 'Pizza Rat Cameo',
    emoji: '🍕',
    text: 'THE Pizza Rat is here, dragging an entire slice. Paparazzi pigeons are everywhere.',
    choices: [
      {
        label: 'Offer a brand partnership',
        results: [
          {
            weight: 70,
            text: 'He accepts via aggressive nodding. Foot traffic explodes.',
            outcome: { buff: { label: 'Pizza Rat Collab', revMult: 1.75, durationSec: 90 } },
          },
          {
            weight: 30,
            text: "He's lactose intolerant now. The moment passes awkwardly.",
            outcome: {},
          },
        ],
      },
      {
        label: 'Charge the pigeons for photos',
        results: [
          {
            weight: 100,
            text: 'They pay in coins they definitely found legally.',
            outcome: { cashSeconds: 60 },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'He left. So did your pepperoni inventory.',
      outcome: { cashPct: -0.05 },
    },
  },
  {
    id: 'census',
    title: 'Raccoon Census',
    emoji: '📊',
    text: 'A clipboard raccoon is conducting the official alley census. He has questions. So many questions.',
    choices: [
      {
        label: 'Answer honestly',
        results: [
          {
            weight: 100,
            text: 'You are now eligible for municipal trash subsidies. Democracy works.',
            outcome: { cashSeconds: 45, buff: { label: 'Registered Business', revMult: 1.2, durationSec: 60 } },
          },
        ],
      },
      {
        label: 'Claim to be 80 raccoons',
        results: [
          {
            weight: 50,
            text: 'The per-capita subsidy check is ENORMOUS.',
            outcome: { cashSeconds: 150 },
          },
          {
            weight: 50,
            text: 'Census fraud. The fine is itemized per fictional raccoon.',
            outcome: { cashPct: -0.25 },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'You were marked "uncooperative (typical)."',
      outcome: {},
    },
  },
  {
    id: 'crypto',
    title: 'Crypto Pigeon',
    emoji: '🪙',
    text: 'A pigeon in tiny sunglasses is pitching "TrashCoin." It is going to the moon, allegedly.',
    choices: [
      {
        label: 'Invest a third of the vault',
        results: [
          {
            weight: 35,
            text: 'TrashCoin moons. You hate that this worked.',
            outcome: { cashPct: 0.66 },
          },
          {
            weight: 65,
            text: 'Rug pull. The pigeon is gone. The coin was bread crumbs all along.',
            outcome: { cashPct: -0.33 },
          },
        ],
      },
      {
        label: 'Politely decline',
        results: [
          {
            weight: 100,
            text: '"DYOR," he coos respectfully, and flies off.',
            outcome: {},
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'He airdropped you 0.0001 TrashCoin. Worthless, but thoughtful.',
      outcome: { cashSeconds: 5 },
    },
  },
  {
    id: 'fullmoon',
    title: 'Full Moon',
    emoji: '🌕',
    text: 'The raccoons are VIBRATING. The moon is full and the night is young.',
    choices: [
      {
        label: 'Let them howl',
        results: [
          {
            weight: 100,
            text: 'Productivity becomes feral.',
            outcome: { buff: { label: 'Feral Mode', speedMult: 2, durationSec: 60 } },
          },
        ],
      },
      {
        label: 'Mandatory calm-down tea',
        results: [
          {
            weight: 60,
            text: 'They settle. The tea was chamomile and authority.',
            outcome: { buff: { label: 'Zen Staff', revMult: 1.3, durationSec: 90 } },
          },
          {
            weight: 40,
            text: 'They drank the tea AND kept vibrating. Chaos, but profitable chaos.',
            outcome: { buff: { label: 'Caffeinated Somehow', speedMult: 1.5, durationSec: 60 } },
          },
        ],
      },
    ],
    timeout: {
      weight: 1,
      text: 'They briefly unionized with the seagulls. Nothing got done.',
      outcome: { buff: { label: 'Moon Distraction', revMult: 0.7, durationSec: 30 } },
    },
  },
];

export interface Review {
  name: string;
  stars: number;
  text: string;
}

export const REVIEWS: Review[] = [
  { name: 'Gary the Possum', stars: 5, text: 'I was told I could simply lie down here. 10/10.' },
  { name: 'Linda (Pigeon)', stars: 4, text: 'Found a whole bagel. Docking one star because it was everything.' },
  { name: 'Hank, Health Inspector', stars: 1, text: 'I should not have eaten the gazpacho. See attached citation.' },
  { name: 'The Crow Collective', stars: 5, text: 'Shiny inventory, acceptable hostility. Will steal again.' },
  { name: 'Brenda (Grandma)', stars: 5, text: 'Not sure what this store is, but the little employees are darling.' },
  { name: 'The Cauldron', stars: 3, text: "I work here. It's fine. Still no dental." },
  { name: 'Trash Panda Weekly', stars: 5, text: '"...a generational achievement in garbage." Full review inside.' },
  { name: 'Dave (Rat, Union Rep)', stars: 4, text: 'Fair wages, questionable smells. The union endorses.' },
  { name: 'Susan the Seagull', stars: 2, text: 'FRIES WERE NOT BOTTOMLESS AS PROMISED.' },
  { name: 'Anonymous Possum', stars: 5, text: '(playing dead)' },
  { name: 'Pizza Rat', stars: 5, text: '(no comment, dragging slice)' },
  { name: 'Carl (Crypto Pigeon)', stars: 1, text: 'Refused to accept TrashCoin. NGMI.' },
  { name: 'The Moon', stars: 5, text: 'they howled at me. felt nice.' },
  { name: 'City of [REDACTED]', stars: 2, text: 'Technically compliant. Emotionally concerning.' },
  { name: 'Raccoon #47 of 80', stars: 5, text: 'I do not exist and even I love it here.' },
  { name: 'Tinfoil Greg', stars: 4, text: 'Shinies adequately shiny. The cauldron knows too much.' },
];

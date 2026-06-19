// src/lib/sportRules.js

function key(s) {
  return String(s ?? "").trim().toLowerCase();
}

export const SPORT_RULES = {
  hoop: {
    label: "Hoop",
    clock: {
      enabled: true,
      modes: [
        {
          id: "quarters",
          label: "Quarters",
          presets: [300, 360, 420, 480, 600, 720, 900, 1200, 1800],
        },
        {
          id: "halves",
          label: "Halves",
          presets: [600, 720, 900, 1200, 1500, 1800],
        },
      ],
      defaultMode: "quarters",
    },
    scoreButtons: [1, 2, 3],
    stats: [
      { key: "pts", label: "PTS", deltas: [1, 2, 3] },
      { key: "ast", label: "AST", deltas: [1] },
      { key: "foul", label: "F", deltas: [1] },
    ],
  },

  soccer: {
    label: "Soccer",
    clock: {
      enabled: true,
      modes: [{ id: "countdown", label: "Countdown", presets: [600, 900, 1200, 1500, 1800] }],
      defaultMode: "countdown",
    },
    scoreButtons: [1],
    stats: [
      { key: "g", label: "G", deltas: [1] },
      { key: "a", label: "A", deltas: [1] },
    ],
  },

  softball: {
    label: "Softball",
    clock: { enabled: false },
    scoreButtons: [1],
    stats: [
      { key: "h", label: "H", deltas: [1] },
      { key: "hr", label: "HR", deltas: [1] },
    ],
  },

  volleyball: {
    label: "Volleyball",
    clock: { enabled: false },
    scoreButtons: [1],
    stats: [
      { key: "ace", label: "Aces", deltas: [1] },
      { key: "kill", label: "Kills", deltas: [1] },
    ],
  },

  football: {
    label: "Football",
    clock: {
      enabled: true,
      modes: [
        { id: "quarters", label: "Quarters", presets: [300, 360, 420, 480, 600, 720] },
        { id: "halves", label: "Halves", presets: [600, 720, 900, 1200, 1500, 1800] },
      ],
      defaultMode: "quarters",
    },
    scoreButtons: [1, 2, 6],
    stats: [
      { key: "td", label: "TD", deltas: [1] },
    ],
  },

  speedball: {
    label: "Speedball",
    clock: {
      enabled: true,
      modes: [
        {
          id: "periods",
          label: "8 Periods",
          presets: [240, 300, 360, 420, 480, 540, 600],
        },
      ],
      defaultMode: "periods",
    },
    scoreButtons: [1],
    stats: [
      { key: "g", label: "G", deltas: [1] },
      { key: "a", label: "A", deltas: [1] },
    ],
  },

  euro: {
    label: "Euro",
    clock: {
      enabled: true,
      modes: [
        { id: "quarters", label: "Quarters", presets: [300, 360, 420, 480, 600, 720, 900] },
        { id: "halves", label: "Halves", presets: [600, 720, 900, 1200, 1500, 1800] },
      ],
      defaultMode: "quarters",
    },
    scoreButtons: [1],
    stats: [
      { key: "g", label: "G", deltas: [1] },
      { key: "a", label: "A", deltas: [1] },
    ],
  },

  hockey: {
    label: "Hockey",
    clock: {
      enabled: true,
      modes: [
        { id: "periods", label: "3 Periods", presets: [300, 360, 420, 480, 600, 720, 900, 1200] },
      ],
      defaultMode: "periods",
    },
    scoreButtons: [1],
    stats: [
      { key: "g", label: "G", deltas: [1] },
      { key: "a", label: "A", deltas: [1] },
    ],
  },

  kickball: {
    label: "Kickball",
    clock: { enabled: false },
    scoreButtons: [1],
    stats: [],
  },

  newcomb: {
    label: "Newcomb",
    clock: { enabled: false },
    scoreButtons: [1],
    stats: [],
  },
};

export function getSportRules(sport) {
  const k = key(sport);

  const aliases = {
    basketball: "hoop",
    bb: "hoop",
    hoops: "hoop",
  };

  const resolved = aliases[k] ?? k;
  return SPORT_RULES[resolved] ?? { label: resolved, clock: { enabled: false }, scoreButtons: [1], stats: [] };
}
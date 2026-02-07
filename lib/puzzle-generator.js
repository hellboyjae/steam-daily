/**
 * lib/puzzle-generator.js
 * 
 * Core puzzle generation logic. Used by both:
 *   - /api/cron/generate (Vercel cron)
 *   - scripts/pregenerator.js (build-time pre-generation)
 *   - scripts/generate-daily.js (CLI)
 */

// ── Seeded PRNG (deterministic per date) ──
function mulberry32(seed) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function dateSeed(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN(arr, n, rng) {
  return shuffle(arr, rng).slice(0, n);
}

// ── Puzzle 1: Price Check ──
function generatePriceCheck(games, rng) {
  const pool = games.filter(g => g.price >= 1 && g.price <= 70 && g.reviewCount >= 5000);
  if (pool.length === 0) return null;
  const game = pool[Math.floor(rng() * pool.length)];

  return {
    type: "price_check",
    game: {
      id: game.id, name: game.name, price: game.price,
      reviews: game.reviews, reviewCount: game.reviewCount,
      releaseDate: game.releaseDate, headerImage: game.headerImage,
      trailerMp4: game.trailerMp4, trailerWebm: game.trailerWebm,
      trailerThumb: game.trailerThumb, screenshots: game.screenshots,
      storeUrl: game.storeUrl, developers: game.developers,
    },
    maxGuesses: 5,
  };
}

// ── Puzzle 2: Tag Hunt ──
function generateTagHunt(games, tagIndex, rng) {
  const viable = Object.entries(tagIndex)
    .filter(([, ids]) => ids.length >= 8 && ids.length <= 500);
  if (viable.length === 0) return null;

  const [tag, appIds] = viable[Math.floor(rng() * viable.length)];
  const validGames = appIds
    .map(id => games.find(g => g.id === id))
    .filter(Boolean)
    .map(g => ({ id: g.id, name: g.name }));

  return {
    type: "tag_hunt",
    tag, validGames, totalValid: validGames.length, target: 5,
  };
}

// ── Puzzle 3: Connections ──
function generateConnections(games, tagIndex, rng) {
  const tagEntries = Object.entries(tagIndex)
    .filter(([, ids]) => ids.length >= 6 && ids.length <= 40);

  for (let attempt = 0; attempt < 50; attempt++) {
    const groups = [];
    const usedGameIds = new Set();
    const shuffledTags = shuffle(tagEntries, rng);

    for (const [tag, appIds] of shuffledTags) {
      if (groups.length >= 4) break;
      const available = appIds
        .map(id => games.find(g => g.id === id))
        .filter(g => g && !usedGameIds.has(g.id));
      if (available.length < 4) continue;

      const picked = pickN(available, 4, rng);

      let hasConflict = false;
      for (const existing of groups) {
        const overlap = picked.filter(g => g.tags.includes(existing.tag));
        if (overlap.length >= 2) { hasConflict = true; break; }
      }
      if (hasConflict) continue;

      groups.push({ label: tag, tag, games: picked.map(g => ({ id: g.id, name: g.name })) });
      picked.forEach(g => usedGameIds.add(g.id));
    }

    if (groups.length === 4) {
      const allTiles = groups.flatMap(g => g.games.map(game => game.name));
      return {
        type: "connections",
        groups: groups.map(g => ({ label: g.label, games: g.games.map(game => game.name) })),
        shuffledTiles: shuffle(allTiles, rng),
        maxMistakes: 4,
      };
    }
  }
  return null;
}

// ── Build game index for client-side Tag Hunt validation ──
function buildGameIndex(games) {
  const index = {};
  games.forEach(g => {
    index[g.name.toLowerCase()] = { id: g.id, name: g.name, tags: g.tags };
  });
  return index;
}

// ── Main generator (by date — for daily puzzle) ──
function generatePuzzleForDate(dateStr, games, tagIndex) {
  const seed = dateSeed(dateStr);
  const rng = mulberry32(seed);

  const priceCheck = generatePriceCheck(games, rng);
  const tagHunt = generateTagHunt(games, tagIndex, rng);
  const connections = generateConnections(games, tagIndex, rng);

  if (!priceCheck || !tagHunt || !connections) return null;

  const launchDate = new Date('2026-02-05');
  const currentDate = new Date(dateStr + 'T12:00:00Z');
  const puzzleNumber = Math.floor((currentDate - launchDate) / (1000 * 60 * 60 * 24)) + 1;

  return {
    date: dateStr,
    puzzleNumber,
    isDaily: true,
    priceCheck,
    tagHunt,
    connections,
    gameIndex: buildGameIndex(games),
  };
}

// ── Generate by numeric seed (for random/replay puzzles) ──
function generatePuzzleBySeed(seed, games, tagIndex) {
  const rng = mulberry32(seed);

  const priceCheck = generatePriceCheck(games, rng);
  const tagHunt = generateTagHunt(games, tagIndex, rng);
  const connections = generateConnections(games, tagIndex, rng);

  if (!priceCheck || !tagHunt || !connections) return null;

  return {
    date: null,
    puzzleNumber: seed,
    isDaily: false,
    priceCheck,
    tagHunt,
    connections,
    gameIndex: buildGameIndex(games),
  };
}

module.exports = { generatePuzzleForDate, generatePuzzleBySeed };

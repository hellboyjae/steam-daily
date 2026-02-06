#!/usr/bin/env node
/**
 * pregenerator.js
 * 
 * Generates 1000 puzzles from the game database.
 * The daily puzzle picks one deterministically by date.
 * "Play Again" picks one at random.
 */

const fs = require('fs');
const path = require('path');
const { generatePuzzleBySeed } = require('../lib/puzzle-generator');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const TOTAL = 1000;

function main() {
  const gamesPath = path.join(DATA_DIR, 'games.json');
  const tagsPath = path.join(DATA_DIR, 'tags.json');

  if (!fs.existsSync(gamesPath) || !fs.existsSync(tagsPath)) {
    console.log('No game database found. Run: npm run bootstrap');
    return;
  }

  const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
  const tagIndex = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));

  if (!fs.existsSync(PUZZLES_DIR)) fs.mkdirSync(PUZZLES_DIR, { recursive: true });

  console.log(`Generating ${TOTAL} puzzles...`);
  let created = 0;
  let failures = 0;

  for (let i = 1; i <= TOTAL; i++) {
    const filename = `random-${String(i).padStart(4, '0')}.json`;
    const outPath = path.join(PUZZLES_DIR, filename);

    if (fs.existsSync(outPath)) { created++; continue; }

    const seed = 100000 + i * 7919;
    const puzzle = generatePuzzleBySeed(seed, games, tagIndex);

    if (puzzle) {
      puzzle.randomId = i;
      fs.writeFileSync(outPath, JSON.stringify(puzzle));
      created++;
    } else {
      failures++;
    }

    if (i % 100 === 0) console.log(`  ${i}/${TOTAL}`);
  }

  const manifest = { randomCount: created, generatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(PUZZLES_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n✅ ${created} puzzles ready (${failures} failures)`);
}

main();

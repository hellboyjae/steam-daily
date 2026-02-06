#!/usr/bin/env node
/**
 * pregenerator.js
 * 
 * Runs during `npm run prebuild` (Vercel build step).
 * Pre-generates puzzles for the next 30 days as static JSON files.
 * This ensures puzzles are always available even if the cron fails.
 */

const fs = require('fs');
const path = require('path');
const { generatePuzzleForDate } = require('../lib/puzzle-generator');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PUZZLES_DIR = path.join(DATA_DIR, 'puzzles');
const DAYS_AHEAD = 30;

function main() {
  const gamesPath = path.join(DATA_DIR, 'games.json');
  const tagsPath = path.join(DATA_DIR, 'tags.json');

  if (!fs.existsSync(gamesPath) || !fs.existsSync(tagsPath)) {
    console.log('⚠️  No game database found. Run: npm run bootstrap');
    console.log('   Skipping puzzle pre-generation.');
    return;
  }

  const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
  const tagIndex = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));

  if (!fs.existsSync(PUZZLES_DIR)) {
    fs.mkdirSync(PUZZLES_DIR, { recursive: true });
  }

  console.log(`Pre-generating ${DAYS_AHEAD} days of puzzles...`);

  const now = new Date();
  let generated = 0;

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    const outPath = path.join(PUZZLES_DIR, `${dateStr}.json`);

    // Skip if already exists
    if (fs.existsSync(outPath)) {
      continue;
    }

    const puzzle = generatePuzzleForDate(dateStr, games, tagIndex);
    if (puzzle) {
      fs.writeFileSync(outPath, JSON.stringify(puzzle));
      generated++;
    } else {
      console.warn(`  ⚠️  Failed to generate puzzle for ${dateStr}`);
    }
  }

  console.log(`✅ Pre-generated ${generated} new puzzles (${DAYS_AHEAD} days total)`);
}

main();

#!/usr/bin/env node
/**
 * rebuild-tags.js
 * Rebuilds tags.json from existing games.json — no API calls needed.
 * Run this after changing the tag cap.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const gamesPath = path.join(DATA_DIR, 'games.json');
const tagsPath = path.join(DATA_DIR, 'tags.json');

const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));

const tagIndex = {};
games.forEach(g => g.tags.forEach(t => {
  if (!tagIndex[t]) tagIndex[t] = [];
  tagIndex[t].push(g.id);
}));

const viableTags = {};
Object.entries(tagIndex).forEach(([t, ids]) => {
  if (ids.length >= 5 && ids.length <= 500) viableTags[t] = ids;
});

fs.writeFileSync(tagsPath, JSON.stringify(viableTags, null, 2));
console.log(`✅ Rebuilt tags.json: ${Object.keys(viableTags).length} viable tags (was capped at 500)`);

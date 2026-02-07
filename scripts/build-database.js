#!/usr/bin/env node
/**
 * build-database.js (FAST version)
 * 
 * Speed optimizations:
 *   - Parallel Steam Store requests (5 at a time)
 *   - SteamSpy individual calls at 1/sec for tags
 *   - Retry logic on failures
 * 
 * Expected time: ~35-45 min for 2000 games (down from 1-2 hours)
 * The SteamSpy 1req/sec limit is the main bottleneck.
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'games.json');
const TAGS_FILE = path.join(DATA_DIR, 'tags.json');

const STEAMSPY_PAGES = 3;
const MIN_POSITIVE_REVIEWS = 500;
const MAX_GAMES = 2000;
const CONCURRENT_STORE = 5;
const STEAM_BATCH_DELAY = 250;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { timeout: 15000 });
      if (!res.ok) { if (i < retries) { await sleep(2000); continue; } return null; }
      return await res.json();
    } catch { if (i < retries) { await sleep(2000); continue; } return null; }
  }
}

function getReviewLabel(pos, neg) {
  const t = pos + neg; if (t === 0) return "No Reviews";
  const p = pos / t;
  if (p >= 0.95) return "Overwhelmingly Positive";
  if (p >= 0.80) return "Very Positive";
  if (p >= 0.70) return "Mostly Positive";
  if (p >= 0.40) return "Mixed";
  if (p >= 0.20) return "Mostly Negative";
  return "Negative";
}

async function main() {
  console.log("=== Steam Daily Database Builder ===\n");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // ── Step 1: Bulk fetch from SteamSpy ──
  console.log("Step 1: Fetching game list from SteamSpy...");
  const allApps = {};
  for (let page = 0; page < STEAMSPY_PAGES; page++) {
    console.log(`  Page ${page}...`);
    const data = await fetchJSON(`https://steamspy.com/api.php?request=all&page=${page}`);
    if (data) { console.log(`    ${Object.keys(data).length} apps`); Object.assign(allApps, data); }
    if (page < STEAMSPY_PAGES - 1) { console.log("    Waiting 61s..."); await sleep(61000); }
  }
  console.log(`  Total: ${Object.keys(allApps).length} apps\n`);

  // ── Step 2: Filter ──
  console.log("Step 2: Filtering to quality games...");
  const candidates = Object.values(allApps)
    .filter(a => a.positive >= MIN_POSITIVE_REVIEWS && a.name?.trim())
    .sort((a, b) => (b.positive + b.negative) - (a.positive + a.negative))
    .slice(0, MAX_GAMES);
  console.log(`  ${candidates.length} candidates\n`);

  // ── Step 3: Fetch tags from SteamSpy (1 req/sec) ──
  console.log("Step 3: Fetching tags from SteamSpy (1 req/sec)...");
  console.log(`  This takes ~${Math.ceil(candidates.length / 60)} minutes\n`);
  const spyTags = {};
  for (let i = 0; i < candidates.length; i++) {
    const app = candidates[i];
    const data = await fetchJSON(`https://steamspy.com/api.php?request=appdetails&appid=${app.appid}`);
    if (data?.tags) spyTags[app.appid] = Object.keys(data.tags).slice(0, 8);
    if ((i + 1) % 100 === 0) console.log(`    ${i + 1}/${candidates.length} (${Math.round((i+1)/candidates.length*100)}%)`);
    await sleep(1050);
  }
  console.log(`  Tags for ${Object.keys(spyTags).length} games\n`);

  // ── Step 4: Fetch Store details in parallel ──
  console.log("Step 4: Fetching prices/images from Steam Store (5 parallel)...");
  const games = [];
  let errors = 0;

  for (let i = 0; i < candidates.length; i += CONCURRENT_STORE) {
    const batch = candidates.slice(i, i + CONCURRENT_STORE);
    const results = await Promise.all(
      batch.map(a => fetchJSON(`https://store.steampowered.com/api/appdetails?appids=${a.appid}&cc=us&l=en`))
    );

    for (let j = 0; j < batch.length; j++) {
      const app = batch[j];
      const raw = results[j];
      const store = raw?.[app.appid]?.success ? raw[app.appid].data : null;
      if (!store || store.type !== 'game') { errors++; continue; }

      const tags = spyTags[app.appid] || [];
      if (tags.length < 3) continue;

      let price = null;
      if (store.is_free) price = 0;
      else if (store.price_overview) price = store.price_overview.initial / 100;
      if (price === null) continue;

      const name = store.name || app.name;
      if (name.length > 60) continue;

      games.push({
        id: app.appid, name, price, tags,
        reviews: getReviewLabel(app.positive, app.negative),
        reviewCount: app.positive + app.negative,
        positiveReviews: app.positive, negativeReviews: app.negative,
        releaseDate: store.release_date?.date || null,
        headerImage: store.header_image || null,
        trailerMp4: store.movies?.[0]?.mp4?.max || store.movies?.[0]?.mp4?.['480'] || null,
        trailerWebm: store.movies?.[0]?.webm?.max || store.movies?.[0]?.webm?.['480'] || null,
        trailerThumb: store.movies?.[0]?.thumbnail || null,
        screenshots: (store.screenshots || []).slice(0, 4).map(s => s.path_full || s.path_thumbnail),
        storeUrl: `https://store.steampowered.com/app/${app.appid}`,
        developers: store.developers || [],
        publishers: store.publishers || [],
        genres: (store.genres || []).map(g => g.description),
      });
    }

    const done = Math.min(i + CONCURRENT_STORE, candidates.length);
    if (done % 100 === 0 || done === candidates.length)
      console.log(`    ${done}/${candidates.length} (${games.length} valid, ${errors} skipped)`);
    await sleep(STEAM_BATCH_DELAY);
  }

  console.log(`\n  Final: ${games.length} games\n`);

  // ── Step 5: Build tag index ──
  console.log("Step 5: Building tag index...");
  const viableTags = {};
  const tagIndex = {};
  games.forEach(g => g.tags.forEach(t => { if (!tagIndex[t]) tagIndex[t] = []; tagIndex[t].push(g.id); }));
  Object.entries(tagIndex).forEach(([t, ids]) => { if (ids.length >= 5 && ids.length <= 500) viableTags[t] = ids; });
  console.log(`  ${Object.keys(viableTags).length} viable tags\n`);

  // ── Step 6: Save ──
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(games, null, 2));
  fs.writeFileSync(TAGS_FILE, JSON.stringify(viableTags, null, 2));
  console.log(`✅ games.json (${Math.round(fs.statSync(OUTPUT_FILE).size/1024)} KB, ${games.length} games)`);
  console.log(`✅ tags.json (${Object.keys(viableTags).length} tags)`);
  console.log("\n=== Done! ===");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });

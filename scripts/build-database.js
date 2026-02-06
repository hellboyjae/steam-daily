#!/usr/bin/env node
/**
 * build-database.js
 * 
 * Fetches the top ~3000 Steam games from SteamSpy (tags, owners, reviews)
 * then enriches each with pricing + metadata from Steam's store API.
 * Outputs a clean JSON database file: server/data/games.json
 * 
 * Run: node scripts/build-database.js
 * Schedule: weekly via cron or manually
 * 
 * API sources:
 *   - SteamSpy API (free, public): https://steamspy.com/api.php
 *   - Steam Store API (free, public): https://store.steampowered.com/api/appdetails
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'games.json');
const TAGS_FILE = path.join(DATA_DIR, 'tags.json');

// How many pages of SteamSpy "all" to fetch (1000 games per page)
// 3 pages = ~3000 games, which is plenty
const STEAMSPY_PAGES = 3;

// Minimum positive reviews to include a game (filters out shovelware)
const MIN_POSITIVE_REVIEWS = 500;

// Rate limiting
const STEAMSPY_DELAY_MS = 61000; // 1 req per 60s for "all" endpoint
const STEAM_API_DELAY_MS = 350;  // ~3 req/s for store API (conservative)
const STEAM_BATCH_SIZE = 50;     // pause longer every N requests
const STEAM_BATCH_PAUSE_MS = 5000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSteamSpyAll(page) {
  const url = `https://steamspy.com/api.php?request=all&page=${page}`;
  console.log(`  Fetching SteamSpy page ${page}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SteamSpy returned ${res.status}`);
  return res.json();
}

async function fetchSteamSpyAppDetails(appid) {
  const url = `https://steamspy.com/api.php?request=appdetails&appid=${appid}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function fetchSteamStoreDetails(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data[appid] || !data[appid].success) return null;
  return data[appid].data;
}

function getReviewLabel(positive, negative) {
  const total = positive + negative;
  if (total === 0) return "No Reviews";
  const pct = positive / total;
  if (pct >= 0.95) return "Overwhelmingly Positive";
  if (pct >= 0.80) return "Very Positive";
  if (pct >= 0.70) return "Mostly Positive";
  if (pct >= 0.40) return "Mixed";
  if (pct >= 0.20) return "Mostly Negative";
  return "Negative";
}

async function main() {
  console.log("=== Steam Daily Database Builder ===\n");

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // ── Step 1: Fetch game list from SteamSpy ──
  console.log("Step 1: Fetching game list from SteamSpy...");
  const allApps = {};

  for (let page = 0; page < STEAMSPY_PAGES; page++) {
    try {
      const data = await fetchSteamSpyAll(page);
      const count = Object.keys(data).length;
      console.log(`    Page ${page}: ${count} apps`);
      Object.assign(allApps, data);

      if (page < STEAMSPY_PAGES - 1) {
        console.log(`    Waiting ${STEAMSPY_DELAY_MS / 1000}s (rate limit)...`);
        await sleep(STEAMSPY_DELAY_MS);
      }
    } catch (err) {
      console.error(`    Error on page ${page}: ${err.message}`);
    }
  }

  console.log(`  Total apps from SteamSpy: ${Object.keys(allApps).length}`);

  // ── Step 2: Filter to quality games ──
  console.log("\nStep 2: Filtering to quality games...");
  const candidates = Object.values(allApps).filter(app => {
    return app.positive >= MIN_POSITIVE_REVIEWS && app.name && app.name.trim();
  });
  console.log(`  Games with ${MIN_POSITIVE_REVIEWS}+ positive reviews: ${candidates.length}`);

  // Sort by total reviews descending (most popular first)
  candidates.sort((a, b) => (b.positive + b.negative) - (a.positive + a.negative));

  // Cap at 2000 games for manageable DB size
  const topGames = candidates.slice(0, 2000);
  console.log(`  Taking top ${topGames.length} by review count`);

  // ── Step 3: Fetch detailed data from SteamSpy + Steam Store API ──
  console.log("\nStep 3: Enriching with tags and pricing from APIs...");
  const games = [];
  const allTags = {};
  let fetchedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < topGames.length; i++) {
    const app = topGames[i];
    const appid = app.appid;

    try {
      // Fetch SteamSpy details (has tags)
      const spyData = await fetchSteamSpyAppDetails(appid);
      await sleep(1100); // 1 req/sec for SteamSpy detail

      // Fetch Steam Store details (has price, genres, trailer)
      const storeData = await fetchSteamStoreDetails(appid);
      await sleep(STEAM_API_DELAY_MS);

      if (!spyData || !storeData) {
        errorCount++;
        continue;
      }

      // Skip non-games (DLC, software, etc.)
      if (storeData.type !== 'game') continue;

      // Extract tags from SteamSpy (comes as {tagName: voteCount})
      const tags = spyData.tags
        ? Object.keys(spyData.tags).slice(0, 8) // top 8 tags
        : [];

      // Track all tags
      tags.forEach(t => {
        if (!allTags[t]) allTags[t] = 0;
        allTags[t]++;
      });

      // Extract price (in cents from Steam, convert to dollars)
      let price = null;
      if (storeData.is_free) {
        price = 0;
      } else if (storeData.price_overview) {
        price = storeData.price_overview.initial / 100; // initial price, not sale price
      }

      // Extract trailer / movie
      let trailerUrl = null;
      if (storeData.movies && storeData.movies.length > 0) {
        trailerUrl = storeData.movies[0].mp4
          ? (storeData.movies[0].mp4['480'] || storeData.movies[0].mp4.max)
          : null;
      }

      // Extract header image
      const headerImage = storeData.header_image || null;

      // Release date
      const releaseDate = storeData.release_date
        ? storeData.release_date.date
        : null;

      const reviewLabel = getReviewLabel(app.positive, app.negative);

      const gameEntry = {
        id: appid,
        name: storeData.name || app.name,
        price: price,
        tags: tags,
        reviews: reviewLabel,
        reviewCount: app.positive + app.negative,
        positiveReviews: app.positive,
        negativeReviews: app.negative,
        releaseDate: releaseDate,
        headerImage: headerImage,
        trailerUrl: trailerUrl,
        storeUrl: `https://store.steampowered.com/app/${appid}`,
        developers: storeData.developers || [],
        publishers: storeData.publishers || [],
        genres: (storeData.genres || []).map(g => g.description),
      };

      games.push(gameEntry);
      fetchedCount++;

      if (fetchedCount % 25 === 0) {
        console.log(`    Processed ${fetchedCount}/${topGames.length} (${errorCount} errors)...`);
      }

      // Longer pause every batch to be respectful
      if (fetchedCount % STEAM_BATCH_SIZE === 0) {
        console.log(`    Batch pause (${STEAM_BATCH_PAUSE_MS / 1000}s)...`);
        await sleep(STEAM_BATCH_PAUSE_MS);
      }
    } catch (err) {
      errorCount++;
      if (errorCount % 10 === 0) {
        console.error(`    Error at index ${i} (${app.name}): ${err.message}`);
      }
    }
  }

  console.log(`\n  Finished: ${games.length} games processed, ${errorCount} errors`);

  // ── Step 4: Filter games suitable for puzzles ──
  console.log("\nStep 4: Final filtering...");
  const finalGames = games.filter(g => {
    return (
      g.price !== null &&      // must have a known price
      g.tags.length >= 3 &&    // must have at least 3 tags
      g.name.length <= 60 &&   // name can't be absurdly long (for UI)
      g.reviewCount >= 1000    // enough reviews to be recognizable
    );
  });
  console.log(`  Final database: ${finalGames.length} games`);

  // ── Step 5: Build tag index ──
  console.log("\nStep 5: Building tag index...");
  const tagIndex = {};
  finalGames.forEach(g => {
    g.tags.forEach(tag => {
      if (!tagIndex[tag]) tagIndex[tag] = [];
      tagIndex[tag].push(g.id);
    });
  });

  // Filter tags suitable for Tag Hunt (5-100 games)
  const viableTags = {};
  Object.entries(tagIndex).forEach(([tag, appIds]) => {
    if (appIds.length >= 5 && appIds.length <= 100) {
      viableTags[tag] = appIds;
    }
  });
  console.log(`  Viable tags for puzzles: ${Object.keys(viableTags).length}`);

  // ── Step 6: Save ──
  console.log("\nStep 6: Saving database...");
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalGames, null, 2));
  fs.writeFileSync(TAGS_FILE, JSON.stringify(viableTags, null, 2));

  const sizeKB = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);
  console.log(`  Saved ${OUTPUT_FILE} (${sizeKB} KB)`);
  console.log(`  Saved ${TAGS_FILE}`);
  console.log("\n=== Done! ===");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

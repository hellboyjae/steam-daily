const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  // Get today's date in UTC
  const today = new Date().toISOString().split('T')[0];

  // Try pre-generated puzzle first (from data/puzzles/)
  const puzzlePath = path.join(process.cwd(), 'data', 'puzzles', `${today}.json`);

  if (fs.existsSync(puzzlePath)) {
    const data = JSON.parse(fs.readFileSync(puzzlePath, 'utf8'));
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  }

  // Fallback: generate on-the-fly
  const gamesPath = path.join(process.cwd(), 'data', 'games.json');
  const tagsPath = path.join(process.cwd(), 'data', 'tags.json');

  if (!fs.existsSync(gamesPath) || !fs.existsSync(tagsPath)) {
    return res.status(503).json({ error: 'Game database not found. Run: npm run bootstrap' });
  }

  try {
    const { generatePuzzleForDate } = require('../lib/puzzle-generator');
    const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
    const tagIndex = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));
    const puzzle = generatePuzzleForDate(today, games, tagIndex);

    if (!puzzle) {
      return res.status(500).json({ error: 'Failed to generate puzzle' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(puzzle);
  } catch (err) {
    console.error('Puzzle generation error:', err);
    return res.status(500).json({ error: 'Internal error generating puzzle' });
  }
};

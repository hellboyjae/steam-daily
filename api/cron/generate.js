const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  // Verify this is called by Vercel Cron (or allow in dev)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { generatePuzzleForDate } = require('../../lib/puzzle-generator');

    const gamesPath = path.join(process.cwd(), 'data', 'games.json');
    const tagsPath = path.join(process.cwd(), 'data', 'tags.json');

    if (!fs.existsSync(gamesPath) || !fs.existsSync(tagsPath)) {
      return res.status(503).json({ error: 'Game database not found' });
    }

    const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
    const tagIndex = JSON.parse(fs.readFileSync(tagsPath, 'utf8'));

    // Generate today and tomorrow
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const todayPuzzle = generatePuzzleForDate(today, games, tagIndex);
    const tomorrowPuzzle = generatePuzzleForDate(tomorrow, games, tagIndex);

    console.log(`[CRON] Generated puzzles for ${today} and ${tomorrow}`);

    return res.status(200).json({
      success: true,
      generated: [today, tomorrow],
      todayPuzzleNumber: todayPuzzle?.puzzleNumber,
      tomorrowPuzzleNumber: tomorrowPuzzle?.puzzleNumber,
    });
  } catch (err) {
    console.error('[CRON] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};

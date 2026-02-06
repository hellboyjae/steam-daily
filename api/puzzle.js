const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const puzzlesDir = path.join(process.cwd(), 'data', 'puzzles');
  const manifestPath = path.join(puzzlesDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return res.status(503).json({ error: 'No puzzles generated yet. Run: npm run prebuild' });
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Use today's date as a seed to deterministically pick which random puzzle is "the daily"
  const today = new Date().toISOString().split('T')[0];
  const [y, m, d] = today.split('-').map(Number);
  const dateSeed = y * 10000 + m * 100 + d;
  const dailyId = (dateSeed % manifest.randomCount) + 1;

  const filename = `random-${String(dailyId).padStart(4, '0')}.json`;
  const filePath = path.join(puzzlesDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Daily puzzle not found' });
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  data.isDaily = true;
  data.date = today;

  // Compute puzzle number (days since launch)
  const launch = new Date('2026-02-06');
  const now = new Date(today + 'T12:00:00Z');
  data.puzzleNumber = Math.max(1, Math.floor((now - launch) / 86400000) + 1);

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json(data);
};

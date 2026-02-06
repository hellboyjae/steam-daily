const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const puzzlesDir = path.join(process.cwd(), 'data', 'puzzles');
  const manifestPath = path.join(puzzlesDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return res.status(503).json({ error: 'No puzzles generated yet. Run: npm run prebuild' });
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Pick a random puzzle number (1 to randomCount)
  const id = Math.floor(Math.random() * manifest.randomCount) + 1;
  const filename = `random-${String(id).padStart(4, '0')}.json`;
  const filePath = path.join(puzzlesDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Puzzle not found' });
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // No caching — each request should potentially get a different puzzle
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(data);
};

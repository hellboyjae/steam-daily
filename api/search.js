const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  const query = (req.query.q || '').toLowerCase().trim();

  if (query.length < 2) {
    return res.status(200).json({ results: [] });
  }

  const gamesPath = path.join(process.cwd(), 'data', 'games.json');
  if (!fs.existsSync(gamesPath)) {
    return res.status(200).json({ results: [] });
  }

  const games = JSON.parse(fs.readFileSync(gamesPath, 'utf8'));
  const matches = games
    .filter(g => g.name.toLowerCase().includes(query))
    .slice(0, 8)
    .map(g => ({ id: g.id, name: g.name }));

  res.setHeader('Cache-Control', 'public, s-maxage=60');
  return res.status(200).json({ results: matches });
};

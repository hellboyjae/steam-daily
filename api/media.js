const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const appid = req.query.appid;
  if (!appid) return res.status(400).json({ error: 'Missing appid' });

  try {
    const resp = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`,
      { timeout: 8000 }
    );
    const json = await resp.json();
    const data = json?.[appid]?.data;

    if (!data) return res.status(200).json({ trailerMp4: null, trailerWebm: null, screenshots: [] });

    const movie = data.movies?.[0];
    const result = {
      trailerMp4: movie?.mp4?.max || movie?.mp4?.['480'] || null,
      trailerWebm: movie?.webm?.max || movie?.webm?.['480'] || null,
      trailerThumb: movie?.thumbnail || null,
      screenshots: (data.screenshots || []).slice(0, 4).map(s => s.path_full || s.path_thumbnail),
    };

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Steam media fetch error:', err);
    return res.status(200).json({ trailerMp4: null, trailerWebm: null, screenshots: [] });
  }
};

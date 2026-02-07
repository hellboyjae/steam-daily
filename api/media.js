const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const appid = req.query.appid;
  if (!appid) return res.status(400).json({ error: 'Missing appid' });

  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`;
    const resp = await fetch(url, { timeout: 10000 });
    
    if (!resp.ok) {
      console.error(`Steam API returned ${resp.status} for appid ${appid}`);
      return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [], debug: `Steam API ${resp.status}` });
    }

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error(`Failed to parse Steam API response for appid ${appid}:`, text.slice(0, 200));
      return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [], debug: 'parse_error' });
    }

    // Steam returns appid as string key
    const appData = json[String(appid)];
    if (!appData || !appData.success || !appData.data) {
      return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [], debug: 'no_data' });
    }

    const data = appData.data;
    const movie = (data.movies && data.movies.length > 0) ? data.movies[0] : null;
    
    const result = {
      trailerMp4: movie ? (movie.mp4?.max || movie.mp4?.['480'] || null) : null,
      trailerWebm: movie ? (movie.webm?.max || movie.webm?.['480'] || null) : null,
      trailerThumb: movie ? (movie.thumbnail || null) : null,
      screenshots: (data.screenshots || []).slice(0, 4).map(s => s.path_full || s.path_thumbnail),
      debug: movie ? { keys: Object.keys(movie), movie_raw: movie } : 'no_movies_field'
    };

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Steam media fetch error:', err.message);
    return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [], debug: err.message });
  }
};

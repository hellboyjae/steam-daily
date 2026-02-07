const fetch = require('node-fetch');

module.exports = async (req, res) => {
  const appid = req.query.appid;
  if (!appid) return res.status(400).json({ error: 'Missing appid' });

  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=en`;
    const resp = await fetch(url, { timeout: 10000 });
    
    if (!resp.ok) {
      console.error(`Steam API returned ${resp.status} for appid ${appid}`);
      return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [] });
    }

    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.error(`Failed to parse Steam API response for appid ${appid}:`, text.slice(0, 200));
      return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [] });
    }

    // Steam returns appid as string key
    const appData = json[String(appid)];
    if (!appData || !appData.success || !appData.data) {
      return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [] });
    }

    const data = appData.data;
    const movie = (data.movies && data.movies.length > 0) ? data.movies[0] : null;
    
    // Steam now uses dash_h264/hls_h264 instead of mp4/webm
    // dash_h264 URLs point to MPEG-DASH manifests, not playable mp4 files
    // But we can construct a direct mp4 URL from the movie ID
    let trailerMp4 = null;
    let trailerWebm = null;

    if (movie) {
      // Try legacy mp4/webm first (older games still have these)
      if (movie.mp4) {
        trailerMp4 = movie.mp4.max || movie.mp4['480'] || null;
      }
      if (movie.webm) {
        trailerWebm = movie.webm.max || movie.webm['480'] || null;
      }

      // If no legacy format, construct mp4 URL from movie ID
      if (!trailerMp4 && movie.id) {
        trailerMp4 = `https://video.akamai.steamstatic.com/store_trailers/${movie.id}/movie_max.mp4`;
        trailerWebm = `https://video.akamai.steamstatic.com/store_trailers/${movie.id}/movie_max.webm`;
      }
    }

    const result = {
      trailerMp4,
      trailerWebm,
      trailerThumb: movie ? (movie.thumbnail || null) : null,
      screenshots: (data.screenshots || []).slice(0, 4).map(s => s.path_full || s.path_thumbnail),
    };

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(result);
  } catch (err) {
    console.error('Steam media fetch error:', err.message);
    return res.status(200).json({ trailerMp4: null, trailerWebm: null, trailerThumb: null, screenshots: [] });
  }
};

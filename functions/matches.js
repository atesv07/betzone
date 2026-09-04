const LEAGUE_IDS = {
  39:  { name: 'Premier Lig',    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ch: 'beIN Sports' },
  140: { name: 'La Liga',        flag: '🇪🇸',         ch: 'S Sport' },
  135: { name: 'Serie A',        flag: '🇮🇹',         ch: 'S Sport Plus' },
  78:  { name: 'Bundesliga',     flag: '🇩🇪',         ch: 'S Sport Plus' },
  61:  { name: 'Ligue 1',        flag: '🇫🇷',         ch: 'beIN Sports' },
  2:   { name: 'Şampiyonlar L.', flag: '🏆',           ch: 'beIN Sports' },
  3:   { name: 'Avrupa Ligi',    flag: '🌟',           ch: 'beIN Sports' },
};

async function apiFetch(path, apiKey) {
  const r = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { 'x-apisports-key': apiKey }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function onRequest(context) {
  const { request, env } = context;
  const apiKey = env.AF_KEY;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API Key eklenmemiş!' }), { status: 500, headers });
  }

  try {
    const season = 2025;
    const today  = new Date().toISOString().slice(0, 10);
    const to     = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [liveData, upcomingData] = await Promise.all([
      apiFetch('/fixtures?live=all', apiKey),
      apiFetch(`/fixtures?from=${today}&to=${to}&season=${season}&timezone=Europe/Istanbul`, apiKey),
    ]);

    const liveFixtures     = (liveData.response     || []).filter(f => LEAGUE_IDS[f.league?.id]);
    const upcomingFixtures = (upcomingData.response || []).filter(f => LEAGUE_IDS[f.league?.id]);

    const liveIds = new Set(liveFixtures.map(f => f.fixture.id));
    const all = [
      ...liveFixtures,
      ...upcomingFixtures.filter(f => !liveIds.has(f.fixture.id)),
    ];

    const now = Date.now();

    const matches = all.map((f) => {
      const li   = LEAGUE_IDS[f.league.id];
      const home = f.teams.home.name;
      const away = f.teams.away.name;
      const dt   = new Date(f.fixture.date);
      const statusRaw = f.fixture.status?.short;

      let status = 'upcoming';
      if (['1H','HT','2H','ET','BT','P'].includes(statusRaw)) status = 'live';
      if (['FT','AET','PEN'].includes(statusRaw))              status = 'finished';

      if (status === 'finished') {
        const end = dt.getTime() + 2 * 60 * 60 * 1000;
        if (now - end > 12 * 60 * 60 * 1000) return null;
      }

      const scoreHome = f.goals?.home ?? null;
      const scoreAway = f.goals?.away ?? null;
      const htHome    = f.score?.halftime?.home ?? null;
      const htAway    = f.score?.halftime?.away ?? null;
      const scoreHalf = htHome != null ? `${htHome}-${htAway}` : null;
      const minute    = f.fixture.status?.elapsed ?? null;

      const odd1 = +(1.6 + Math.random() * 1.8).toFixed(2);
      const oddX = +(2.9 + Math.random() * 0.6).toFixed(2);
      const odd2 = +(1.6 + Math.random() * 1.8).toFixed(2);

      return {
        id: 'af' + f.fixture.id,
        league: li.name, flag: li.flag, ch: li.ch,
        home, away,
        date: dt.toLocaleDateString('tr-TR'),
        time: dt.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' }),
        status, scoreHome, scoreAway, scoreHalf, minute,
        odd1, oddX, odd2,
        markets: {} 
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const o = { live: 0, upcoming: 1, finished: 2 };
      return (o[a.status] ?? 3) - (o[b.status] ?? 3);
    });

    return new Response(JSON.stringify({ matches }), { headers });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}

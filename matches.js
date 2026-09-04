const LEAGUE_IDS = {
  39:  { name: 'Premier Lig',    flag: '🏴', ch: 'beIN Sports' },
  140: { name: 'La Liga',        flag: '🇪🇸', ch: 'S Sport' },
  135: { name: 'Serie A',        flag: '🇮🇹', ch: 'S Sport Plus' },
  78:  { name: 'Bundesliga',     flag: '🇩🇪', ch: 'S Sport Plus' },
  61:  { name: 'Ligue 1',        flag: '🇫🇷', ch: 'beIN Sports' },
  2:   { name: 'Şampiyonlar L.', flag: '🏆', ch: 'beIN Sports' },
  3:   { name: 'Avrupa Ligi',    flag: '🌟', ch: 'beIN Sports' }
};

const CURRENT_SEASON = 2026;

async function apiFetch(path, apiKey) {
  const response = await fetch(
    `https://v3.football.api-sports.io${path}`,
    {
      headers: {
        'x-apisports-key': apiKey
      }
    }
  );

  const data = await response.json();

  console.log('API:', path);
  console.log('API results:', data.results);
  console.log('API errors:', data.errors);

  if (!response.ok) {
    throw new Error(`API HTTP ${response.status}`);
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(
      `API error: ${JSON.stringify(data.errors)}`
    );
  }

  return data;
}

export async function getMatches(env) {
  const apiKey = env.AF_KEY;

  if (!apiKey) {
    throw new Error('AF_KEY bulunamadı');
  }

  console.log('AF_KEY bulundu');

  const liveData = await apiFetch(
    '/fixtures?live=all',
    apiKey
  );

  console.log(
    'Canlı maç sayısı:',
    liveData.response?.length || 0
  );

  /*
    Test amacıyla tarih filtresini kaldırıyoruz.
    Böylece API'nin sezon için gerçekten maç
    döndürüp döndürmediğini görebileceğiz.
  */

  const requests = Object.keys(LEAGUE_IDS).map(
    leagueId =>
      apiFetch(
        `/fixtures?league=${leagueId}` +
        `&season=${CURRENT_SEASON}`,
        apiKey
      )
  );

  const results = await Promise.all(requests);

  let fixtures = [];

  for (const result of results) {
    fixtures.push(
      ...(result.response || [])
    );
  }

  /*
    Canlı maçları da ekle
  */

  fixtures.push(
    ...(liveData.response || [])
  );

  console.log(
    'Toplam API fixture:',
    fixtures.length
  );

  /*
    Aynı maçı iki kere göstermeyelim
  */

  const unique = new Map();

  for (const fixture of fixtures) {
    if (fixture.fixture?.id) {
      unique.set(
        fixture.fixture.id,
        fixture
      );
    }
  }

  const matches = [];

  for (const f of unique.values()) {
    const league =
      LEAGUE_IDS[f.league?.id];

    if (!league) {
      continue;
    }

    const homeId =
      f.teams?.home?.id;

    const awayId =
      f.teams?.away?.id;

    if (!homeId || !awayId) {
      continue;
    }

    const statusRaw =
      f.fixture?.status?.short;

    let status = 'upcoming';

    if (
      [
        '1H',
        'HT',
        '2H',
        'ET',
        'BT',
        'P'
      ].includes(statusRaw)
    ) {
      status = 'live';
    }

    if (
      [
        'FT',
        'AET',
        'PEN'
      ].includes(statusRaw)
    ) {
      status = 'finished';
    }

    const date =
      new Date(f.fixture.date);

    matches.push({
      id:
        'af' + f.fixture.id,

      league:
        league.name,

      flag:
        league.flag,

      ch:
        league.ch,

      home:
        f.teams.home.name,

      away:
        f.teams.away.name,

      homeLogo:
        f.teams.home.logo,

      awayLogo:
        f.teams.away.logo,

      date:
        date.toLocaleDateString(
          'tr-TR'
        ),

      time:
        date.toLocaleTimeString(
          'tr-TR',
          {
            hour: '2-digit',
            minute: '2-digit'
          }
        ),

      status,

      scoreHome:
        f.goals?.home ?? null,

      scoreAway:
        f.goals?.away ?? null,

      scoreHalf:
        f.score?.halftime?.home != null
          ? `${f.score.halftime.home}-${f.score.halftime.away}`
          : null,

      minute:
        f.fixture?.status?.elapsed ?? null
    });
  }

  matches.sort((a, b) => {
    const order = {
      live: 0,
      upcoming: 1,
      finished: 2
    };

    return (
      (order[a.status] ?? 3) -
      (order[b.status] ?? 3)
    );
  });

  console.log(
    'Frontend için maç sayısı:',
    matches.length
  );

  return matches;
}

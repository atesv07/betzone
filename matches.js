const LEAGUE_IDS = {
  39:  { name: 'Premier Lig',    flag: '🏴', ch: 'beIN Sports' },
  140: { name: 'La Liga',        flag: '🇪🇸', ch: 'S Sport' },
  135: { name: 'Serie A',        flag: '🇮🇹', ch: 'S Sport Plus' },
  78:  { name: 'Bundesliga',     flag: '🇩🇪', ch: 'S Sport Plus' },
  61:  { name: 'Ligue 1',        flag: '🇫🇷', ch: 'beIN Sports' },
  2:   { name: 'Şampiyonlar L.', flag: '🏆', ch: 'beIN Sports' },
  3:   { name: 'Avrupa Ligi',    flag: '🌟', ch: 'beIN Sports' }
};

const CURRENT_SEASON = 2025;

async function apiFetch(path, apiKey) {
  const response = await fetch(
    `https://v3.football.api-sports.io${path}`,
    {
      headers: {
        'x-apisports-key': apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`API HTTP ${response.status}`);
  }

  return response.json();
}


/* Takımın son 8 maçından temel performans istatistikleri */
function teamStats(fixtures, teamId) {

  const games = fixtures
    .filter(f => {
      const home = f.teams?.home?.id;
      const away = f.teams?.away?.id;

      return (
        (home === teamId || away === teamId) &&
        ['FT', 'AET', 'PEN'].includes(
          f.fixture?.status?.short
        )
      );
    })
    .sort(
      (a, b) =>
        new Date(b.fixture.date) -
        new Date(a.fixture.date)
    )
    .slice(0, 8);

  if (!games.length) {
    return {
      games: 0,
      goalsFor: 1.2,
      goalsAgainst: 1.2,
      pointsPerGame: 1
    };
  }

  let goalsFor = 0;
  let goalsAgainst = 0;
  let points = 0;

  for (const game of games) {

    const isHome =
      game.teams.home.id === teamId;

    const gf = isHome
      ? game.goals.home
      : game.goals.away;

    const ga = isHome
      ? game.goals.away
      : game.goals.home;

    goalsFor += gf ?? 0;
    goalsAgainst += ga ?? 0;

    if (gf > ga) {
      points += 3;
    } else if (gf === ga) {
      points += 1;
    }
  }

  return {
    games: games.length,
    goalsFor: goalsFor / games.length,
    goalsAgainst: goalsAgainst / games.length,
    pointsPerGame: points / games.length
  };
}


/* Poisson dağılımı */
function poisson(lambda, goals) {

  let factorial = 1;

  for (let i = 2; i <= goals; i++) {
    factorial *= i;
  }

  return (
    Math.exp(-lambda) *
    Math.pow(lambda, goals) /
    factorial
  );
}


/*
  Maç sonucunun istatistiksel olasılıklarını hesaplar.
*/
function calculatePrediction(home, away) {

  let homeGoals =
    home.goalsFor * 0.65 +
    away.goalsAgainst * 0.35;

  let awayGoals =
    away.goalsFor * 0.65 +
    home.goalsAgainst * 0.35;


  /* Ev sahibi avantajı */
  homeGoals *= 1.10;


  /* Form etkisi */
  homeGoals *=
    0.85 + home.pointsPerGame / 10;

  awayGoals *=
    0.85 + away.pointsPerGame / 10;


  /* Aşırı değerleri sınırla */
  homeGoals = Math.max(
    0.25,
    Math.min(homeGoals, 4.5)
  );

  awayGoals = Math.max(
    0.20,
    Math.min(awayGoals, 4)
  );


  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;


  /*
    0-7 gol arasındaki tüm skor
    kombinasyonlarını hesaplıyoruz.
  */
  for (let h = 0; h <= 7; h++) {

    for (let a = 0; a <= 7; a++) {

      const probability =
        poisson(homeGoals, h) *
        poisson(awayGoals, a);

      if (h > a) {
        homeWin += probability;
      }
      else if (h === a) {
        draw += probability;
      }
      else {
        awayWin += probability;
      }
    }
  }


  const total =
    homeWin +
    draw +
    awayWin;

  homeWin /= total;
  draw /= total;
  awayWin /= total;


  return {

    homeProbability:
      +(homeWin * 100).toFixed(1),

    drawProbability:
      +(draw * 100).toFixed(1),

    awayProbability:
      +(awayWin * 100).toFixed(1),

    expectedHomeGoals:
      +homeGoals.toFixed(2),

    expectedAwayGoals:
      +awayGoals.toFixed(2)
  };
}


/*
  İstatistiksel olasılıktan
  simülasyon katsayısı oluştur.
*/
function simulationOdds(probability) {

  if (probability <= 0) {
    return null;
  }

  return +(100 / probability).toFixed(2);
}


export async function getMatches(env) {

  const apiKey = env.AF_KEY;

  if (!apiKey) {
    throw new Error('AF_KEY bulunamadı');
  }


  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  const nextWeek =
    new Date(
      Date.now() +
      7 * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);


  /* Canlı maçlar */
  const liveData =
    await apiFetch(
      '/fixtures?live=all',
      apiKey
    );


  /* Liglerdeki gelecek maçlar */
  const requests =
    Object.keys(LEAGUE_IDS).map(
      leagueId =>
        apiFetch(
          `/fixtures?league=${leagueId}` +
          `&season=${CURRENT_SEASON}` +
          `&from=${today}` +
          `&to=${nextWeek}` +
          `&timezone=Europe/Istanbul`,
          apiKey
        )
    );


  const results =
    await Promise.all(requests);


  let fixtures = [];


  for (const result of results) {
    fixtures.push(
      ...(result.response || [])
    );
  }


  fixtures.push(
    ...(liveData.response || [])
  );


  /* Duplicate maçları temizle */
  const unique =
    new Map();

  for (const fixture of fixtures) {
    unique.set(
      fixture.fixture.id,
      fixture
    );
  }


  const matches = [];


  for (const f of unique.values()) {

    const league =
      LEAGUE_IDS[f.league?.id];

    if (!league) continue;


    const homeId =
      f.teams?.home?.id;

    const awayId =
      f.teams?.away?.id;

    if (!homeId || !awayId) continue;


    /*
      Bu iki takımın geçmiş maçlarını
      ayrıca çekiyoruz.
    */

    let history = [];

    try {

      const homeHistory =
        await apiFetch(
          `/fixtures?team=${homeId}` +
          `&season=${CURRENT_SEASON}` +
          `&last=8`,
          apiKey
        );

      const awayHistory =
        await apiFetch(
          `/fixtures?team=${awayId}` +
          `&season=${CURRENT_SEASON}` +
          `&last=8`,
          apiKey
        );

      history = [
        ...(homeHistory.response || []),
        ...(awayHistory.response || [])
      ];

    } catch {
      history = [];
    }


    const homeStats =
      teamStats(history, homeId);

    const awayStats =
      teamStats(history, awayId);


    const prediction =
      calculatePrediction(
        homeStats,
        awayStats
      );


    /*
      Simülasyon katsayıları.
    */
    const odd1 =
      simulationOdds(
        prediction.homeProbability
      );

    const oddX =
      simulationOdds(
        prediction.drawProbability
      );

    const odd2 =
      simulationOdds(
        prediction.awayProbability
      );


    const statusRaw =
      f.fixture.status?.short;


    let status = 'upcoming';

    if (
      ['1H', 'HT', '2H', 'ET', 'BT', 'P']
        .includes(statusRaw)
    ) {
      status = 'live';
    }

    if (
      ['FT', 'AET', 'PEN']
        .includes(statusRaw)
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
        f.fixture.status?.elapsed ?? null,


      /*
        Simülasyon değerleri
      */
      odd1,
      oddX,
      odd2,


      /*
        Asıl istatistiksel değerler
      */
      prediction: {

        home:
          prediction.homeProbability,

        draw:
          prediction.drawProbability,

        away:
          prediction.awayProbability,

        expectedHomeGoals:
          prediction.expectedHomeGoals,

        expectedAwayGoals:
          prediction.expectedAwayGoals
      },


      /*
        Frontend'de göstermek
        istersen kullanabileceğin
        takım istatistikleri.
      */
      stats: {

        homeGames:
          homeStats.games,

        awayGames:
          awayStats.games,

        homeGoalsFor:
          +homeStats.goalsFor.toFixed(2),

        awayGoalsFor:
          +awayStats.goalsFor.toFixed(2),

        homeGoalsAgainst:
          +homeStats.goalsAgainst.toFixed(2),

        awayGoalsAgainst:
          +awayStats.goalsAgainst.toFixed(2)
      },

      markets: {}
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


  return matches;
}

import { getMatches } from './matches.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    console.log('REQUEST:', url.pathname);

    if (url.pathname === '/matches') {
      try {
        console.log('Calling getMatches...');

        const matches = await getMatches(env);

        console.log('MATCH COUNT:', matches.length);

        return Response.json(
          { matches },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=60'
            }
          }
        );
      } catch (error) {
        console.log('ERROR:', error.message);
        console.log('STACK:', error.stack);

        return Response.json(
          {
            error: error.message
          },
          {
            status: 500
          }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};

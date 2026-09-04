import { getMatches } from './matches.js';

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);


    /*
      Maç API endpoint'i
    */
    if (url.pathname === '/matches') {

      try {

        const matches =
          await getMatches(env);

        return Response.json(
          { matches },
          {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Cache-Control':
                'public, max-age=60'
            }
          }
        );

      } catch (error) {

        return Response.json(
          {
            error:
              error.message
          },
          {
            status: 500
          }
        );
      }
    }


    /*
      Diğer her şeyi index.html /
      statik dosyalara gönder.
    */
    return env.ASSETS.fetch(request);
  }
};

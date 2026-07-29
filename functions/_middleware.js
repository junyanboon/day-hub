export async function onRequest(context) {
  const password = context.env.DAY_HUB_PASSWORD;
  if (!password) {
    return new Response("Day Hub access is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const authorization = context.request.headers.get("Authorization") || "";
  if (authorization.startsWith("Basic ")) {
    try {
      const credentials = atob(authorization.slice(6));
      if (credentials === `junyan:${password}`) {
        return context.next();
      }
    } catch {
      // Invalid authorization header; fall through to the login prompt.
    }
  }

  return new Response("Private Day Hub", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Day Hub", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

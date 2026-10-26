import { createServer } from "node:http";

import { fixtureAccessToken, fixtureUser } from "../tests/fixtures/live-session.mjs";

/** Loopback-only fixture. Production application logic has no test authentication bypass. */
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ fixture: "local-auth-only" }));
    return;
  }
  if (
    request.method === "GET" &&
    request.url === "/auth/v1/user" &&
    request.headers.authorization === `Bearer ${fixtureAccessToken}` &&
    request.headers.apikey === "sb_publishable_local_fixture"
  ) {
    response.end(JSON.stringify(fixtureUser));
    return;
  }
  response.statusCode = 401;
  response.end(
    JSON.stringify({ code: "fixture_denied", message: "Not an authorised test fixture request." }),
  );
});
server.listen(54329, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));

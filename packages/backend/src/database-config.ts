/** Normalize database settings before pg parses connection-string options. Never log the URL. */
export function databaseConnectionConfig(raw: string, ca?: string) {
  try {
    const url = new URL(raw);
    const allowed = new Set(["application_name", "sslmode", "sslcert", "sslkey", "sslrootcert"]);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !database ||
      /[/\\\x00]/.test(database) ||
      url.hash ||
      (url.port && (Number(url.port) < 1 || Number(url.port) > 65535)) ||
      [...url.searchParams.keys()].some((key) => !allowed.has(key))
    )
      throw new Error();
    // Certificate trust comes only from the explicit secure environment, never URL file paths.
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return {
      connectionString: url.href,
      ssl: local
        ? (false as const)
        : { rejectUnauthorized: true as const, ...(ca ? { ca: ca.replace(/\\n/g, "\n") } : {}) },
    };
  } catch {
    throw new Error(
      "Database configuration is invalid. Use an explicit PostgreSQL host, user and database without routing overrides.",
    );
  }
}

import { Pool } from "pg";

import { databaseConnectionConfig } from "./database-config.ts";

export interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}
export interface SqlExecutor {
  query<Row = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
}
export interface SqlConnection extends SqlExecutor {
  release(error?: Error | boolean): void;
}
export interface ConnectionPool {
  connect(): Promise<SqlConnection>;
  end(): Promise<void>;
}

/** Only pass user IDs obtained from a verified server-side authentication session. */
export class Database {
  private readonly pool: ConnectionPool;
  constructor(pool: ConnectionPool) {
    this.pool = pool;
  }

  async withUser<T>(userId: string, operation: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new Error("A verified UUID is required");
    }
    return this.transaction("authenticated", operation, userId);
  }

  /** Server-only worker/payment/contact operations; never expose this capability to a browser. */
  withService<T>(operation: (sql: SqlExecutor) => Promise<T>): Promise<T> {
    return this.transaction("service_role", operation);
  }

  private async transaction<T>(
    role: "authenticated" | "service_role",
    operation: (sql: SqlExecutor) => Promise<T>,
    userId?: string,
  ): Promise<T> {
    const connection = await this.pool.connect();
    let discardConnection = false;
    try {
      await connection.query("begin");
      // Role names are a closed union, never request data. SET LOCAL cannot leak through the pool.
      await connection.query(
        role === "authenticated" ? "set local role authenticated" : "set local role service_role",
      );
      await connection.query(
        "select set_config('statement_timeout', '10000', true), set_config('lock_timeout', '5000', true)",
      );
      await connection.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role, ...(userId ? { sub: userId } : {}) }),
      ]);
      const result = await operation(connection);
      await connection.query("commit");
      return result;
    } catch (error) {
      try {
        await connection.query("rollback");
      } catch {
        discardConnection = true;
      }
      throw error;
    } finally {
      connection.release(discardConnection || undefined);
    }
  }

  close(): Promise<void> {
    return this.pool.end();
  }
}

export function createDatabase(
  connectionString: string,
  options: { max?: number; ssl?: { rejectUnauthorized: true; ca?: string } } = {},
): Database {
  return new Database(
    new Pool({
      max: options.max ?? 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      ...options,
      ...databaseConnectionConfig(connectionString, options.ssl?.ca),
    }),
  );
}

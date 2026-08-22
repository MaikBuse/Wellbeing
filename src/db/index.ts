import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

type Cache = {
  sql?: ReturnType<typeof postgres>;
  db?: Db;
};

// In dev, HMR creates a new module instance per reload; caching on globalThis
// keeps that from leaking a connection pool per edit.
const cache = globalThis as unknown as { wellbeingDb?: Cache };
cache.wellbeingDb ??= {};

function connect(): Db {
  const store = cache.wellbeingDb!;
  if (store.db) return store.db;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  // The in-cluster Postgres allows 50 connections and there is one replica.
  store.sql = postgres(url, { max: 5 });
  store.db = drizzle(store.sql, { schema });
  return store.db;
}

/**
 * Lazily connected database handle.
 *
 * Connecting at module load would break `next build`: collecting page data
 * imports this module, and the image is built without a DATABASE_URL. So the
 * pool is created on first actual use instead.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    const value = Reflect.get(connect(), property, receiver) as unknown;
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(connect())
      : value;
  },
});

export { schema };

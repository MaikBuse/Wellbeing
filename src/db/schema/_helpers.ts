import { numeric, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';

export const pk = () => uuid('id').primaryKey().defaultRandom();

/**
 * numeric, not double precision: sums of nutrients must not drift.
 * mode:'number' — without it drizzle returns numeric as string.
 */
export const num = (name: string, precision = 10, scale = 2) =>
  numeric(name, { precision, scale, mode: 'number' });

export const tsz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => tsz('created_at').notNull().defaultNow();

export const updatedAt = () =>
  tsz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** 0..10 scale. Range enforced by a table-level CHECK. */
export const score = (name: string) => smallint(name);

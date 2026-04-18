/**
 * Tally — database schema barrel.
 *
 * Drizzle schema is split per concern. Tables that follow the versioning
 * pattern are defined via the `versionedTable` helper in `_versioning.ts`,
 * which produces both the current-state table and its `_version` snapshot
 * companion.
 *
 * Conventions:
 *  - All ids are `cuid2` strings.
 *  - All timestamps are stored as `timestamp with time zone` and treated as UTC.
 *    UI is responsible for never localizing on the way in or out.
 *  - All money is stored as `numeric(20, 4)` with a separate currency code.
 *    Entity-base-currency mirrors live next to original amounts.
 *  - JSON columns use `jsonb`. Where schema is known, types are exported
 *    from a sibling `*.types.ts` file alongside the table definition.
 */

export * from './_versioning';
export * from './users-and-iam';
export * from './entities-and-jurisdictions';
export * from './blobs';
export * from './documents';
export * from './source-artifacts';
export * from './derived-artifacts';
export * from './taxonomies';
export * from './billing-arrangements';
export * from './integrations';
export * from './agents';
export * from './embeddings';
export * from './audit';

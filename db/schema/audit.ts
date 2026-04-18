/**
 * Audit log barrel re-export.
 *
 * The actual definitions live in `_versioning.ts` because edit_sessions and
 * audit_log are conceptually part of the versioning story. This file exists
 * so `audit` can be referenced as its own concern from the schema barrel.
 */

export { auditLog, editSessions } from './_versioning';
export type {
  AuditLogEntry,
  NewAuditLogEntry,
  EditSession,
  NewEditSession,
} from './_versioning';

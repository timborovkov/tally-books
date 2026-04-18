/**
 * Agent state: conversation threads, messages, executed tool calls, and
 * non-conversational suggestions (e.g. receipt-categorizer's proposals).
 *
 * Each row carries `agentId`, which is the string id from one of the
 * agents defined under `src/lib/ai/agents/<n>/agent.ts`. Multiple
 * agents share these tables — they're partitioned logically by `agentId`.
 *
 * `agent_action` provides an audit trail of what the agent actually did —
 * each tool call, its input, output, and whether the user confirmed it
 * (for destructive tools). Even read-only calls are logged so we can
 * answer "what did the agent see when it gave that recommendation?".
 *
 * `agent_suggestion` is for asynchronous, non-conversational output: a
 * suggested category for a receipt, a flagged inconsistency in a report,
 * a proactive recommendation surfaced on the dashboard. The user resolves
 * each one (accept / reject / supersede).
 */

import { boolean, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users-and-iam';

/**
 * Whether a thread is for a user-initiated conversation or a system-driven
 * background activity (e.g. nightly proactive recommender).
 */
export const agentThreadKindEnum = pgEnum('agent_thread_kind', ['user', 'system']);

export const agentMessageRoleEnum = pgEnum('agent_message_role', [
  'user',
  'assistant',
  'tool',
  'system',
]);

export const agentActionStatusEnum = pgEnum('agent_action_status', [
  'pending', // tool call requested, awaiting user confirm (for destructive)
  'succeeded',
  'failed',
  'rejected', // user rejected at the confirm step
]);

export const agentSuggestionStatusEnum = pgEnum('agent_suggestion_status', [
  'pending',
  'accepted',
  'rejected',
  'superseded', // a newer suggestion replaced this one
]);

/* -------------------------------------------------------------------------- */
/*  Threads                                                                   */
/* -------------------------------------------------------------------------- */

export const agentThreads = pgTable('agent_threads', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  kind: agentThreadKindEnum('kind').notNull().default('user'),
  /** Null for system threads. */
  userId: text('user_id').references(() => users.id),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

export const agentMessages = pgTable('agent_messages', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => agentThreads.id),
  agentId: text('agent_id').notNull(),
  role: agentMessageRoleEnum('role').notNull(),
  /** Discriminated content: { type: 'text', text } | { type: 'tool_call', ... } | ... */
  content: jsonb('content').notNull(),
  tokensIn: text('tokens_in'),
  tokensOut: text('tokens_out'),
  /** The model identifier as resolved by the provider (e.g. 'gpt-4o-...'). */
  model: text('model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/*  Actions (tool calls)                                                      */
/* -------------------------------------------------------------------------- */

export const agentActions = pgTable('agent_actions', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => agentThreads.id),
  agentId: text('agent_id').notNull(),
  /** Tool identifier — e.g. 'write.createInvoiceDraft'. */
  tool: text('tool').notNull(),
  input: jsonb('input').notNull(),
  output: jsonb('output'),
  status: agentActionStatusEnum('status').notNull().default('pending'),
  /** True when the user confirmed in the UI. Null for non-destructive tools. */
  confirmedByUser: boolean('confirmed_by_user'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/* -------------------------------------------------------------------------- */
/*  Suggestions (non-conversational output)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Asynchronous, non-conversational agent output. Examples:
 *
 *   - receipt-categorizer suggests `categoryId` for a receipt
 *   - proofreader flags a missing deduction in a tax return
 *   - proactive-recommender surfaces a cost-saving recommendation
 *
 * Targets are addressed by (`targetThingType`, `targetThingId`). The UI
 * renders pending suggestions inline on the relevant Thing's page.
 */
export const agentSuggestions = pgTable('agent_suggestions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  targetThingType: text('target_thing_type').notNull(),
  targetThingId: text('target_thing_id').notNull(),
  /** Discriminated by suggestion type — `{ kind, ...payload }`. */
  payload: jsonb('payload').notNull(),
  status: agentSuggestionStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedBy: text('decided_by').references(() => users.id),
});

/* -------------------------------------------------------------------------- */
/*  Type exports                                                              */
/* -------------------------------------------------------------------------- */

export type AgentThreadKind = (typeof agentThreadKindEnum.enumValues)[number];
export type AgentMessageRole = (typeof agentMessageRoleEnum.enumValues)[number];
export type AgentActionStatus = (typeof agentActionStatusEnum.enumValues)[number];
export type AgentSuggestionStatus =
  (typeof agentSuggestionStatusEnum.enumValues)[number];

export type AgentThread = typeof agentThreads.$inferSelect;
export type NewAgentThread = typeof agentThreads.$inferInsert;

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;

export type AgentAction = typeof agentActions.$inferSelect;
export type NewAgentAction = typeof agentActions.$inferInsert;

export type AgentSuggestion = typeof agentSuggestions.$inferSelect;
export type NewAgentSuggestion = typeof agentSuggestions.$inferInsert;

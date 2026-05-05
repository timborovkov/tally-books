/**
 * Central model registry — every external-LLM model name Tally
 * depends on lives here, keyed by use case.
 *
 * Why this isn't an env var:
 *   Model choice is a *product decision*, not infrastructure config.
 *   It's coupled to the prompt and the output schema (vision OCR's
 *   structured-output schema, the agent's tool-calling format,
 *   embedding dimension). Bumping a model usually wants a prompt
 *   review and an eval pass. That's a PR with diff visibility,
 *   not an env flip on a managed host.
 *
 * Why a single file:
 *   Three planned use cases (PROJECT_BRIEF.md §3.3): vision OCR
 *   today, chat-agent + embeddings in v0.5. Each will live behind
 *   its own provider in `src/lib/ai/providers/`, but "what models
 *   does Tally actually use right now?" should be one file's
 *   answer — not a grep across the providers folder.
 *
 * Adding a new constant: pick a name that says *what it's for*,
 * not what model it currently happens to be. `VISION_OCR_MODEL`
 * survives a swap from `gpt-5-mini` to whatever's next; a name
 * like `GPT5_MINI` doesn't. Group constants by capability section
 * below.
 */

// ── Vision (today) ─────────────────────────────────────────────────────────
//
// Receipt OCR for the intake.ocr worker. The provider uses
// `chat.completions.parse()` + `zodResponseFormat()`, so this model
// must support image input AND json_schema structured outputs.
// `gpt-5-mini` is the current sweet spot: vision, structured outputs,
// 400k context, ~10× cheaper than gpt-4o for this workload.

export const VISION_OCR_MODEL = "gpt-5-mini";

// ── Chat (v0.5) ────────────────────────────────────────────────────────────
//
// Reserved for the AI agent core (TODO.md §v0.5). The agent loop runs
// through the Vercel AI SDK and needs a reasoning-capable model with
// strong tool-calling. Constants will be added here when the chat
// provider lands — one per agent if their needs diverge, but starting
// with a single `AGENT_CHAT_MODEL` is fine for the general-chat agent.

// ── Embeddings (v0.5) ──────────────────────────────────────────────────────
//
// Reserved for pgvector-backed RAG (TODO.md §v0.5). Embedding model
// choice is a one-way door: changing the model means re-embedding
// every document, so the constant gates a real migration. Will land
// alongside the embeddings table.

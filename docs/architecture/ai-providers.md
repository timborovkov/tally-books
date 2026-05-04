# AI providers

Every call to an LLM goes through a typed provider interface. App code never imports an SDK directly. Swapping providers (OpenAI → Anthropic → self-hosted vLLM) is a file change, not a sweep.

Source of truth: [`src/lib/ai/`](../../src/lib/ai).

## State of affairs (v0.2)

One interface exists today: `VisionProvider`, used by the intake-inbox OCR pipeline. Chat + embedding providers land in v0.5 when the agent framework ships. The pattern is already established so the v0.5 work is additive, not a retrofit.

## `VisionProvider`

```ts
interface VisionProvider {
  readonly id: string; // "openai:gpt-4o-2024-08-06"
  extractReceipt(input: { bytes: Buffer; contentType: string }): Promise<ReceiptExtraction>;
}
```

`ReceiptExtraction` is defined by a Zod schema in [`src/lib/ai/schemas/receipt-extraction.ts`](../../src/lib/ai/schemas/receipt-extraction.ts). Every domain field comes back as `{ value, confidence }`, so the UI can paint uncertainty per-field instead of treating the whole extraction as one opaque result.

## Current implementation

[`OpenAIVisionProvider`](../../src/lib/ai/providers/openai-vision.ts) uses `chat.completions.parse` + `zodResponseFormat`. The image is sent as a base64 data URL content part (private RustFS bucket; presigned URLs would work too but keep the provider self-contained).

The system prompt in that file is the bookkeeping-specific guidance: prefer the printed total, use ISO 8601, don't guess illegible text. Changes to the prompt ship there, not in the caller.

Selecting a provider:

```ts
import { getVisionProvider } from "@/lib/ai";
const provider = getVisionProvider();
const result = await provider.extractReceipt({ bytes, contentType });
```

Today `getVisionProvider()` returns the OpenAI instance unconditionally. When a second provider lands it'll branch on env / settings here — no call-site changes.

## Env

```
OPENAI_API_KEY=sk-…            # required when vision is actually used
OPENAI_VISION_MODEL=gpt-4o-2024-08-06
```

Missing API key is not a boot error. The app starts clean; the OCR handler surfaces a clear `ocrError` on affected intake items and the UI shows the failed badge. Operators see the error per-item, not as a boot failure that would block every other app feature.

## Rules

- **No provider SDK types in app code.** If app code references `OpenAI.Completions.*` or `ChatCompletion` it's a bug. Only the provider implementation imports the SDK.
- **Structured outputs always go through Zod.** Even when a provider claims to enforce a JSON schema, we re-parse on this side — providers occasionally return near-valid-but-not-quite JSON, and catching that here is cheap.
- **Confidence is first-class.** Extractions without per-field confidence lose a UI affordance the user depends on; don't introduce a provider that can't give us one.

## Future shape (v0.5+)

```ts
interface ChatProvider  { chat(...): …Stream; }
interface EmbeddingProvider { embed(text): Vector; }
```

Same selection pattern: `getChatProvider()`, `getEmbeddingProvider()`. See [`TODO.md`](../../TODO.md) §v0.5 "Provider abstraction" for the full shape.

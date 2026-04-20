/**
 * AI subsystem entry point. Resolves the active VisionProvider and
 * exposes the schema type for consumers.
 *
 * Today there's exactly one provider (OpenAI); future providers
 * (Anthropic vision, self-hosted vLLM) get selected here based on
 * env or a `ai.vision.provider` setting. Keeping all provider
 * selection behind `getVisionProvider()` means no call site
 * imports a concrete provider module — the whole point of the
 * provider-interface pattern.
 */
import { OpenAIVisionProvider } from "./providers/openai-vision";
import type { VisionProvider } from "./providers/types";

let cachedVision: VisionProvider | null = null;

export function getVisionProvider(): VisionProvider {
  if (!cachedVision) {
    cachedVision = new OpenAIVisionProvider();
  }
  return cachedVision;
}

export type { VisionProvider, VisionExtractInput } from "./providers/types";
export { receiptExtraction, type ReceiptExtraction } from "./schemas/receipt-extraction";

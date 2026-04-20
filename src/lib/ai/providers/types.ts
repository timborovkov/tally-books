/**
 * Minimal AI provider interfaces.
 *
 * Full `ChatProvider` / `VisionProvider` / `EmbeddingProvider`
 * abstractions land in v0.5 when the agent framework ships. Today
 * we only need vision for receipt OCR — but we still declare the
 * interface here and route calls through it so the v0.5 rule "no
 * OpenAI SDK types leak into app code" holds from day one. Future
 * providers (Anthropic vision, local vLLM for self-hosters) drop
 * in as another implementation of this interface without touching
 * any call site.
 */
import type { ReceiptExtraction } from "@/lib/ai/schemas/receipt-extraction";

export interface VisionProvider {
  /**
   * Given the bytes of a receipt image/PDF, return a structured
   * extraction. The provider is responsible for:
   *   - encoding the payload for its model (base64 / URL / file upload)
   *   - requesting structured output matching `receiptExtraction`
   *   - parsing + Zod-validating before returning
   *
   * Errors from the provider (network, auth, schema rejection) are
   * propagated to the caller as thrown exceptions — the worker
   * catches them and writes `ocrStatus='failed'` with `ocrError`.
   */
  extractReceipt(input: VisionExtractInput): Promise<ReceiptExtraction>;

  /**
   * Human-readable name for logs / error messages / audit
   * attribution. Doesn't have to be unique across time (we may
   * upgrade the model) — the audit log carries the exact model ID.
   */
  readonly id: string;
}

export interface VisionExtractInput {
  /** Raw image/PDF bytes. */
  bytes: Buffer;
  /** MIME type (e.g. `image/jpeg`, `application/pdf`). */
  contentType: string;
}

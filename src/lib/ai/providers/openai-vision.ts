/**
 * OpenAI implementation of the VisionProvider interface.
 *
 * Uses the chat-completions parser helper (`.parse()` +
 * `zodResponseFormat`) — OpenAI's structured-outputs path that
 * guarantees the response parses against our Zod schema or throws.
 *
 * The image is encoded as a base64 data URL content part. OpenAI's
 * vision endpoint also accepts public URLs, but our blobs are in a
 * private RustFS bucket. Minting a presigned URL and passing that
 * would work too, but base64 keeps the call self-contained — the
 * provider doesn't need ambient knowledge of the storage layer.
 *
 * Errors (auth, schema rejection, network) propagate to the caller.
 * The worker translates them into `ocrStatus='failed'` on the
 * intake item.
 */
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";

import { VISION_OCR_MODEL } from "@/lib/ai/models";
import { receiptExtraction, type ReceiptExtraction } from "@/lib/ai/schemas/receipt-extraction";
import { env } from "@/lib/env";

import type { VisionExtractInput, VisionProvider } from "./types";

const SYSTEM_PROMPT = `You are a careful bookkeeping assistant extracting data from a receipt image.

Rules:
- Prefer the printed total (including VAT) as the amount. If the receipt
  shows only a subtotal + separate VAT lines, compute the total and
  return both the total under 'amount' and the VAT lines under 'taxLines'.
- 'occurredAt' is the transaction date printed on the receipt. If only a
  date without time is printed, use T00:00:00Z. Use ISO 8601 with a Z suffix.
- 'currency' is the 3-letter ISO 4217 code of the transaction — NOT the
  user's home currency. If unclear, leave null with confidence 0.
- 'vendor' is the business that issued the receipt. Strip suffixes like
  'Ltd', 'GmbH', 'OÜ' only if the remaining name is unambiguous.
- 'categoryHint' is free text — suggest a likely bookkeeping category
  (e.g. 'office supplies', 'fuel', 'client meal'). Do NOT invent IDs.
- Every 'confidence' is a float in [0, 1] reflecting YOUR certainty
  about that field specifically. 0 = not visible / illegible.
  'overallConfidence' is the minimum of the field confidences.
- If a field is absent / illegible, return null with confidence 0.
  Do NOT guess.`;

export class OpenAIVisionProvider implements VisionProvider {
  public readonly id: string;
  readonly #client: OpenAI;
  readonly #model: string;

  constructor() {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OpenAIVisionProvider: OPENAI_API_KEY is not set. OCR jobs need a real key.");
    }
    this.#client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.#model = VISION_OCR_MODEL;
    this.id = `openai:${this.#model}`;
  }

  async extractReceipt(input: VisionExtractInput): Promise<ReceiptExtraction> {
    const dataUrl = `data:${input.contentType};base64,${input.bytes.toString("base64")}`;

    const completion = await this.#client.chat.completions.parse({
      model: this.#model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the receipt data into the required JSON structure.",
            },
            {
              type: "image_url",
              image_url: { url: dataUrl },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(receiptExtraction, "receipt_extraction"),
    });

    const parsed = completion.choices[0]?.message.parsed;
    if (!parsed) {
      throw new Error(
        `OpenAIVisionProvider: no parsed output (finish_reason=${
          completion.choices[0]?.finish_reason ?? "unknown"
        })`,
      );
    }
    // OpenAI's parse already validated the structure, but re-run our
    // Zod schema so any field-level constraints it doesn't enforce
    // (e.g. the decimal regex) still land on the server of record.
    return receiptExtraction.parse(parsed);
  }
}

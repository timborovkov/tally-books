import { z } from "zod";

const documentKind = z.enum([
  "contract",
  "addendum",
  "invoice_received",
  "filing",
  "government_mail",
  "insurance",
  "guide",
  "identification",
  "other",
]);

const ownerType = z.enum(["party", "person", "entity"]);

export const createDocumentInput = z.object({
  entityId: z.string().min(1).nullable().optional(),
  kind: documentKind,
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  blobId: z.string().min(1),
  ownerType,
  ownerId: z.string().min(1),
  tags: z.array(z.string().min(1).max(60)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateDocumentInput = z.input<typeof createDocumentInput>;


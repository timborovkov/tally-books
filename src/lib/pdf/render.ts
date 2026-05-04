import { renderToBuffer } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";

import type { Db } from "@/db/client";
import { blobs, entities, invoices, parties } from "@/db/schema";
import { readEntityBranding } from "@/lib/entity-branding";
import { getBlobBytes } from "@/lib/storage";

import { parseLineItems } from "@/domains/invoices";

import { InvoicePdf } from "./invoice";

/**
 * Render an invoice to a PDF Buffer. Loads everything the template
 * needs in one shot — entity, branding, client, logo bytes — then hands
 * it to `<InvoicePdf>` and lets `@react-pdf/renderer` produce bytes.
 *
 * The logo fetch is best-effort: a missing/unreadable blob just drops
 * the image rather than failing the whole render. The user can verify
 * the upload separately.
 */
export async function renderInvoicePdf(db: Db, invoiceId: string): Promise<Buffer> {
  const [row] = await db
    .select({
      invoice: invoices,
      entity: entities,
      client: parties,
    })
    .from(invoices)
    .innerJoin(entities, eq(entities.id, invoices.entityId))
    .leftJoin(parties, eq(parties.id, invoices.clientId))
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!row) throw new Error(`invoice ${invoiceId} not found`);

  const branding = readEntityBranding(row.entity.metadata);

  let logoDataUrl: string | null = null;
  if (branding.logoBlobId) {
    try {
      const [blob] = await db
        .select()
        .from(blobs)
        .where(eq(blobs.id, branding.logoBlobId))
        .limit(1);
      if (blob) {
        const bytes = await getBlobBytes(blob.bucket as Parameters<typeof getBlobBytes>[0], blob.objectKey);
        logoDataUrl = `data:${blob.contentType};base64,${bytes.toString("base64")}`;
      }
    } catch {
      // Best-effort: keep rendering even if the logo can't be fetched.
      logoDataUrl = null;
    }
  }

  const lineItems = parseLineItems(row.invoice.lineItems);

  const pdfNode = InvoicePdf({
    invoice: {
      number: row.invoice.number,
      issueDate: row.invoice.issueDate,
      dueDate: row.invoice.dueDate,
      currency: row.invoice.currency,
      lineItems,
      total: row.invoice.total,
      vatTotal: row.invoice.vatTotal,
      description: row.invoice.description,
    },
    entity: {
      name: row.entity.name,
      businessId: row.entity.businessId,
      vatNumber: row.entity.vatNumber,
      address: row.entity.address,
    },
    branding,
    client: row.client
      ? {
          name: row.client.name,
          address:
            row.client.contact && typeof row.client.contact === "object"
              ? ((row.client.contact as { address?: unknown }).address as
                  | Record<string, string>
                  | undefined) ?? null
              : null,
          vatNumber:
            row.client.taxIds && typeof row.client.taxIds === "object"
              ? ((row.client.taxIds as Record<string, string>).vat ?? null)
              : null,
        }
      : null,
    logoDataUrl,
  });

  return renderToBuffer(pdfNode);
}

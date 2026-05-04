import { Document, Page, StyleSheet, Text, View, Image } from "@react-pdf/renderer";

import type { EntityBranding } from "@/lib/entity-branding";

import type { InvoiceLineItem } from "@/domains/invoices";

interface AddressShape {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postcode?: string;
  country?: string;
}

interface InvoicePdfEntity {
  name: string;
  businessId: string | null;
  vatNumber: string | null;
  address: unknown;
}

interface InvoicePdfClient {
  name: string;
  address?: AddressShape | null;
  vatNumber?: string | null;
}

export interface InvoicePdfData {
  invoice: {
    number: string | null;
    issueDate: Date | null;
    dueDate: Date | null;
    currency: string;
    lineItems: InvoiceLineItem[];
    total: string | null;
    vatTotal: string | null;
    description: string | null;
  };
  entity: InvoicePdfEntity;
  branding: EntityBranding;
  client: InvoicePdfClient | null;
  /** Pre-fetched logo bytes as a data URL (PNG/JPEG). */
  logoDataUrl: string | null;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  brandBlock: {
    flexDirection: "column",
    maxWidth: "60%",
  },
  brandName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  metaBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  invoiceTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 4,
  },
  metaLine: {
    fontSize: 10,
    marginBottom: 2,
  },
  partiesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  partyBlock: {
    flexDirection: "column",
    maxWidth: "48%",
  },
  partyHeading: {
    fontSize: 9,
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  table: {
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 9,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  colDescription: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colUnitPrice: { flex: 1.5, textAlign: "right" },
  colVat: { flex: 1, textAlign: "right" },
  colLineTotal: { flex: 1.5, textAlign: "right" },
  totalsBlock: {
    flexDirection: "column",
    alignItems: "flex-end",
    marginTop: 16,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    width: 240,
    paddingVertical: 2,
  },
  totalsLabel: {
    flex: 1,
    fontSize: 10,
    textAlign: "right",
    paddingRight: 12,
  },
  totalsValue: {
    width: 100,
    fontSize: 10,
    textAlign: "right",
  },
  totalsGrand: {
    fontSize: 12,
    fontWeight: "bold",
  },
  notesBlock: {
    marginTop: 24,
    fontSize: 10,
  },
  notesHeading: {
    fontSize: 9,
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 24,
    fontSize: 8,
    color: "#666",
    textAlign: "center",
  },
  bankBlock: {
    marginTop: 16,
    fontSize: 9,
    color: "#444",
  },
  logo: {
    maxWidth: 120,
    maxHeight: 60,
    marginBottom: 8,
    objectFit: "contain",
  },
});

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}

function formatMoney(amount: string | null, currency: string): string {
  if (amount === null) return "—";
  return `${amount} ${currency}`;
}

function renderAddress(address: unknown): string[] {
  if (!address || typeof address !== "object") return [];
  const a = address as AddressShape;
  const lines: string[] = [];
  if (a.line1) lines.push(a.line1);
  if (a.line2) lines.push(a.line2);
  const cityLine = [a.postcode, a.city].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (a.region) lines.push(a.region);
  if (a.country) lines.push(a.country);
  return lines;
}

function lineSubtotal(item: InvoiceLineItem): string {
  const qty = Number.parseFloat(item.quantity);
  const unit = Number.parseFloat(item.unitPrice);
  const sub = qty * unit;
  if (!Number.isFinite(sub)) return "0.00";
  return sub.toFixed(2);
}

export function InvoicePdf(data: InvoicePdfData) {
  const { invoice, entity, branding, client, logoDataUrl } = data;
  const subtotal =
    invoice.total !== null && invoice.vatTotal !== null
      ? (Number.parseFloat(invoice.total) - Number.parseFloat(invoice.vatTotal)).toFixed(2)
      : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View style={styles.brandBlock}>
            {logoDataUrl ? (
              // `Image` is `@react-pdf/renderer`'s primitive, not next/image
              // or an HTML <img>. The a11y lint rule doesn't apply — PDFs
              // have no DOM and the visible logo is decorative; the entity
              // name renders right next to it.
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image style={styles.logo} src={logoDataUrl} />
            ) : null}
            <Text style={styles.brandName}>{entity.name}</Text>
            {renderAddress(entity.address).map((line) => (
              <Text key={line} style={styles.metaLine}>
                {line}
              </Text>
            ))}
            {entity.businessId ? (
              <Text style={styles.metaLine}>Reg.: {entity.businessId}</Text>
            ) : null}
            {entity.vatNumber ? <Text style={styles.metaLine}>VAT: {entity.vatNumber}</Text> : null}
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.invoiceTitle}>Invoice</Text>
            <Text style={styles.metaLine}>No: {invoice.number ?? "DRAFT"}</Text>
            <Text style={styles.metaLine}>Issued: {formatDate(invoice.issueDate)}</Text>
            <Text style={styles.metaLine}>Due: {formatDate(invoice.dueDate)}</Text>
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyHeading}>Bill to</Text>
            {client ? (
              <>
                <Text>{client.name}</Text>
                {renderAddress(client.address).map((line) => (
                  <Text key={line} style={styles.metaLine}>
                    {line}
                  </Text>
                ))}
                {client.vatNumber ? (
                  <Text style={styles.metaLine}>VAT: {client.vatNumber}</Text>
                ) : null}
              </>
            ) : (
              <Text>—</Text>
            )}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colUnitPrice}>Unit price</Text>
            <Text style={styles.colVat}>VAT</Text>
            <Text style={styles.colLineTotal}>Line total</Text>
          </View>
          {invoice.lineItems.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colQty}>
                {item.quantity}
                {item.unit ? ` ${item.unit}` : ""}
              </Text>
              <Text style={styles.colUnitPrice}>
                {item.unitPrice} {invoice.currency}
              </Text>
              <Text style={styles.colVat}>
                {item.vatRate ? `${(Number.parseFloat(item.vatRate) * 100).toFixed(0)}%` : "0%"}
              </Text>
              <Text style={styles.colLineTotal}>
                {lineSubtotal(item)} {invoice.currency}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          {subtotal !== null ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {subtotal} {invoice.currency}
              </Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>VAT</Text>
            <Text style={styles.totalsValue}>
              {formatMoney(invoice.vatTotal, invoice.currency)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={[styles.totalsLabel, styles.totalsGrand]}>Total</Text>
            <Text style={[styles.totalsValue, styles.totalsGrand]}>
              {formatMoney(invoice.total, invoice.currency)}
            </Text>
          </View>
        </View>

        {invoice.description ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesHeading}>Notes</Text>
            <Text>{invoice.description}</Text>
          </View>
        ) : null}

        {branding.bankAccount && (branding.bankAccount.iban || branding.bankAccount.bankName) ? (
          <View style={styles.bankBlock}>
            <Text style={styles.partyHeading}>Payment</Text>
            {branding.bankAccount.bankName ? <Text>{branding.bankAccount.bankName}</Text> : null}
            {branding.bankAccount.accountHolder ? (
              <Text>{branding.bankAccount.accountHolder}</Text>
            ) : null}
            {branding.bankAccount.iban ? <Text>IBAN: {branding.bankAccount.iban}</Text> : null}
            {branding.bankAccount.bic ? <Text>BIC: {branding.bankAccount.bic}</Text> : null}
          </View>
        ) : null}

        {branding.footer ? <Text style={styles.footer}>{branding.footer}</Text> : null}
      </Page>
    </Document>
  );
}

import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

// The upload service talks to MinIO via `getStorageClient()` and to
// Postgres via a Drizzle `Db`. Unit tests stub both so we can assert
// on the sha256 hashing, the dedupe fast-path, and the insert shape
// without a running MinIO or database.

const putObjectMock = vi.fn<(...args: unknown[]) => Promise<{ etag: string }>>();
const removeObjectMock = vi.fn<(...args: unknown[]) => Promise<void>>();

vi.mock("../client", () => ({
  getStorageClient: () => ({
    putObject: putObjectMock,
    removeObject: removeObjectMock,
  }),
}));

// The schema re-export needs the drizzle runtime; the upload code only
// uses `blobs` as a values target and the query builder's `and/eq` on
// columns. We provide a minimal drizzle handle that records calls.
interface FakeDbCall {
  op: "select" | "insert";
  args: unknown;
}

function makeFakeDb(existingBlob: unknown | null) {
  const calls: FakeDbCall[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            calls.push({ op: "select", args: {} });
            return existingBlob ? [existingBlob] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        returning: async () => {
          calls.push({ op: "insert", args: v });
          return [{ ...(v as object), id: "blob_new" }];
        },
      }),
    }),
  };
  return { db, calls };
}

describe("storage/upload", () => {
  beforeEach(() => {
    putObjectMock.mockReset();
    removeObjectMock.mockReset();
    putObjectMock.mockResolvedValue({ etag: "deadbeef" });
    removeObjectMock.mockResolvedValue(undefined);
  });

  it("hashes the stream, counts bytes, and inserts a new blob row", async () => {
    const { putBlob } = await import("../upload");

    const { db, calls } = makeFakeDb(null);
    const bytes = Buffer.from("hello world", "utf8");
    const stream = Readable.from([bytes]);

    const result = await putBlob(db as never, {
      bucket: "receipts",
      stream,
      contentType: "text/plain",
      filename: "hello.txt",
      uploadedById: "user_1",
    });

    expect(result.deduplicated).toBe(false);
    expect(putObjectMock).toHaveBeenCalledTimes(1);
    expect(removeObjectMock).not.toHaveBeenCalled();

    const inserted = calls.find((c) => c.op === "insert")?.args as {
      bucket: string;
      sizeBytes: number;
      sha256: string;
      contentType: string;
      objectKey: string;
      uploadedById: string | null;
    };
    // sha256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    expect(inserted.sha256).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    );
    expect(inserted.sizeBytes).toBe(bytes.length);
    expect(inserted.bucket).toBe("receipts");
    expect(inserted.contentType).toBe("text/plain");
    expect(inserted.objectKey.endsWith(".txt")).toBe(true);
  });

  it("dedupes against an existing (bucket, sha256) blob and removes the duplicate object", async () => {
    const { putBlob } = await import("../upload");

    const existing = {
      id: "blob_existing",
      bucket: "receipts",
      objectKey: "2026/04/existing.bin",
      contentType: "text/plain",
      sizeBytes: 11,
      sha256: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
      uploadedById: "user_0",
      uploadedAt: new Date(),
    };
    const { db, calls } = makeFakeDb(existing);
    const stream = Readable.from([Buffer.from("hello world", "utf8")]);

    const result = await putBlob(db as never, {
      bucket: "receipts",
      stream,
      contentType: "text/plain",
      filename: "hello.txt",
      uploadedById: "user_1",
    });

    expect(result.deduplicated).toBe(true);
    expect(result.blob.id).toBe("blob_existing");
    expect(removeObjectMock).toHaveBeenCalledTimes(1);
    // No insert when deduplicated — only the SELECT happened.
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("sanitises the extension of the object key", async () => {
    const { putBlob } = await import("../upload");
    const { db, calls } = makeFakeDb(null);
    const stream = Readable.from([Buffer.from("x", "utf8")]);

    await putBlob(db as never, {
      bucket: "receipts",
      stream,
      contentType: "application/octet-stream",
      // Malicious extension with path components — must be rejected
      // and fall back to `.bin`.
      filename: "oops.../../../etc/passwd",
      uploadedById: null,
    });

    const inserted = calls.find((c) => c.op === "insert")?.args as { objectKey: string };
    expect(inserted.objectKey.endsWith(".bin")).toBe(true);
    expect(inserted.objectKey.includes("..")).toBe(false);
  });
});

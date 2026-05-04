import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

// The upload service talks to RustFS via the AWS SDK v3 S3 client and to
// Postgres via a Drizzle `Db`. Unit tests stub both so we can assert
// on the sha256 hashing, the dedupe fast-path, and the insert shape
// without a running storage backend or database.
//
// Two SDK call sites to mock:
//   - `new Upload({ client, params }).done()` from `@aws-sdk/lib-storage`
//     for the streamed multipart write.
//   - `client.send(new DeleteObjectCommand(...))` for the dedupe cleanup.

const sendMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const uploadDoneMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const uploadCtorMock = vi.fn();

vi.mock("../client", () => ({
  getStorageClient: () => ({ send: sendMock }),
}));

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: vi.fn().mockImplementation((args: unknown) => {
    uploadCtorMock(args);
    return { done: uploadDoneMock };
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
    sendMock.mockReset();
    uploadDoneMock.mockReset();
    uploadCtorMock.mockReset();
    sendMock.mockResolvedValue({});
    uploadDoneMock.mockResolvedValue({ ETag: "deadbeef" });
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
    expect(uploadCtorMock).toHaveBeenCalledTimes(1);
    expect(uploadDoneMock).toHaveBeenCalledTimes(1);
    expect(sendMock).not.toHaveBeenCalled();
    // Verify the params plumbed through to `Upload` — a refactor that
    // drops Bucket/ContentType or swaps the body would otherwise pass.
    expect(uploadCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          Bucket: "receipts",
          ContentType: "text/plain",
          Key: expect.stringMatching(/\.txt$/),
        }),
      }),
    );

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
    // One DeleteObjectCommand `send` to clean up the duplicate upload.
    expect(sendMock).toHaveBeenCalledTimes(1);
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

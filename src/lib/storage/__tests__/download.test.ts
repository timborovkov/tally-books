import { Readable } from "node:stream";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Stubs for the AWS SDK v3 surfaces consumed by download.ts:
//   - `client.send(GetObjectCommand)` for `getBlobStream` (returns `{ Body }`).
//   - `getSignedUrl(client, GetObjectCommand, { expiresIn })` for presign.
// Both are mocked at module-resolution time so the tests exercise the
// helper logic (Body type narrowing, presign TTL plumbing) without a
// running RustFS instance.

const sendMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getSignedUrlMock = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock("../client", () => ({
  getStorageClient: () => ({ send: sendMock }),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

describe("storage/download", () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
  });

  describe("getBlobStream", () => {
    it("returns the Body stream when the SDK responds with a Readable", async () => {
      const { getBlobStream } = await import("../download");
      const body = Readable.from([Buffer.from("hello", "utf8")]);
      sendMock.mockResolvedValue({ Body: body });

      const result = await getBlobStream("receipts", "2026/05/abc.jpg");

      expect(result).toBe(body);
      expect(sendMock).toHaveBeenCalledTimes(1);
    });

    it("throws when the SDK responds with no Body", async () => {
      const { getBlobStream } = await import("../download");
      sendMock.mockResolvedValue({});

      await expect(getBlobStream("receipts", "missing.jpg")).rejects.toThrow(
        /non-stream body for receipts\/missing\.jpg/,
      );
    });

    it("throws when the SDK responds with a non-Readable Body", async () => {
      const { getBlobStream } = await import("../download");
      // Hypothetical: Web ReadableStream slipping through in a non-Node
      // runtime. We assert the helper refuses rather than silently
      // returning something callers can't `.pipe()`.
      sendMock.mockResolvedValue({ Body: "not-a-stream" });

      await expect(getBlobStream("receipts", "weird.jpg")).rejects.toThrow(
        /non-stream body for receipts\/weird\.jpg/,
      );
    });
  });

  describe("presignBlobGetUrl", () => {
    it("delegates to getSignedUrl with the default 5-minute TTL", async () => {
      const { presignBlobGetUrl, DEFAULT_PRESIGN_TTL_SECONDS } = await import("../download");
      getSignedUrlMock.mockResolvedValue("https://rustfs.example/receipts/key?sig=...");

      const url = await presignBlobGetUrl("receipts", "2026/05/abc.jpg");

      expect(url).toBe("https://rustfs.example/receipts/key?sig=...");
      expect(DEFAULT_PRESIGN_TTL_SECONDS).toBe(300);
      expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
      const callArgs = getSignedUrlMock.mock.calls[0]!;
      expect(callArgs[2]).toEqual({ expiresIn: DEFAULT_PRESIGN_TTL_SECONDS });
    });

    it("forwards a caller-provided TTL", async () => {
      const { presignBlobGetUrl } = await import("../download");
      getSignedUrlMock.mockResolvedValue("https://rustfs.example/x");

      await presignBlobGetUrl("invoices", "k", 60);

      const callArgs = getSignedUrlMock.mock.calls[0]!;
      expect(callArgs[2]).toEqual({ expiresIn: 60 });
    });
  });
});

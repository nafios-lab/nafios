import { describe, expect, test } from "bun:test";
import { dataUrlToBlob } from "../../src/features/onboarding/lib/avatar.ts";

describe("dataUrlToBlob", () => {
  test("decodes a base64 data URL to a Blob with the right type and length", async () => {
    // "AAAA" base64 decodes to three zero bytes.
    const { blob, contentType } = dataUrlToBlob("data:image/webp;base64,AAAA");

    expect(contentType).toBe("image/webp");
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBe(3);
  });

  test("decodes a jpeg base64 data URL, carrying the MIME straight off the URL", () => {
    const { blob, contentType } = dataUrlToBlob("data:image/jpeg;base64,AAAA");

    expect(contentType).toBe("image/jpeg");
    expect(blob.type).toBe("image/jpeg");
  });

  test("decodes a non-base64 (URL-encoded) data URL via TextEncoder", async () => {
    const { blob, contentType } = dataUrlToBlob("data:text/plain,Hi%20there");

    expect(contentType).toBe("text/plain");
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("Hi there");
  });

  test("throws on a malformed data URL", () => {
    expect(() => dataUrlToBlob("not-a-data-url")).toThrow("malformed avatar data URL");
  });
});

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { fitAvatar } from "../../src/internal/crop-image.ts";

// fitAvatar is browser-only: it uses URL.createObjectURL, `new Image()`, and a
// <canvas> 2D context — none of which happy-dom implements with real pixel work.
// We stand in fakes for those primitives so the crop/scale/encode branches run
// deterministically.

const SRC = new File(["x"], "photo.png", { type: "image/png" });

let RealImage: typeof Image;
let realCreateObjectURL: typeof URL.createObjectURL;
let realRevokeObjectURL: typeof URL.revokeObjectURL;
let realCreateElement: typeof document.createElement;

// Per-test knobs.
let imageShouldError = false;
let naturalWidth = 800;
let naturalHeight = 600;
let getContextReturnsNull = false;
// type -> data URL the fake canvas should yield for that encode.
let encode: (type: string) => string;

let drawImage: ReturnType<typeof mock>;
let revoke: ReturnType<typeof mock>;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = naturalWidth;
  naturalHeight = naturalHeight;
  set src(_v: string) {
    // Resolve asynchronously, like a real image decode.
    queueMicrotask(() => {
      if (imageShouldError) this.onerror?.();
      else this.onload?.();
    });
  }
}

beforeEach(() => {
  imageShouldError = false;
  naturalWidth = 800;
  naturalHeight = 600;
  getContextReturnsNull = false;
  encode = (type) => `data:${type};base64,ENCODED`;
  drawImage = mock(() => {});
  revoke = mock(() => {});

  RealImage = globalThis.Image;
  // FakeImage reads the let-bound dimensions at construction time.
  globalThis.Image = class extends FakeImage {
    override naturalWidth = naturalWidth;
    override naturalHeight = naturalHeight;
  } as unknown as typeof Image;

  realCreateObjectURL = URL.createObjectURL;
  realRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = mock(() => "blob:fake") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;

  const fakeCtx = {
    imageSmoothingQuality: "low",
    drawImage,
  };
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => (getContextReturnsNull ? null : fakeCtx),
    toDataURL: (type: string) => encode(type),
  };

  realCreateElement = document.createElement;
  const boundCreate = realCreateElement.bind(document);
  // Only intercept <canvas>; everything else uses the real factory.
  document.createElement = ((tag: string, ...rest: unknown[]) =>
    tag === "canvas"
      ? (fakeCanvas as unknown as HTMLCanvasElement)
      : // biome-ignore lint/suspicious/noExplicitAny: passthrough to the real factory
        boundCreate(tag as any, ...(rest as []))) as typeof document.createElement;
});

afterEach(() => {
  globalThis.Image = RealImage;
  URL.createObjectURL = realCreateObjectURL;
  URL.revokeObjectURL = realRevokeObjectURL;
  document.createElement = realCreateElement;
});

describe("fitAvatar", () => {
  test("crops, scales, and re-encodes to a webp data URL by default", async () => {
    const result = await fitAvatar(SRC);

    expect(result).toBe("data:image/webp;base64,ENCODED");
    // Default output is a 256px square.
    expect(drawImage).toHaveBeenCalledTimes(1);
    const args = drawImage.mock.calls[0] as unknown[];
    // 800x600 source -> 600px centered square: sx=100, sy=0, edge=600 -> 0,0,256,256.
    expect(args.slice(1)).toEqual([100, 0, 600, 600, 0, 0, 256, 256]);
    // The object URL is always revoked.
    expect(revoke).toHaveBeenCalledWith("blob:fake");
  });

  test("honours custom size, type, and quality", async () => {
    let seenType = "";
    let seenQuality = -1;
    encode = (type) => {
      seenType = type;
      return `data:${type};base64,CUSTOM`;
    };
    // Re-wire toDataURL to also capture quality via a fresh canvas factory.
    const captureCanvas = {
      width: 0,
      height: 0,
      getContext: () => ({ imageSmoothingQuality: "low", drawImage }),
      toDataURL: (type: string, quality: number) => {
        seenType = type;
        seenQuality = quality;
        return `data:${type};base64,CUSTOM`;
      },
    };
    const boundCreate = realCreateElement.bind(document);
    document.createElement = ((tag: string) =>
      tag === "canvas"
        ? (captureCanvas as unknown as HTMLCanvasElement)
        : boundCreate(tag)) as typeof document.createElement;

    const result = await fitAvatar(SRC, { size: 128, type: "image/png", quality: 0.5 });

    expect(result).toBe("data:image/png;base64,CUSTOM");
    expect(seenType).toBe("image/png");
    expect(seenQuality).toBe(0.5);
    // Drawn into a 128px square.
    const args = drawImage.mock.calls[0] as unknown[];
    expect(args.slice(5)).toEqual([0, 0, 128, 128]);
  });

  test("falls back to JPEG when the requested type is unsupported", async () => {
    // Browsers without webp return PNG/"data:," for an unknown type.
    encode = (type) => (type === "image/webp" ? "data:," : `data:${type};base64,JPEGFALLBACK`);

    const result = await fitAvatar(SRC);

    expect(result).toBe("data:image/jpeg;base64,JPEGFALLBACK");
  });

  test("center-crops a portrait source on the Y axis", async () => {
    naturalWidth = 400;
    naturalHeight = 1000;
    globalThis.Image = class extends FakeImage {
      override naturalWidth = 400;
      override naturalHeight = 1000;
    } as unknown as typeof Image;

    await fitAvatar(SRC);

    const args = drawImage.mock.calls[0] as unknown[];
    // edge = 400, sx = 0, sy = (1000-400)/2 = 300.
    expect(args.slice(1, 5)).toEqual([0, 300, 400, 400]);
  });

  test("throws when the 2D context is unavailable, and still revokes the URL", async () => {
    getContextReturnsNull = true;

    await expect(fitAvatar(SRC)).rejects.toThrow("Canvas 2D context unavailable");
    expect(revoke).toHaveBeenCalledWith("blob:fake");
  });

  test("rejects when the image fails to load, and still revokes the URL", async () => {
    imageShouldError = true;

    await expect(fitAvatar(SRC)).rejects.toThrow("Could not load image");
    expect(revoke).toHaveBeenCalledWith("blob:fake");
  });
});

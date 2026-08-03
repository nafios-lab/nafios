/** A data URL decoded into upload-ready bytes plus its MIME type. */
export interface DecodedAvatar {
  blob: Blob;
  contentType: string;
}

/**
 * Decodes an `AvatarUpload` data URL (`data:image/webp;base64,…`) into a `Blob`
 * for the browser storage upload. The server flow decoded to a `Uint8Array`
 * with Node's `Buffer`; the browser equivalent uses `atob` + `Blob`, and the
 * MIME comes straight off the data URL (`fitAvatar` emits webp, or jpeg where
 * webp is unsupported — both accepted by the `avatars` bucket).
 *
 * Only ever called on a freshly-picked `data:` URL — an already-stored object
 * path is passed through by the caller and never reaches here.
 */
export function dataUrlToBlob(dataUrl: string): DecodedAvatar {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("dataUrlToBlob: malformed avatar data URL");

  const [, contentType, base64Flag, payload] = match;
  const bytes = base64Flag
    ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));

  return { blob: new Blob([bytes], { type: contentType }), contentType };
}

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// fitAvatar uses <canvas>, which happy-dom doesn't implement — mock it so the
// component's validation/processing/remove branches are what we exercise.
let fitImpl: (file: File) => Promise<string> = async () => "data:image/webp;base64,MOCK";
mock.module("../../src/internal/crop-image.ts", () => ({
  fitAvatar: (file: File) => fitImpl(file),
}));

const { AvatarUpload } = await import("../../src/components/avatar-upload.tsx");

const PNG = new File(["x"], "photo.png", { type: "image/png" });
const GIF = new File(["x"], "photo.gif", { type: "image/gif" });

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input as HTMLInputElement;
}

beforeEach(() => {
  fitImpl = async () => "data:image/webp;base64,MOCK";
});
afterEach(cleanup);

describe("AvatarUpload", () => {
  test("renders the camera placeholder and default copy when empty", () => {
    render(<AvatarUpload onChange={() => {}} fallback="HY" />);
    // Empty state shows the camera placeholder, not the initials fallback.
    expect(screen.getByText("Photo or avatar")).toBeDefined();
    expect(screen.getByText("PNG or JPG, square works best.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDefined();
    expect(screen.getByText("Upload Photo")).toBeDefined();
  });

  test("shows the Optional chip only when optional", () => {
    const { rerender } = render(<AvatarUpload onChange={() => {}} />);
    expect(screen.queryByText("Optional")).toBeNull();
    rerender(<AvatarUpload onChange={() => {}} optional />);
    expect(screen.getByText("Optional")).toBeDefined();
  });

  test("renders a custom label and helper text", () => {
    render(<AvatarUpload onChange={() => {}} label="Profile picture" helperText="Keep it tidy." />);
    expect(screen.getByText("Profile picture")).toBeDefined();
    expect(screen.getByText("Keep it tidy.")).toBeDefined();
  });

  test("rejects an invalid file type without calling onChange", async () => {
    const onChange = mock(() => {});
    render(<AvatarUpload onChange={onChange} />);

    fireEvent.change(fileInput(), { target: { files: [GIF] } });

    await waitFor(() => {
      expect(screen.getByText("Use a PNG, JPG, or WebP image.")).toBeDefined();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("processes a valid file and emits the data URL", async () => {
    const onChange = mock(() => {});
    render(<AvatarUpload onChange={onChange} />);

    fireEvent.change(fileInput(), { target: { files: [PNG] } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("data:image/webp;base64,MOCK");
    });
  });

  test("surfaces a friendly error when processing throws", async () => {
    fitImpl = async () => {
      throw new Error("decode failed");
    };
    const onChange = mock(() => {});
    render(<AvatarUpload onChange={onChange} />);

    fireEvent.change(fileInput(), { target: { files: [PNG] } });

    await waitFor(() => {
      expect(screen.getByText("Couldn't process that image. Try another.")).toBeDefined();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("ignores an empty file selection", () => {
    const onChange = mock(() => {});
    render(<AvatarUpload onChange={onChange} />);
    fireEvent.change(fileInput(), { target: { files: [] } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("shows Change/Remove affordances when a value is set", () => {
    render(<AvatarUpload value="data:image/webp;base64,EXISTING" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Change photo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Remove" })).toBeDefined();
    expect(screen.getByText("Change photo")).toBeDefined();
  });

  test("clears the value when Remove is clicked", () => {
    const onChange = mock(() => {});
    render(<AvatarUpload value="data:image/webp;base64,EXISTING" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  test("disables the picker and file input when disabled", () => {
    render(<AvatarUpload onChange={() => {}} disabled />);
    expect(screen.getByRole("button", { name: "Upload photo" })).toHaveProperty("disabled", true);
    expect(fileInput().disabled).toBe(true);
  });
});

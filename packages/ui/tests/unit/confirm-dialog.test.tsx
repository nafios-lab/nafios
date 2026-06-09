import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../../src/components/confirm-dialog.tsx";

afterEach(cleanup);

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = mock(() => {});
  const result = render(
    <ConfirmDialog
      trigger={<button type="button">Open</button>}
      title="Confirm action"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onConfirm, ...result };
}

describe("ConfirmDialog", () => {
  test("renders the trigger", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Open" })).toBeDefined();
  });

  test("opens dialog when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderDialog({ description: "Are you sure?" });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("Confirm action")).toBeDefined();
      expect(screen.getByText("Are you sure?")).toBeDefined();
    });
  });

  test("uses default labels when none provided", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    });
  });

  test("uses custom labels when provided", async () => {
    const user = userEvent.setup();
    renderDialog({ confirmLabel: "Delete", cancelLabel: "Nope" });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Nope" })).toBeDefined();
    });
  });

  test("calls onConfirm when confirm button is clicked", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Confirm" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("does not call onConfirm when cancel button is clicked", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("does not render description when omitted", async () => {
    const user = userEvent.setup();
    renderDialog(); // no description prop

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("Confirm action")).toBeDefined();
    });

    expect(screen.queryByRole("paragraph")).toBeNull();
  });

  test("renders description when provided", async () => {
    const user = userEvent.setup();
    renderDialog({ description: "This cannot be undone." });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("This cannot be undone.")).toBeDefined();
    });
  });

  test("applies destructive variant to confirm button", async () => {
    const user = userEvent.setup();
    renderDialog({ variant: "destructive", confirmLabel: "Delete" });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Delete" });
      expect(btn.className).toContain("destructive");
    });
  });

  test("applies default variant when variant is default", async () => {
    const user = userEvent.setup();
    renderDialog({ variant: "default" });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Confirm" });
      expect(btn.className).not.toContain("destructive");
    });
  });
});

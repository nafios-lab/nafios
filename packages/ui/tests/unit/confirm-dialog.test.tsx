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

  test("renders sr-only description when no description provided", async () => {
    const user = userEvent.setup();
    renderDialog(); // no description prop

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("Confirm action")).toBeDefined();
    });

    // sr-only description should be present for accessibility
    const desc = screen.getByText("Confirm action confirmation dialog");
    expect(desc.className).toContain("sr-only");
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
      expect(btn.className).toContain("bg-error");
    });
  });

  test("applies default variant when variant is default", async () => {
    const user = userEvent.setup();
    renderDialog({ variant: "default" });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Confirm" });
      expect(btn.className).not.toContain("bg-error");
    });
  });

  describe("controlled mode", () => {
    test("opens via the open prop without a trigger", async () => {
      render(<ConfirmDialog open title="Controlled" onConfirm={() => {}} />);

      await waitFor(() => {
        expect(screen.getByText("Controlled")).toBeDefined();
      });
      expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    });

    test("stays closed when open is false", () => {
      render(<ConfirmDialog open={false} title="Hidden" onConfirm={() => {}} />);

      expect(screen.queryByText("Hidden")).toBeNull();
    });

    test("calls onOpenChange when confirm is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = mock(() => {});
      const onConfirm = mock(() => {});
      render(
        <ConfirmDialog open onOpenChange={onOpenChange} title="Controlled" onConfirm={onConfirm} />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Confirm" }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test("does not call onReject when confirm is clicked", async () => {
      const user = userEvent.setup();
      const onReject = mock(() => {});
      const onConfirm = mock(() => {});
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Controlled"
          onReject={onReject}
          onConfirm={onConfirm}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      /** The close Radix runs behind the confirm click must NOT read as a decline. */
      expect(onReject).not.toHaveBeenCalled();
    });

    test("calls onReject exactly once when cancel is clicked", async () => {
      const user = userEvent.setup();
      const onReject = mock(() => {});
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Controlled"
          onReject={onReject}
          onConfirm={() => {}}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onReject).toHaveBeenCalledTimes(1);
    });

    test("calls onReject once when dismissed with Escape", async () => {
      const user = userEvent.setup();
      const onReject = mock(() => {});
      const onConfirm = mock(() => {});
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Controlled"
          onReject={onReject}
          onConfirm={onConfirm}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("Controlled")).toBeDefined();
      });

      await user.keyboard("{Escape}");

      expect(onReject).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    test("calls onOpenChange when cancel is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = mock(() => {});
      const onConfirm = mock(() => {});
      render(
        <ConfirmDialog open onOpenChange={onOpenChange} title="Controlled" onConfirm={onConfirm} />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onConfirm).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    test("calls onReject once when dismissed with the X", async () => {
      const user = userEvent.setup();
      const onReject = mock(() => {});
      render(<ConfirmDialog open title="Controlled" onReject={onReject} onConfirm={() => {}} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Close" }));

      // The X is a bare `DialogPrimitive.Close` with no handler of its own, so it
      // reaches `onReject` only through the "closed with no decision" inference.
      expect(onReject).toHaveBeenCalledTimes(1);
    });

    test("hideConfirm leaves cancel as the only outcome, and it still rejects", async () => {
      const user = userEvent.setup();
      const onReject = mock(() => {});
      const onConfirm = mock(() => {});
      render(
        <ConfirmDialog
          open
          hideConfirm
          title="Controlled"
          onReject={onReject}
          onConfirm={onConfirm}
        />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
      });
      expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onReject).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    test("survives every dismissal path with no onReject supplied", async () => {
      // `onReject` is optional, and the inference runs whether or not one is
      // passed — every caller predating it must keep working untouched.
      const user = userEvent.setup();
      const onOpenChange = mock(() => {});
      render(
        <ConfirmDialog open onOpenChange={onOpenChange} title="Controlled" onConfirm={() => {}} />,
      );

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("the reject inference across open cycles", () => {
    // The outcome is recorded in a ref, so it MUST be cleared when the dialog
    // reopens. Left standing, the previous cycle's decision would absorb the next
    // cycle's dismissal — the second Esc would silently report nothing, and a
    // caller that rolls back on reject would leave an optimistic paint stranded.
    // Driven uncontrolled here, because that is the only way the component sees a
    // real open→close→open sequence of its own.

    test("reports the open, then a fresh reject on the SECOND cycle after a confirm", async () => {
      const user = userEvent.setup();
      const onOpenChange = mock((_open: boolean) => {});
      const onReject = mock(() => {});
      const onConfirm = mock(() => {});
      render(
        <ConfirmDialog
          trigger={<button type="button">Open</button>}
          title="Cycles"
          onOpenChange={onOpenChange}
          onReject={onReject}
          onConfirm={onConfirm}
        />,
      );

      // Cycle 1: confirm. The close behind it must not read as a decline.
      await user.click(screen.getByRole("button", { name: "Open" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeDefined());
      await user.click(screen.getByRole("button", { name: "Confirm" }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onReject).not.toHaveBeenCalled();

      // Cycle 2: dismiss. The recorded "confirm" is stale and must not swallow it.
      await user.click(screen.getByRole("button", { name: "Open" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined());
      await user.keyboard("{Escape}");

      await waitFor(() => expect(onReject).toHaveBeenCalledTimes(1));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      // Opens are reported too — the callback is open STATE, both directions.
      expect(onOpenChange.mock.calls.filter(([open]) => open === true)).toHaveLength(2);
    });

    test("a reject in one cycle does not suppress a confirm in the next", async () => {
      const user = userEvent.setup();
      const onReject = mock(() => {});
      const onConfirm = mock(() => {});
      render(
        <ConfirmDialog
          trigger={<button type="button">Open</button>}
          title="Cycles"
          onReject={onReject}
          onConfirm={onConfirm}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Open" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined());
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onReject).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: "Open" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Confirm" })).toBeDefined());
      await user.click(screen.getByRole("button", { name: "Confirm" }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
      // Still exactly one — the second cycle ended in a decision, not a decline.
      expect(onReject).toHaveBeenCalledTimes(1);
    });

    test("cancel reports the decline exactly once, not again behind the close", async () => {
      // Cancel is wrapped in `DialogClose`, so its click fires `onReject` AND then
      // triggers an `onOpenChange(false)` that looks identical to an Esc. The ref
      // is what keeps that echo from double-reporting.
      const user = userEvent.setup();
      const onReject = mock(() => {});
      render(
        <ConfirmDialog
          trigger={<button type="button">Open</button>}
          title="Cycles"
          onReject={onReject}
          onConfirm={() => {}}
        />,
      );

      await user.click(screen.getByRole("button", { name: "Open" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined());
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByText("Cycles")).toBeNull());
      expect(onReject).toHaveBeenCalledTimes(1);
    });
  });
});

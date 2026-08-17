import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorDialog } from "../../src/components/error-dialog.tsx";

afterEach(cleanup);

function renderDialog(overrides: Partial<Parameters<typeof ErrorDialog>[0]> = {}) {
  const result = render(
    <ErrorDialog trigger={<button type="button">Open</button>} {...overrides} />,
  );
  return result;
}

describe("ErrorDialog", () => {
  test("renders the trigger", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Open" })).toBeDefined();
  });

  test("opens dialog when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderDialog({ title: "Boom", description: "Everything is on fire." });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("Boom")).toBeDefined();
      expect(screen.getByText("Everything is on fire.")).toBeDefined();
    });
  });

  test("uses the default title when none provided", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeDefined();
    });
  });

  test("uses default dismiss label when none provided", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
    });
  });

  test("uses custom labels when provided", async () => {
    const user = userEvent.setup();
    renderDialog({ dismissLabel: "Dismiss", retryLabel: "Retry", onRetry: () => {} });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
    });
  });

  test("calls onDismiss when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = mock(() => {});
    renderDialog({ onDismiss });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test("does not render a retry button when onRetry is omitted", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
    });
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  test("calls onRetry when the retry button is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = mock(() => {});
    renderDialog({ onRetry });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    });

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("renders sr-only description when none provided", async () => {
    const user = userEvent.setup();
    renderDialog({ title: "Oops" });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("Oops")).toBeDefined();
    });

    const desc = screen.getByText("Oops error dialog");
    expect(desc.className).toContain("sr-only");
  });

  test("renders the details block when provided", async () => {
    const user = userEvent.setup();
    renderDialog({ details: "HTTP 500 internal_error" });

    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("HTTP 500 internal_error")).toBeDefined();
    });
  });

  describe("controlled mode", () => {
    test("opens via the open prop without a trigger", async () => {
      render(<ErrorDialog open title="Controlled" />);

      await waitFor(() => {
        expect(screen.getByText("Controlled")).toBeDefined();
      });
      expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
    });

    test("stays closed when open is false", () => {
      render(<ErrorDialog open={false} title="Hidden" />);

      expect(screen.queryByText("Hidden")).toBeNull();
    });

    test("calls onOpenChange when dismiss is clicked", async () => {
      const user = userEvent.setup();
      const onOpenChange = mock(() => {});
      render(<ErrorDialog open onOpenChange={onOpenChange} title="Controlled" />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
      });

      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("closing behaviour", () => {
    // Reproduce a real browser's close animation: Radix keeps the content
    // mounted while `data-state` is "closed" only if the exit keyframe differs
    // from the enter one. happy-dom can't compute Tailwind animations, so we
    // reflect the animation name off the element's data-state — enough for
    // Radix's Presence to suspend unmount and expose the closing window.
    function keepMountedWhileClosing() {
      const real = window.getComputedStyle.bind(window);
      return spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
        const style = real(el as Element, pseudo);
        return new Proxy(style, {
          get(target, prop, receiver) {
            if (prop === "animationName") {
              return (el as HTMLElement).getAttribute?.("data-state") === "closed"
                ? "exit"
                : "enter";
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });
    }

    test("keeps the last-open copy visible while closing instead of flashing reset props", () => {
      const spy = keepMountedWhileClosing();
      try {
        const { rerender } = render(
          <ErrorDialog open title="Exceeds hard cap" description="Real error copy." />,
        );
        expect(screen.getByText("Exceeds hard cap")).toBeDefined();

        // Mirror the create-ledger driver: dismissing clears the state that
        // derives both `open` and the copy, so props fall back to placeholder
        // values in the same render that starts the close.
        rerender(
          <ErrorDialog open={false} title="Placeholder title" description="Placeholder copy." />,
        );

        // Content is still mounted (closing animation): it must show the copy it
        // had while open, never the placeholder the parent reset to.
        expect(screen.getByText("Exceeds hard cap")).toBeDefined();
        expect(screen.getByText("Real error copy.")).toBeDefined();
        expect(screen.queryByText("Placeholder title")).toBeNull();
        expect(screen.queryByText("Placeholder copy.")).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });
});

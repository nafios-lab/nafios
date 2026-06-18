import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScreenLoader } from "../../src/components/screen-loader.tsx";
import { useScreenLoader } from "../../src/hooks/use-screen-loader.ts";

afterEach(cleanup);

/** One consumer of the hook with show/hide buttons, labelled so multiple can coexist. */
function Consumer({ id, renderLoader }: { id: string; renderLoader?: () => React.ReactNode }) {
  const { show, hide } = useScreenLoader(renderLoader ? { renderLoader } : undefined);
  return (
    <div>
      <button type="button" onClick={() => show()}>
        show-{id}
      </button>
      <button type="button" onClick={() => hide()}>
        hide-{id}
      </button>
    </div>
  );
}

const overlay = () => screen.queryByRole("status");

describe("ScreenLoader + useScreenLoader", () => {
  test("hidden by default, visible after show()", () => {
    render(
      <>
        <Consumer id="a" />
        <ScreenLoader />
      </>,
    );

    expect(overlay()).toBeNull();

    fireEvent.click(screen.getByText("show-a"));
    expect(overlay()).not.toBeNull();

    fireEvent.click(screen.getByText("hide-a"));
    expect(overlay()).toBeNull();
  });

  test("ref-counts slots: one hide() does not close the overlay while another is active", () => {
    render(
      <>
        <Consumer id="a" />
        <Consumer id="b" />
        <ScreenLoader />
      </>,
    );

    fireEvent.click(screen.getByText("show-a"));
    fireEvent.click(screen.getByText("show-b"));
    expect(overlay()).not.toBeNull();

    // A finishes first — overlay must stay up because B is still active.
    fireEvent.click(screen.getByText("hide-a"));
    expect(overlay()).not.toBeNull();

    fireEvent.click(screen.getByText("hide-b"));
    expect(overlay()).toBeNull();
  });

  test("renders the custom renderLoader over the default loader", () => {
    render(
      <>
        <Consumer id="a" renderLoader={() => <div>custom-loader</div>} />
        <ScreenLoader defaultLoader={() => <div>default-loader</div>} />
      </>,
    );

    fireEvent.click(screen.getByText("show-a"));
    expect(screen.getByText("custom-loader")).toBeDefined();
    expect(screen.queryByText("default-loader")).toBeNull();
  });

  test("falls back to defaultLoader when no override is supplied", () => {
    render(
      <>
        <Consumer id="a" />
        <ScreenLoader defaultLoader={() => <div>default-loader</div>} />
      </>,
    );

    fireEvent.click(screen.getByText("show-a"));
    expect(screen.getByText("default-loader")).toBeDefined();
  });

  test("releases the slot automatically when the consumer unmounts", () => {
    function Harness({ showConsumer }: { showConsumer: boolean }) {
      return (
        <>
          {showConsumer && <Consumer id="a" />}
          <ScreenLoader />
        </>
      );
    }

    const { rerender } = render(<Harness showConsumer={true} />);
    fireEvent.click(screen.getByText("show-a"));
    expect(overlay()).not.toBeNull();

    // Consumer unmounts (e.g. navigation) without calling hide() — overlay must clear.
    rerender(<Harness showConsumer={false} />);
    expect(overlay()).toBeNull();
  });
});

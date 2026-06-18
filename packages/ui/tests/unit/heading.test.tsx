import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Heading, headingVariants } from "../../src/components/typography/heading.tsx";

afterEach(cleanup);

describe("Heading", () => {
  test("renders an <h2> with the level default size when neither prop is set", () => {
    render(<Heading>Title</Heading>);
    const el = screen.getByText("Title");
    expect(el.tagName.toLowerCase()).toBe("h2");
    // h2 default size is xl
    expect(el.getAttribute("class")).toContain("text-xl");
  });

  test("renders the requested heading level via the polymorphic `as` prop", () => {
    const levels: Array<["h1" | "h2" | "h3" | "h4" | "h5" | "h6", string]> = [
      ["h1", "text-2xl"],
      ["h2", "text-xl"],
      ["h3", "text-lg"],
      ["h4", "text-md"],
      ["h5", "text-sm"],
      ["h6", "text-xs"],
    ];
    for (const [as, sizeClass] of levels) {
      const { unmount } = render(<Heading as={as}>{as}</Heading>);
      const el = screen.getByText(as);
      expect(el.tagName.toLowerCase()).toBe(as);
      // size resolves from the level default
      expect(el.getAttribute("class")).toContain(sizeClass);
      unmount();
    }
  });

  test("an explicit size overrides the level default", () => {
    render(
      <Heading as="h1" size="sm">
        Override
      </Heading>,
    );
    const el = screen.getByText("Override");
    expect(el.tagName.toLowerCase()).toBe("h1");
    expect(el.getAttribute("class")).toContain("text-sm");
    expect(el.getAttribute("class")).not.toContain("text-2xl");
  });

  test("merges a custom className and forwards html attributes", () => {
    render(
      <Heading className="custom-cls" data-testid="hd">
        X
      </Heading>,
    );
    const el = screen.getByTestId("hd");
    expect(el.getAttribute("class")).toContain("custom-cls");
    expect(el.getAttribute("class")).toContain("font-display");
  });

  test("headingVariants emits the size class string", () => {
    expect(headingVariants({ size: "2xl" })).toContain("text-2xl");
    expect(headingVariants({ size: "xs" })).toContain("text-xs");
  });
});

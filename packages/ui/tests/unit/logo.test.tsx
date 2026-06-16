import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Logo } from "../../src/components/logo/logo.tsx";

afterEach(cleanup);

function svg(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector("svg");
  if (!el) throw new Error("svg not found");
  return el as unknown as SVGSVGElement;
}

describe("Logo", () => {
  test("renders the mark variant by default", () => {
    const { container } = render(<Logo />);
    const el = svg(container);
    expect(el.getAttribute("viewBox")).toBe("0 0 67 67");
    expect(el.getAttribute("width")).toBe("67");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    // default mark sizing class
    expect(el.getAttribute("class")).toContain("h-8");
  });

  test("renders the explicit mark variant", () => {
    const { container } = render(<Logo variant="mark" />);
    expect(svg(container).getAttribute("viewBox")).toBe("0 0 67 67");
  });

  test("renders the word variant", () => {
    const { container } = render(<Logo variant="word" />);
    const el = svg(container);
    expect(el.getAttribute("viewBox")).toBe("0 0 117 48");
    expect(el.getAttribute("class")).toContain("h-10");
  });

  test("renders the wordmark variant", () => {
    const { container } = render(<Logo variant="wordmark" />);
    const el = svg(container);
    expect(el.getAttribute("viewBox")).toBe("0 0 204 67");
    expect(el.getAttribute("width")).toBe("204");
    expect(el.getAttribute("class")).toContain("h-10");
  });

  test("merges a custom className for the mark", () => {
    const { container } = render(<Logo className="text-red-500" />);
    expect(svg(container).getAttribute("class")).toContain("text-red-500");
  });

  test("merges a custom className for the word", () => {
    const { container } = render(<Logo variant="word" className="text-blue-500" />);
    expect(svg(container).getAttribute("class")).toContain("text-blue-500");
  });

  test("merges a custom className for the wordmark", () => {
    const { container } = render(<Logo variant="wordmark" className="text-green-500" />);
    expect(svg(container).getAttribute("class")).toContain("text-green-500");
  });

  test("forwards arbitrary svg attributes", () => {
    const { container } = render(<Logo data-testid="brand-logo" role="img" />);
    const el = svg(container);
    expect(el.getAttribute("data-testid")).toBe("brand-logo");
    expect(el.getAttribute("role")).toBe("img");
  });
});

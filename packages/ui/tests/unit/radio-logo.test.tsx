import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { RadioLogo } from "../../src/components/logo/radio-logo.tsx";

afterEach(cleanup);

function svg(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector("svg");
  if (!el) throw new Error("svg not found");
  return el as unknown as SVGSVGElement;
}

describe("RadioLogo", () => {
  test("renders an aria-hidden svg with the default sizing class", () => {
    const { container } = render(<RadioLogo />);
    const el = svg(container);
    expect(el.getAttribute("viewBox")).toBe("0 0 87 87");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.getAttribute("class")).toContain("h-8");
  });

  test("merges a custom className", () => {
    const { container } = render(<RadioLogo className="text-red-500" />);
    expect(svg(container).getAttribute("class")).toContain("text-red-500");
  });

  test("forwards arbitrary svg attributes", () => {
    const { container } = render(<RadioLogo data-testid="radio" role="img" />);
    const el = svg(container);
    expect(el.getAttribute("data-testid")).toBe("radio");
    expect(el.getAttribute("role")).toBe("img");
  });
});

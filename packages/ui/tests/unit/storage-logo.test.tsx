import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { StorageLogo } from "../../src/components/logo/storage-logo.tsx";

afterEach(cleanup);

function svg(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector("svg");
  if (!el) throw new Error("svg not found");
  return el as unknown as SVGSVGElement;
}

describe("StorageLogo", () => {
  test("renders an aria-hidden svg with the default sizing class", () => {
    const { container } = render(<StorageLogo />);
    const el = svg(container);
    expect(el.getAttribute("viewBox")).toBe("0 0 87 87");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.getAttribute("class")).toContain("h-8");
  });

  test("merges a custom className", () => {
    const { container } = render(<StorageLogo className="text-red-500" />);
    expect(svg(container).getAttribute("class")).toContain("text-red-500");
  });

  test("forwards arbitrary svg attributes", () => {
    const { container } = render(<StorageLogo data-testid="storage" role="img" />);
    const el = svg(container);
    expect(el.getAttribute("data-testid")).toBe("storage");
    expect(el.getAttribute("role")).toBe("img");
  });
});

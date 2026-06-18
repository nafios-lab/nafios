import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Code, codeVariants } from "../../src/components/typography/code.tsx";

afterEach(cleanup);

describe("Code", () => {
  test("renders inline as a <code> element by default", () => {
    const { container } = render(<Code>npm install</Code>);
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.getByText("npm install").tagName.toLowerCase()).toBe("code");
    // inline (block=false) styling
    expect(code?.getAttribute("class")).toContain("px-1.5");
    // default size is sm
    expect(code?.getAttribute("class")).toContain("text-sm");
  });

  test("renders a <pre> wrapping <code> when block", () => {
    const { container } = render(<Code block>const x = 1;</Code>);
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre?.querySelector("code")).not.toBeNull();
    expect(pre?.getAttribute("class")).toContain("whitespace-pre");
    expect(pre?.textContent).toBe("const x = 1;");
  });

  test("applies the md size variant", () => {
    const { container } = render(<Code size="md">big</Code>);
    expect(container.querySelector("code")?.getAttribute("class")).toContain("text-md");
  });

  test("applies the xs size variant", () => {
    const { container } = render(<Code size="xs">tiny</Code>);
    expect(container.querySelector("code")?.getAttribute("class")).toContain("text-xs");
  });

  test("merges a custom className", () => {
    const { container } = render(<Code className="custom-cls">x</Code>);
    expect(container.querySelector("code")?.getAttribute("class")).toContain("custom-cls");
  });

  test("merges a custom className on the block <pre>", () => {
    const { container } = render(
      <Code block className="custom-block">
        x
      </Code>,
    );
    expect(container.querySelector("pre")?.getAttribute("class")).toContain("custom-block");
  });

  test("forwards arbitrary html attributes", () => {
    const { container } = render(<Code data-testid="snippet">x</Code>);
    expect(container.querySelector("code")?.getAttribute("data-testid")).toBe("snippet");
  });

  test("forwards arbitrary html attributes on the block <pre>", () => {
    const { container } = render(
      <Code block data-testid="snippet-block">
        x
      </Code>,
    );
    expect(container.querySelector("pre")?.getAttribute("data-testid")).toBe("snippet-block");
  });

  test("codeVariants emits the inline and block class strings", () => {
    expect(codeVariants({ block: false })).toContain("px-1.5");
    expect(codeVariants({ block: true })).toContain("whitespace-pre");
    expect(codeVariants({ size: "md" })).toContain("text-md");
  });
});

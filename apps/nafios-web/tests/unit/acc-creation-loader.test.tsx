import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { AccCreationLoader } from "../../src/features/onboarding/components/acc-creation-loader.tsx";

afterEach(cleanup);

describe("AccCreationLoader", () => {
  test("renders the brand boot copy", () => {
    render(<AccCreationLoader />);
    expect(screen.getByText("Creating your account")).toBeDefined();
    expect(screen.getByText("Hang tight — this only takes a moment")).toBeDefined();
  });

  test("mounts the identifiable loader container", () => {
    const { container } = render(<AccCreationLoader />);
    expect(container.querySelector("#acc-creation-loader")).not.toBeNull();
  });
});

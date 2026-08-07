import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ViewSettledLedgersButton } from "../../src/features/finance/components/view-settled-ledgers-button.tsx";

afterEach(cleanup);

describe("ViewSettledLedgersButton", () => {
  test("renders the labelled CTA as a button (presentational, no handler yet)", () => {
    render(<ViewSettledLedgersButton />);
    expect(screen.getByRole("button", { name: /View Settled Ledgers/ })).toBeDefined();
  });
});

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { SignupStepReview } from "../../src/features/auth/components/signup-step-review.tsx";
import {
  type SignupWizardContextValue,
  SignupWizardProvider,
} from "../../src/features/auth/context/signup-wizard.tsx";
import { useSignupWizard } from "../../src/features/auth/hooks/use-signup-wizard.ts";
import type { SignupWizardData } from "../../src/features/auth/schemas/signup-schema.ts";

afterEach(cleanup);

// Seeds wizard step data on mount so SignupStepReview reads populated state.
// Captures the live context so tests can assert navigation side effects (goTo/back).
function Seeder({
  seed,
  onCtx,
}: {
  seed: Partial<SignupWizardData>;
  onCtx?: (ctx: SignupWizardContextValue) => void;
}) {
  const ctx = useSignupWizard();
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot seed on mount
  useEffect(() => {
    for (const key of Object.keys(seed) as (keyof SignupWizardData)[]) {
      ctx.setStepData(key, seed[key] as never);
    }
  }, []);
  onCtx?.(ctx);
  return (
    <>
      <span data-testid="active">{ctx.activeStep}</span>
      <span data-testid="submitting">{String(ctx.isSubmitting)}</span>
    </>
  );
}

function renderReview(seed: Partial<SignupWizardData> = {}) {
  let ctx: SignupWizardContextValue | undefined;
  const utils = render(
    <SignupWizardProvider>
      <Seeder seed={seed} onCtx={(c) => (ctx = c)} />
      <SignupStepReview />
    </SignupWizardProvider>,
  );
  return { ...utils, getCtx: () => ctx as SignupWizardContextValue };
}

const fullSeed: Partial<SignupWizardData> = {
  account: { username: "hanafi", email: "test@nafios.local", mobile: "(+65) 9123 4567" },
  security: { password: "password123", confirmPassword: "password123" },
  family: {
    familyMembers: [
      { name: "Jane Doe", relationship: "spouse", avatar: "data:image/webp;base64,X" },
      { name: "bobby", relationship: "child" },
    ],
  },
};

const active = () => screen.getByTestId("active").textContent;
const submitting = () => screen.getByTestId("submitting").textContent;

describe("SignupStepReview — summary rendering", () => {
  test("shows the collected account email and masked secrets", () => {
    renderReview(fullSeed);
    expect(screen.getByText("Review your details.")).toBeDefined();
    expect(screen.getByText("test@nafios.local")).toBeDefined();
    // Password row is always masked; security PIN row is masked too.
    expect(screen.getByText("••••••••")).toBeDefined();
    expect(screen.getByText("••••••")).toBeDefined();
  });

  test("lists family members with relationship labels and initials fallback", () => {
    renderReview(fullSeed);
    expect(screen.getByText("Jane Doe")).toBeDefined();
    expect(screen.getByText("Spouse")).toBeDefined();
    expect(screen.getByText("bobby")).toBeDefined();
    expect(screen.getByText("Child")).toBeDefined();
    // First-letter, uppercased initials surface via AvatarFallback.
    expect(screen.getByText("J")).toBeDefined();
    expect(screen.getByText("B")).toBeDefined();
  });

  test("falls back to the raw relationship value when unmapped", () => {
    renderReview({
      account: { username: "h", email: "a@b.co", mobile: "(+65) 9000 0000" },
      family: {
        // @ts-expect-error — exercising the `?? member.relationship` fallback.
        familyMembers: [{ name: "Pat", relationship: "guardian" }],
      },
    });
    expect(screen.getByText("guardian")).toBeDefined();
  });

  test("shows the empty-family placeholder when there are no members", () => {
    renderReview({
      account: { username: "h", email: "a@b.co", mobile: "(+65) 9000 0000" },
      family: { familyMembers: [] },
    });
    expect(screen.getByText("No family members added")).toBeDefined();
  });

  test("shows the empty-family placeholder when family data is absent entirely", () => {
    renderReview({});
    expect(screen.getByText("No family members added")).toBeDefined();
    // ReviewRow renders the em-dash placeholder when a value is missing.
    expect(screen.getByText("—")).toBeDefined();
  });
});

describe("SignupStepReview — navigation", () => {
  test("renders one Edit affordance per section (Account, Security, Family)", () => {
    renderReview(fullSeed);
    expect(screen.getAllByRole("button", { name: /Edit/ })).toHaveLength(3);
  });

  test("each section Edit navigates to its corresponding step", () => {
    renderReview(fullSeed);
    // Family Edit → goTo(2).
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/ })[2]);
    expect(active()).toBe("2");
    // Security Edit → goTo(1).
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/ })[1]);
    expect(active()).toBe("1");
    // Account Edit → goTo(0).
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/ })[0]);
    expect(active()).toBe("0");
  });

  test("Back steps the wizard backward", () => {
    renderReview(fullSeed);
    // Jump forward via an Edit (goTo 2), then Back → step 1.
    fireEvent.click(screen.getAllByRole("button", { name: /Edit/ })[2]);
    expect(active()).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(active()).toBe("1");
  });
});

describe("SignupStepReview — submit", () => {
  test("Create account toggles isSubmitting and logs the collected data", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});
    try {
      renderReview(fullSeed);
      expect(submitting()).toBe("false");
      const submitBtn = screen.getByRole("button", { name: /Create account/ });
      await act(async () => {
        fireEvent.click(submitBtn);
        await Promise.resolve();
      });
      // handleSubmit logs the payload then resets isSubmitting in the finally.
      expect(logSpy).toHaveBeenCalledWith("signup submit", expect.anything());
      expect(submitting()).toBe("false");
    } finally {
      logSpy.mockRestore();
    }
  });

  test("the submit button is disabled and relabelled while submitting", () => {
    const { getCtx } = renderReview(fullSeed);
    act(() => {
      getCtx().setIsSubmitting(true);
    });
    expect(submitting()).toBe("true");
    const submitBtn = screen.getByRole("button", { name: /Creating account/ }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(screen.getByText("Creating account...")).toBeDefined();
  });
});

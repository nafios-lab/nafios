import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { SignupStepReview } from "../../src/features/auth/components/signup-step-review.tsx";
import {
  type SignupWizardContextValue,
  SignupWizardProvider,
} from "../../src/features/auth/context/signup-wizard.tsx";
import { useSignupWizard } from "../../src/features/auth/hooks/use-signup-wizard.ts";
import type { SignupWizardData } from "../../src/features/auth/schemas/signup-schema.ts";
import { insertUserProfile, navigate, resetServerFnMocks, signUp } from "../setup.ts";

// The REAL account-creation chain runs here — SignupStepReview → useAccountCreation
// → the real signUpFn / insertUserProfileFn server fns. Those fns build against
// the process-wide stubs in tests/setup.ts (createServerFn + auth-core/database
// spies + the router boundary); we steer the flow through `signUp` and
// `insertUserProfile` rather than mocking the leaf server-fn modules (bun's
// mock.module is global, so mocking them would break the server-fn unit tests).

beforeEach(() => {
  resetServerFnMocks();
  // Default: a registering user (no prior session) whose signup yields a user.
  signUp.mockResolvedValue({
    error: null,
    data: { user: { id: "u1", email: "test@nafios.local" } },
  });
});

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
  return <span data-testid="active">{ctx.activeStep}</span>;
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
  test("signs up, persists profile + family atomically, then navigates home", async () => {
    renderReview(fullSeed);
    fireEvent.click(screen.getByRole("button", { name: /Create account/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/" }));

    // Step 1: credentials → auth signup (the server fn forwards them to auth-core).
    expect(signUp).toHaveBeenCalledWith(
      { __authClient: true },
      { email: "test@nafios.local", password: "password123" },
    );
    // Step 2: profile + family, mapped to the DB input shape (camelCase keys,
    // null defaults, no account-holder avatar source yet).
    expect(insertUserProfile).toHaveBeenCalledWith(
      { from: expect.anything() },
      {
        avatarUrl: null,
        familyMembers: [
          {
            name: "Jane Doe",
            relationship: "spouse",
            avatarUrl: "data:image/webp;base64,X",
            nric: null,
            mobileNo: null,
            dateOfBirth: null,
          },
          {
            name: "bobby",
            relationship: "child",
            avatarUrl: null,
            nric: null,
            mobileNo: null,
            dateOfBirth: null,
          },
        ],
      },
    );
  });

  test("shows an inline, actionable error for a duplicate email and does not profile or navigate", async () => {
    // A duplicate email is the one user-fixable failure: it stays inline so the
    // user can edit the email — it must NOT route to the system error page.
    signUp.mockResolvedValue({
      error: { code: "user_already_exists", message: "User already registered" },
    });

    renderReview(fullSeed);
    fireEvent.click(screen.getByRole("button", { name: /Create account/ }));

    expect(await screen.findByText(/already registered/i)).toBeDefined();
    expect(insertUserProfile).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  test("routes to the generic error page when the profile step fails every retry", async () => {
    // Signup succeeds (auth user created) but the profile persist keeps failing:
    // an unrecoverable system fault → retried, then sent to /error.
    insertUserProfile.mockRejectedValue(new Error("boom"));

    renderReview(fullSeed);
    fireEvent.click(screen.getByRole("button", { name: /Create account/ }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/error" }));
    // Retried up to the max before giving up.
    expect(insertUserProfile).toHaveBeenCalledTimes(3);
    expect(navigate).not.toHaveBeenCalledWith({ to: "/" });
  });

  test("disables and relabels the submit button while the request is in flight", async () => {
    let resolveSignup: (value: { error: unknown; data?: unknown }) => void = () => {};
    signUp.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignup = resolve;
        }),
    );

    renderReview(fullSeed);
    fireEvent.click(screen.getByRole("button", { name: /Create account/ }));

    const inFlight = (await screen.findByRole("button", {
      name: /Creating account/,
    })) as HTMLButtonElement;
    expect(inFlight.disabled).toBe(true);

    // Let the flow settle so no state update escapes act().
    await act(async () => {
      resolveSignup({ error: null, data: { user: { id: "u1", email: "test@nafios.local" } } });
      await Promise.resolve();
    });
  });
});

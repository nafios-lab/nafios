import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  SIGNUP_STEPS,
  SignupWizardProvider,
} from "../../src/features/auth/context/signup-wizard.tsx";
import { useSignupWizard } from "../../src/features/auth/hooks/use-signup-wizard.ts";

afterEach(cleanup);

// A small consumer that surfaces every piece of context state as text and wires
// each action to a button, so fireEvent can drive the provider's transitions.
function Consumer() {
  const { activeStep, data, next, back, goTo, setStepData, isSubmitting, setIsSubmitting } =
    useSignupWizard();
  return (
    <div>
      <span data-testid="active">{activeStep}</span>
      <span data-testid="data">{JSON.stringify(data)}</span>
      <span data-testid="submitting">{String(isSubmitting)}</span>
      <button type="button" onClick={next}>
        next
      </button>
      <button type="button" onClick={back}>
        back
      </button>
      <button type="button" onClick={() => goTo(2)}>
        goto-2
      </button>
      <button
        type="button"
        onClick={() =>
          setStepData("account", { username: "nafi", email: "a@b.co", mobile: "(+65) 9000 0000" })
        }
      >
        set-account
      </button>
      <button type="button" onClick={() => setStepData("family", { familyMembers: [] })}>
        set-family
      </button>
      <button type="button" onClick={() => setIsSubmitting(true)}>
        submit-on
      </button>
      <button type="button" onClick={() => setIsSubmitting(false)}>
        submit-off
      </button>
    </div>
  );
}

function renderConsumer() {
  return render(
    <SignupWizardProvider>
      <Consumer />
    </SignupWizardProvider>,
  );
}

const active = () => screen.getByTestId("active").textContent;
const wizardData = () => JSON.parse(screen.getByTestId("data").textContent ?? "{}");
const submitting = () => screen.getByTestId("submitting").textContent;

describe("SIGNUP_STEPS", () => {
  test("declares the four wizard steps in order", () => {
    expect(SIGNUP_STEPS.map((s) => s.label)).toEqual(["Account", "Security", "Family", "Review"]);
  });
});

describe("SignupWizardProvider", () => {
  test("starts on step 0 with empty data and not submitting", () => {
    renderConsumer();
    expect(active()).toBe("0");
    expect(wizardData()).toEqual({});
    expect(submitting()).toBe("false");
  });

  test("next() advances one step and clamps at the final step (3)", () => {
    renderConsumer();
    fireEvent.click(screen.getByText("next"));
    expect(active()).toBe("1");
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    expect(active()).toBe("3");
    // Already at the last step — next() must not overflow past 3.
    fireEvent.click(screen.getByText("next"));
    expect(active()).toBe("3");
  });

  test("back() goes back one step and clamps at the first step (0)", () => {
    renderConsumer();
    fireEvent.click(screen.getByText("next"));
    fireEvent.click(screen.getByText("next"));
    expect(active()).toBe("2");
    fireEvent.click(screen.getByText("back"));
    expect(active()).toBe("1");
    fireEvent.click(screen.getByText("back"));
    expect(active()).toBe("0");
    // Already at the first step — back() must not go negative.
    fireEvent.click(screen.getByText("back"));
    expect(active()).toBe("0");
  });

  test("goTo() jumps directly to a specific step", () => {
    renderConsumer();
    fireEvent.click(screen.getByText("goto-2"));
    expect(active()).toBe("2");
  });

  test("setStepData() merges step data without dropping other keys", () => {
    renderConsumer();
    fireEvent.click(screen.getByText("set-account"));
    expect(wizardData()).toEqual({
      account: { username: "nafi", email: "a@b.co", mobile: "(+65) 9000 0000" },
    });
    fireEvent.click(screen.getByText("set-family"));
    expect(wizardData()).toEqual({
      account: { username: "nafi", email: "a@b.co", mobile: "(+65) 9000 0000" },
      family: { familyMembers: [] },
    });
  });

  test("setIsSubmitting() toggles the submitting flag", () => {
    renderConsumer();
    fireEvent.click(screen.getByText("submit-on"));
    expect(submitting()).toBe("true");
    fireEvent.click(screen.getByText("submit-off"));
    expect(submitting()).toBe("false");
  });
});

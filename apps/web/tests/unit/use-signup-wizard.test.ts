import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { SignupWizardProvider } from "../../src/features/auth/context/signup-wizard.tsx";
import { useSignupWizard } from "../../src/features/auth/hooks/use-signup-wizard.ts";

afterEach(cleanup);

describe("useSignupWizard", () => {
  test("returns the wizard context when rendered inside the provider", () => {
    const { result } = renderHook(() => useSignupWizard(), {
      wrapper: ({ children }) => createElement(SignupWizardProvider, null, children),
    });

    expect(result.current.activeStep).toBe(0);
    expect(result.current.data).toEqual({});
    expect(result.current.isSubmitting).toBe(false);
    expect(typeof result.current.next).toBe("function");
    expect(typeof result.current.back).toBe("function");
    expect(typeof result.current.goTo).toBe("function");
    expect(typeof result.current.setStepData).toBe("function");
    expect(typeof result.current.setIsSubmitting).toBe("function");
  });

  test("throws a clear error when used outside the provider", () => {
    // React logs the thrown render error to console.error — silence it so the
    // expected throw doesn't pollute the test output.
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useSignupWizard())).toThrow(
        "useSignupWizard must be used within <SignupWizardProvider>",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

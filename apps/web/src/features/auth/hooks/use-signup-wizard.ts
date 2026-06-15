import { useContext } from "react";
import { SignupWizardContext } from "../context/signup-wizard";

export function useSignupWizard() {
  const ctx = useContext(SignupWizardContext);
  if (!ctx) {
    throw new Error("useSignupWizard must be used within <SignupWizardProvider>");
  }
  return ctx;
}

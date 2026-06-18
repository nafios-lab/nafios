import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { AccCreationLoader } from "../../src/features/auth/components/acc-creation-loader.tsx";

afterEach(cleanup);

describe("AccCreationLoader", () => {
  test("renders the loader container with the expected id", () => {
    render(<AccCreationLoader />);
    expect(document.getElementById("acc-creation-loader")).toBeDefined();
  });

  test("renders the primary status text", () => {
    render(<AccCreationLoader />);
    expect(screen.getByText("Creating your account")).toBeDefined();
  });

  test("renders the secondary reassurance text", () => {
    render(<AccCreationLoader />);
    expect(screen.getByText("Hang tight — this only takes a moment")).toBeDefined();
  });

  test("renders the Logo mark", () => {
    render(<AccCreationLoader />);
    const container = document.getElementById("acc-creation-loader");
    // Logo mark renders as an SVG with a specific clip-path id
    const logoSvg = container?.querySelector("svg defs clippath#clip-logo-mark");
    expect(logoSvg).toBeDefined();
  });

  test("marks decorative elements as aria-hidden", () => {
    render(<AccCreationLoader />);
    const container = document.getElementById("acc-creation-loader");

    // The breathing glow div
    const glowDiv = container?.querySelector("div[aria-hidden]");
    expect(glowDiv).toBeDefined();

    // The orbiting SVG
    const orbitSvg = container?.querySelector("svg[aria-hidden]");
    expect(orbitSvg).toBeDefined();
  });

  test("includes the orbit path circle and gradient arc in the SVG", () => {
    render(<AccCreationLoader />);
    const container = document.getElementById("acc-creation-loader");
    const svg = container?.querySelector("svg");

    // Should have gradient definition
    const gradient = svg?.querySelector("linearGradient#acc-loader-arc");
    expect(gradient).toBeDefined();

    // Should have multiple circles (track, arc, node)
    const circles = svg?.querySelectorAll("circle");
    expect(circles?.length).toBe(3);
  });
});

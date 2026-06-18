import { Logo } from "@nafios/ui/components/logo";
import { Text } from "@nafios/ui/components/typography/text";

/**
 * Full-screen loader shown while the account is being created. Designed to read
 * as a NafiOS "boot" moment: the brand mark breathes inside a soft brand glow
 * while a brand→accent gradient arc orbits it like a progress satellite.
 *
 * Rendered centered inside the global {@link ScreenLoader} overlay (see
 * `signup-step-review`). All motion is gated behind `motion-safe:` so users with
 * `prefers-reduced-motion` get a calm, static — but still on-brand — state.
 *
 * The animation tokens (`animate-breathe`, `animate-orbit`) and their keyframes
 * live in `@nafios/ui` globals.css alongside the other brand animations.
 */
export function AccCreationLoader() {
  return (
    <div id="acc-creation-loader" className="flex flex-col items-center gap-7">
      <div className="relative grid size-32 place-items-center">
        {/* Soft brand glow breathing in unison with the mark. */}
        <div
          aria-hidden
          className="absolute size-20 rounded-full bg-brand/40 blur-2xl motion-safe:animate-breathe"
        />

        {/* Orbiting progress ring. Rotating the whole <svg> is safe because the
            track circle is symmetric — only the arc + node read as motion. */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full motion-safe:animate-orbit"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="acc-loader-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" />
              <stop offset="100%" stopColor="var(--color-brand-darker)" />
            </linearGradient>
          </defs>

          {/* Faint full-circle track marking the orbit path. */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2"
            className="opacity-15"
          />

          {/* Sweeping gradient arc (~28% of the circle) with a leading node. */}
          <circle
            cx="50"
            cy="50"
            r="44"
            fill="none"
            stroke="url(#acc-loader-arc)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="78 199"
          />
          <circle cx="94" cy="50" r="3.5" fill="var(--color-brand)" />
        </svg>

        {/* Center brand mark, breathing with a soft brand-tinted glow. */}
        <Logo
          variant="mark"
          className="relative size-10 drop-shadow-[0_0_10px_hsl(var(--brand)/0.45)] motion-safe:animate-breathe"
        />
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <Text weight="medium">Creating your account</Text>
        <Text size="sm" muted>
          Hang tight — this only takes a moment
        </Text>
      </div>
    </div>
  );
}

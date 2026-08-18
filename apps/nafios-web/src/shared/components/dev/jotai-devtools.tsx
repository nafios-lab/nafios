import { lazy, Suspense } from "react";

/**
 * Mount inside a Jotai `<Provider>` to inspect that provider's store in dev.
 *
 * `import.meta.env.DEV` is statically `false` in a production build, so this
 * ternary folds to `() => null`, `createPanel` goes unreferenced, and Rollup
 * drops the `import()` with it — the panel, Mantine, and the stylesheet are
 * *absent* from the prod bundle, not merely unreachable inside it. Under
 * `bun test` DEV is unset, so this is a no-op and tests never pay for Mantine.
 */
export const JotaiDevtools = import.meta.env.DEV ? createPanel() : () => null;

function createPanel() {
  const Panel = lazy(() => import("./jotai-devtools-panel"));
  return function JotaiDevtoolsBoundary() {
    return (
      <Suspense fallback={null}>
        <Panel />
      </Suspense>
    );
  };
}

import { useTheme } from "@nafios/ui/hooks/use-theme";
import { useStore } from "jotai";
import { DevTools } from "jotai-devtools";
import "jotai-devtools/styles.css";

/**
 * The Jotai atom inspector: atom tree, live values, and a snapshot timeline.
 *
 * Loaded ONLY through the lazy wrapper in `./jotai-devtools.tsx` — jotai-devtools
 * pulls in Mantine plus a ~1 MB stylesheet, and a static import would put both
 * in the production bundle. Default-exported for `React.lazy`.
 */
export default function JotaiDevtoolsPanel() {
  // The *nearest* Provider's store, so the panel inspects whichever client-state
  // boundary mounted it. Passing it explicitly is not optional: without `store`
  // DevTools reads the default store, which under ADR-0029 is always empty
  // because every module scopes its atoms to its own Provider.
  const store = useStore();
  const { resolvedTheme } = useTheme();

  return (
    <DevTools
      store={store}
      theme={resolvedTheme}
      position="bottom-left"
      options={{
        // Unbounded history keeps every superseded value alive for the life of
        // the store; 30 steps is enough to walk back a mistake.
        snapshotHistoryLimit: 30,
      }}
    />
  );
}

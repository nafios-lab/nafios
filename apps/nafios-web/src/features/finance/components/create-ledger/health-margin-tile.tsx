import {
  HEALTH_MARGIN_THRESHOLDS,
  type HealthMarginSummary,
  type HealthStatus,
} from "@nafios/finance";
import { cn } from "@nafios/ui/lib/utils";

type HealthMarginTileProps = {
  summary: HealthMarginSummary;
};

/** Per-zone text/marker color. Static class strings so Tailwind keeps them. */
const HEALTH_STATUS_COLOR: Record<HealthStatus, string> = {
  healthy: "text-success-foreground",
  tight: "text-warning-foreground",
  "at-risk": "text-error-foreground",
  over: "text-error-foreground",
  "no-ceiling": "text-muted-foreground",
};

/**
 * The zone bands on a 0→100% headroom axis, widths driven by the domain
 * thresholds (never re-hardcoded): At-risk [0,10) · Tight [10,30) · Healthy
 * [30,100]. The `-subtle` tokens are near-white (~90% L), so the three zones
 * blur together on the thin track — we tint from the saturated `-foreground`
 * tokens at reduced opacity instead, which keeps the zones legible while the
 * full-strength marker (same foreground + background ring) still reads on top.
 */
const HEALTH_ZONE_BANDS = [
  { width: HEALTH_MARGIN_THRESHOLDS.tight, className: "bg-error-foreground/90" },
  {
    width: HEALTH_MARGIN_THRESHOLDS.healthy - HEALTH_MARGIN_THRESHOLDS.tight,
    className: "bg-warning-foreground/90",
  },
  { width: 100 - HEALTH_MARGIN_THRESHOLDS.healthy, className: "bg-success-foreground/90" },
] as const;

/**
 * Health Margin as a segmented zone gauge: the verdict snippet ("Healthy · 62%")
 * over a thin three-band track with a marker at the current headroom %. The
 * marker position (clamped 0–100) shows *which zone* the draft sits in and how
 * far to the next — the amber tile's whole job is "is that good?", so the bands
 * answer it spatially. `over` pins the marker hard-left in the red band; a $0
 * ceiling (`no-ceiling`) drops the marker and greys the track — nothing to judge.
 */
export function HealthMarginTile({ summary }: HealthMarginTileProps) {
  const { percent, status, text } = summary;
  const markerPercent = percent === null ? null : Math.min(100, Math.max(0, percent));

  return (
    <div className="flex flex-col gap-2">
      <span className={cn("font-semibold text-sm", HEALTH_STATUS_COLOR[status])}>{text}</span>
      <div className="relative" aria-hidden>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full">
          {HEALTH_ZONE_BANDS.map((band) => (
            <div
              key={band.className}
              className={cn(band.className, status === "no-ceiling" && "bg-muted")}
              style={{ width: `${band.width}%` }}
            />
          ))}
        </div>
        {markerPercent !== null && (
          <div
            className={cn(
              "-translate-x-1/2 -translate-y-1/2 absolute top-1/2 h-3 w-1 rounded-full bg-current ring-2 ring-background",
              HEALTH_STATUS_COLOR[status],
            )}
            style={{ left: `${markerPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}

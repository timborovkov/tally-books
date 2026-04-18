import { estoniaConfig, estoniaFreeformContextMd } from "./configs/estonia";
import { finlandConfig, finlandFreeformContextMd } from "./configs/finland";
import { usDelawareConfig, usDelawareFreeformContextMd } from "./configs/us-delaware";

import type { JurisdictionConfig } from "./types";

export type { JurisdictionConfig } from "./types";
export { jurisdictionConfigSchema, parseJurisdictionConfig } from "./types";

export interface PrefilledJurisdiction {
  code: string;
  name: string;
  config: JurisdictionConfig;
  freeformContextMd: string;
}

// Order matters for the seed loop and the UI list — Estonia first
// because it's the author's primary jurisdiction; Finland second;
// Delaware third (the non-EU validation case for the abstraction).
export const prefilledJurisdictions: readonly PrefilledJurisdiction[] = [
  {
    code: "EE",
    name: "Estonia",
    config: estoniaConfig,
    freeformContextMd: estoniaFreeformContextMd,
  },
  {
    code: "FI",
    name: "Finland",
    config: finlandConfig,
    freeformContextMd: finlandFreeformContextMd,
  },
  {
    code: "US-DE",
    name: "United States — Delaware",
    config: usDelawareConfig,
    freeformContextMd: usDelawareFreeformContextMd,
  },
];

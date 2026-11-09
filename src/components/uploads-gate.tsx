"use client";

import { UploadCloud } from "lucide-react";
import { createContext, useContext } from "react";

export const UPLOADS_COMING_SOON = "Uploads coming soon";

const UploadsContext = createContext(true);

/** Set once per workspace layout from the server, so every upload spot agrees on whether storage is connected. */
export function UploadsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <UploadsContext.Provider value={enabled}>{children}</UploadsContext.Provider>;
}

export function useUploadsEnabled() {
  return useContext(UploadsContext);
}

/** Stands in for an upload button while file storage is not connected. */
export function UploadsComingSoon({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <button type="button" className={`btn btn-ghost ${size === "sm" ? "btn-sm" : ""}`} disabled title={UPLOADS_COMING_SOON} data-testid="uploads-coming-soon">
      <UploadCloud size={13} /> {UPLOADS_COMING_SOON}
    </button>
  );
}

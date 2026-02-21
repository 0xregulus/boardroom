import type { ReactNode } from "react";

import { EditGlyph, FileTextGlyph, RefreshGlyph } from "./icons";

type GalleryAction = "REPORT" | "EDIT" | "RERUN";

interface GalleryActionOverlayProps {
  onAction: (action: GalleryAction) => void;
}

interface GalleryActionConfig {
  key: GalleryAction;
  label: string;
  icon: ReactNode;
}

const ACTIONS: GalleryActionConfig[] = [
  { key: "REPORT", label: "View Artifact", icon: <FileTextGlyph /> },
  { key: "EDIT", label: "Open Forge", icon: <EditGlyph /> },
  { key: "RERUN", label: "Re-Run Pipeline", icon: <RefreshGlyph /> },
];

export function GalleryActionOverlay({ onAction }: GalleryActionOverlayProps) {
  return (
    <div className="gallery-action-overlay">
      <div className="gallery-action-grid">
        {ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            className="gallery-action-button"
            onClick={(event) => {
              event.stopPropagation();
              onAction(action.key);
            }}
          >
            <span className="gallery-action-icon" aria-hidden="true">
              {action.icon}
            </span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

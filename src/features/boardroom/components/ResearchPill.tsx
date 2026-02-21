import { useState } from "react";

export interface ResearchPillItem {
  id: string;
  source: string;
  snippet: string;
  url?: string;
  sectionTarget: string;
  sectionLabel: string;
}

interface ResearchPillProps {
  item: ResearchPillItem;
  onSnap?: (item: ResearchPillItem) => void;
}

export function ResearchPill({ item, onSnap }: ResearchPillProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <article className={`research-pill${isExpanded ? " expanded" : ""}`}>
      <header className="research-pill-head">
        <span className="research-pill-source">Evidence: {item.source}</span>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer">
            Source
          </a>
        ) : null}
      </header>

      <p className={`research-pill-snippet${isExpanded ? " expanded" : ""}`}>{item.snippet}</p>

      <footer className="research-pill-actions">
        <button type="button" className="research-pill-toggle" onClick={() => setIsExpanded((prev) => !prev)}>
          {isExpanded ? "Show less" : "View detail"}
        </button>
        <button
          type="button"
          className="research-pill-snap"
          onClick={() => onSnap?.(item)}
          disabled={!onSnap || item.snippet.trim().length === 0}
        >
          Snap to {item.sectionLabel}
        </button>
      </footer>
    </article>
  );
}

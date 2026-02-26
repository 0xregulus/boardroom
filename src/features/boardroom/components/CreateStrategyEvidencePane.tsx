import type { SocraticResearchLink } from "../types";

interface EvidencePaneItem {
  sectionKey: string;
  sectionTitle: string;
  prompt: string;
  researchLinks: SocraticResearchLink[];
  clippedLinks: SocraticResearchLink[];
  isResearching: boolean;
}

interface CreateStrategyEvidencePaneProps {
  items: EvidencePaneItem[];
  offsetsBySection: Record<string, number>;
  canvasHeight: number;
  researchError: string | null;
  researchErrorSection: string | null;
  onRequestResearch: (sectionKey: string, prompt: string) => void;
  onClipEvidence: (sectionKey: string, link: SocraticResearchLink) => void;
}

export function CreateStrategyEvidencePane({
  items,
  offsetsBySection,
  canvasHeight,
  researchError,
  researchErrorSection,
  onRequestResearch,
  onClipEvidence,
}: CreateStrategyEvidencePaneProps) {
  return (
    <aside className="create-evidence-pane" aria-label="Evidence slots">
      <div className="create-evidence-canvas" style={{ minHeight: `${Math.max(0, canvasHeight)}px` }}>
        {items.map((item) => (
          <section
            key={item.sectionKey}
            className="create-section-sidecar create-section-sidecar-detached"
            style={{ top: `${Math.max(0, offsetsBySection[item.sectionKey] ?? 0)}px` }}
            aria-label={`${item.sectionTitle} evidence slot`}
          >
            <h4>Evidence Slot</h4>
            <p>{item.prompt}</p>
            <button type="button" onClick={() => onRequestResearch(item.sectionKey, item.prompt)} disabled={item.isResearching}>
              {item.isResearching ? "Verifying..." : "Click to verify with live market data"}
            </button>
            {researchError && researchErrorSection === item.sectionKey ? (
              <p className="create-section-evidence-error" role="status">
                {researchError}
              </p>
            ) : null}
            {item.researchLinks.length > 0 ? (
              <ul className="create-section-evidence-list">
                {item.researchLinks.slice(0, 3).map((link) => (
                  <li key={link.url}>
                    <div className="create-section-evidence-row">
                      <a href={link.url} target="_blank" rel="noreferrer">
                        {link.title}
                      </a>
                      <button
                        type="button"
                        className="create-evidence-clip-button"
                        onClick={() => onClipEvidence(item.sectionKey, link)}
                        disabled={item.clippedLinks.some((entry) => entry.url === link.url)}
                      >
                        {item.clippedLinks.some((entry) => entry.url === link.url) ? "Clipped" : "Clip"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {item.clippedLinks.length > 0 ? (
              <div className="create-section-clipped-pills" aria-label="Clipped evidence citations">
                {item.clippedLinks.slice(0, 4).map((link, clippedIndex) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="create-section-clipped-pill">
                    ref_{clippedIndex + 1}: {link.title}
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </aside>
  );
}

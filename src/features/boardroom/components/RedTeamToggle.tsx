interface RedTeamToggleProps {
  isRedTeamMode: boolean;
  disabled?: boolean;
  onToggle: (enabled: boolean) => void;
}

export function RedTeamToggle({ isRedTeamMode, disabled = false, onToggle }: RedTeamToggleProps) {
  return (
    <section className={`red-team-toggle-card${isRedTeamMode ? " adversarial" : ""}`} aria-label="Red team mode">
      <div className="red-team-toggle-label">
        <span className="red-team-toggle-icon" aria-hidden="true">
          {isRedTeamMode ? "!" : "✓"}
        </span>
        <span>{isRedTeamMode ? "Adversarial Review Active" : "Collaborative Review"}</span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isRedTeamMode}
        aria-label="Toggle red team mode"
        className={`red-team-toggle-switch${isRedTeamMode ? " on" : ""}`}
        onClick={() => onToggle(!isRedTeamMode)}
        disabled={disabled}
      >
        <span className="red-team-toggle-knob" />
      </button>
    </section>
  );
}

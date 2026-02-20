import { useEffect, useMemo, useState } from "react";
import {
    AgentConfig,
    LLMProvider,
    PROVIDER_MODEL_OPTIONS,
} from "../../../config/agent_config";
import { type ResearchProvider, type ResearchProviderOption } from "../../../research/providers";
import { AgentConfigSyncStatus } from "../types";
import {
    agentModelMeta,
    clampTokenInput,
    resolveAgentChessPiece
} from "../utils";
import {
    ChessPieceGlyph,
    ChevronGlyph,
    PlusGlyph,
    SettingsGlyph,
    TrashGlyph
} from "./icons";
import { CORE_AGENT_IDS, PROVIDER_OPTIONS } from "../constants";

interface AgentConfigModalProps {
    agentConfigs: AgentConfig[];
    selectedAgentId: string | null;
    researchProvider: ResearchProvider;
    researchOptions: ResearchProviderOption[];
    onSelectAgent: (id: string) => void;
    onResearchProviderChange: (provider: ResearchProvider) => void;
    onAddAgent: () => void;
    onRemoveAgent: (id: string) => void;
    onUpdateAgentField: <K extends keyof AgentConfig>(id: string, field: K, value: AgentConfig[K]) => void;
    onProviderChange: (id: string, provider: LLMProvider) => void;
    syncStatus: AgentConfigSyncStatus;
    syncMessage: string;
    isDirty: boolean;
    onSave: () => void;
    onReset: () => void;
}

export function AgentConfigModal({
    agentConfigs,
    selectedAgentId,
    researchProvider,
    researchOptions,
    onSelectAgent,
    onResearchProviderChange,
    onAddAgent,
    onRemoveAgent,
    onUpdateAgentField,
    onProviderChange,
    syncStatus,
    syncMessage,
    isDirty,
    onSave,
    onReset,
}: AgentConfigModalProps) {
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [isResearchOpen, setIsResearchOpen] = useState(false);

    const selectedAgentConfig = useMemo(
        () => agentConfigs.find((config) => config.id === selectedAgentId) ?? agentConfigs[0] ?? null,
        [agentConfigs, selectedAgentId],
    );

    const syncTone = useMemo(() => {
        if (syncStatus === "error") {
            return "error";
        }
        if (syncStatus === "dirty") {
            return "dirty";
        }
        if (syncStatus === "saving" || syncStatus === "loading") {
            return "saving";
        }
        return "saved";
    }, [syncStatus]);
    const showSyncState = useMemo(
        () => syncStatus === "loading" || syncStatus === "saving" || syncStatus === "dirty" || syncStatus === "error",
        [syncStatus],
    );
    const showActionButtons = useMemo(() => syncStatus === "dirty" || syncStatus === "error", [syncStatus]);
    const showFooter = showSyncState || showActionButtons;

    useEffect(() => {
        setIsAdvancedOpen(false);
    }, [selectedAgentConfig?.id]);

    return (
        <section className="agent-config-stage" aria-label="Executive agent configuration">
            <aside className="agent-config-sidebar">
                <div className="agent-config-sidebar-head">
                    <div className="agent-config-sidebar-head-copy">
                        <h2>Agent Configuration</h2>
                        <p>Configure LLM personas and parameters</p>
                    </div>
                    <button
                        type="button"
                        className="agent-config-add"
                        onClick={onAddAgent}
                        disabled={syncStatus === "saving" || syncStatus === "loading"}
                        aria-label="Add reviewer"
                    >
                        <PlusGlyph />
                    </button>
                </div>

                <section
                    className={`agent-config-research-card agent-config-research-global${isResearchOpen ? " open" : ""}`}
                    aria-label="Global research tool configuration"
                >
                    <button
                        type="button"
                        className="agent-config-research-toggle"
                        onClick={() => setIsResearchOpen((current) => !current)}
                        aria-expanded={isResearchOpen}
                    >
                        <span className="agent-config-research-head">
                            <h3>Research Tool</h3>
                            <p>Select the grounding provider used when external research is enabled.</p>
                        </span>
                        <span className="agent-config-research-chevron" aria-hidden="true">
                            <ChevronGlyph expanded={isResearchOpen} />
                        </span>
                    </button>

                    {isResearchOpen ? (
                        <div className="agent-config-research-options" role="radiogroup" aria-label="Research provider">
                            {researchOptions.map((option) => {
                                const disabled = !option.configured;
                                return (
                                    <label
                                        key={option.provider}
                                        className={`agent-config-research-option${disabled ? " disabled" : ""}`}
                                        htmlFor={`research-provider-${option.provider.toLowerCase()}`}
                                    >
                                        <input
                                            id={`research-provider-${option.provider.toLowerCase()}`}
                                            name="research-provider"
                                            type="radio"
                                            value={option.provider}
                                            checked={researchProvider === option.provider}
                                            onChange={() => onResearchProviderChange(option.provider)}
                                            disabled={disabled}
                                        />
                                        <div className="agent-config-research-option-copy">
                                            <strong>{option.provider}</strong>
                                            <span>{option.configured ? `Configured` : `Missing ${option.apiKeyEnv}`}</span>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    ) : null}
                </section>

                <div className="agent-config-sidebar-list" role="tablist" aria-label="Agent profile selector">
                    {agentConfigs.map((config) => {
                        const active = selectedAgentConfig?.id === config.id;
                        const canDelete = !CORE_AGENT_IDS.has(config.id);
                        const cardPiece = resolveAgentChessPiece(config.id, config.role);
                        const cardMeta = agentModelMeta(config.provider, config.model);

                        return (
                            <div
                                key={config.id}
                                role="tab"
                                aria-selected={active}
                                tabIndex={0}
                                className={`agent-config-item ${active ? "active" : ""}`}
                                onClick={() => onSelectAgent(config.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onSelectAgent(config.id);
                                    }
                                }}
                            >
                                <div className={`agent-config-item-avatar ${active ? "active" : ""}`} aria-hidden="true">
                                    <ChessPieceGlyph piece={cardPiece} />
                                </div>
                                <div className="agent-config-item-copy">
                                    <h3>{config.role}</h3>
                                    <p>{cardMeta}</p>
                                </div>
                                {canDelete ? (
                                    <button
                                        type="button"
                                        className="agent-config-item-delete"
                                        aria-label={`Delete ${config.role} agent`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveAgent(config.id);
                                        }}
                                    >
                                        <TrashGlyph />
                                    </button>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </aside>

            {selectedAgentConfig ? (
                <article key={selectedAgentConfig.id} className="agent-config-editor">
                    <header className="agent-config-editor-head">
                        <div className="agent-config-editor-avatar" aria-hidden="true">
                            <ChessPieceGlyph piece={resolveAgentChessPiece(selectedAgentConfig.id, selectedAgentConfig.role)} />
                        </div>
                        <div className="agent-config-editor-copy">
                            <h2>{selectedAgentConfig.role} Persona</h2>
                            <p>Define the core logic and constraints for the {selectedAgentConfig.role} agent.</p>
                        </div>
                    </header>

                    <section className="agent-config-primary-card" aria-label="Agent persona configuration">
                        <div className="agent-config-primary-grid">
                            <label className="agent-config-group" htmlFor="agent-config-role">
                                <span className="agent-config-group-label">Agent Role / Title</span>
                                <input
                                    id="agent-config-role"
                                    type="text"
                                    className="agent-config-input"
                                    value={selectedAgentConfig.role}
                                    onChange={(event) => onUpdateAgentField(selectedAgentConfig.id, "role", event.target.value)}
                                    placeholder="Reviewer role label"
                                />
                            </label>

                            <label className="agent-config-group" htmlFor="agent-config-name">
                                <span className="agent-config-group-label">Full Name / Identifier</span>
                                <input
                                    id="agent-config-name"
                                    type="text"
                                    className="agent-config-input"
                                    value={selectedAgentConfig.name}
                                    onChange={(event) => onUpdateAgentField(selectedAgentConfig.id, "name", event.target.value)}
                                    placeholder="Agent display name"
                                />
                            </label>
                        </div>

                        <label className="agent-config-group" htmlFor="agent-config-system-message">
                            <span className="agent-config-group-label">System Message (Persona Definition)</span>
                            <textarea
                                id="agent-config-system-message"
                                className="agent-config-input agent-config-textarea"
                                value={selectedAgentConfig.systemMessage}
                                rows={5}
                                onChange={(event) => onUpdateAgentField(selectedAgentConfig.id, "systemMessage", event.target.value)}
                            />
                        </label>

                        <label className="agent-config-group" htmlFor="agent-config-user-message">
                            <span className="agent-config-group-label">Prompt Template (User Message)</span>
                            <textarea
                                id="agent-config-user-message"
                                className="agent-config-input agent-config-textarea"
                                value={selectedAgentConfig.userMessage}
                                rows={4}
                                onChange={(event) => onUpdateAgentField(selectedAgentConfig.id, "userMessage", event.target.value)}
                            />
                        </label>
                    </section>

                    <section className={`agent-config-advanced-card ${isAdvancedOpen ? "open" : ""}`} aria-label="Advanced model settings">
                        <button
                            type="button"
                            className="agent-config-advanced-toggle"
                            onClick={() => setIsAdvancedOpen((current) => !current)}
                            aria-expanded={isAdvancedOpen}
                        >
                            <span className="agent-config-advanced-title">
                                <SettingsGlyph />
                                Advanced Settings
                            </span>
                            <span className="agent-config-advanced-chevron" aria-hidden="true">
                                <ChevronGlyph expanded={isAdvancedOpen} />
                            </span>
                        </button>

                        {isAdvancedOpen ? (
                            <div className="agent-config-advanced-body">
                                <label className="agent-config-group" htmlFor="agent-config-provider">
                                    <span className="agent-config-group-label">LLM Provider</span>
                                    <select
                                        id="agent-config-provider"
                                        className="agent-config-input"
                                        value={selectedAgentConfig.provider}
                                        onChange={(event) => onProviderChange(selectedAgentConfig.id, event.target.value as LLMProvider)}
                                    >
                                        {PROVIDER_OPTIONS.map((provider) => (
                                            <option key={provider} value={provider}>
                                                {provider}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="agent-config-group">
                                    <div className="agent-config-group-head">
                                        <span className="agent-config-group-label">Temperature</span>
                                        <span className="agent-config-temperature-value">{selectedAgentConfig.temperature.toFixed(1)}</span>
                                    </div>
                                    <div className="agent-config-temperature-control">
                                        <input
                                            id="agent-config-temperature"
                                            type="range"
                                            min={0}
                                            max={1}
                                            step={0.01}
                                            value={selectedAgentConfig.temperature}
                                            style={{ ["--agent-temp" as string]: `${Math.round(selectedAgentConfig.temperature * 100)}%` }}
                                            onChange={(event) => {
                                                const nextValue = Number(event.target.value);
                                                onUpdateAgentField(selectedAgentConfig.id, "temperature", nextValue);
                                            }}
                                        />
                                        <div className="agent-config-slider-meta">
                                            <span>Precise</span>
                                            <span>Creative</span>
                                        </div>
                                    </div>
                                </div>

                                <label className="agent-config-group" htmlFor="agent-config-model">
                                    <span className="agent-config-group-label">Model Selection</span>
                                    <select
                                        id="agent-config-model"
                                        className="agent-config-input"
                                        value={selectedAgentConfig.model}
                                        onChange={(event) => onUpdateAgentField(selectedAgentConfig.id, "model", event.target.value)}
                                    >
                                        {PROVIDER_MODEL_OPTIONS[selectedAgentConfig.provider].map((model) => (
                                            <option key={model} value={model}>
                                                {model}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="agent-config-group" htmlFor="agent-config-max-tokens">
                                    <span className="agent-config-group-label">Max Tokens</span>
                                    <input
                                        id="agent-config-max-tokens"
                                        type="number"
                                        min={256}
                                        max={8000}
                                        className="agent-config-input"
                                        value={selectedAgentConfig.maxTokens}
                                        onChange={(event) => {
                                            const nextValue = clampTokenInput(Number(event.target.value));
                                            onUpdateAgentField(selectedAgentConfig.id, "maxTokens", nextValue);
                                        }}
                                    />
                                </label>
                            </div>
                        ) : null}
                    </section>

                    {showFooter ? (
                        <section className="agent-config-editor-footer" aria-label="Agent config status and actions">
                            {showSyncState ? (
                                <p className={`agent-config-sync-state tone-${syncTone}`}>{syncMessage}</p>
                            ) : null}
                            {showActionButtons ? (
                                <div className="agent-config-sidebar-actions">
                                    <button
                                        type="button"
                                        className="agent-config-save"
                                        onClick={() => void onSave()}
                                        disabled={!isDirty || syncStatus === "saving" || syncStatus === "loading"}
                                    >
                                        {syncStatus === "saving" ? "Saving..." : "Save changes"}
                                    </button>

                                    <button
                                        type="button"
                                        className="agent-config-reset"
                                        onClick={onReset}
                                        disabled={syncStatus === "saving" || syncStatus === "loading"}
                                    >
                                        Reset defaults
                                    </button>
                                </div>
                            ) : null}
                        </section>
                    ) : null}
                </article>
            ) : null}
        </section>
    );
}

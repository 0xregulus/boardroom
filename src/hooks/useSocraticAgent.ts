import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CreateStrategyDraft,
  DraftBoardAction,
  SocraticLiveFeedItem,
  SocraticResearchLink,
  SocraticSession,
  StrategicDecisionDocument,
} from "../features/boardroom/types";
import {
  buildSocraticLiveFeed,
  buildSocraticSession,
  buildStrategicDecisionDocument,
  socraticPersonaForSection,
} from "../features/boardroom/utils";

const OBSERVER_DEBOUNCE_MS = 2000;

interface UseSocraticAgentParams {
  documentContent: CreateStrategyDraft;
  isReadOnly: boolean;
}

interface SocraticObservePayload {
  session?: SocraticSession;
  strategicDocument?: StrategicDecisionDocument;
  error?: string;
}

export interface UseSocraticAgentResult {
  session: SocraticSession;
  strategicDocument: StrategicDecisionDocument;
  liveFeed: SocraticLiveFeedItem[];
  isObserving: boolean;
  activeDraftBoardAction: DraftBoardAction | null;
  activeSectionKey: string | null;
  highlightedSectionKey: string | null;
  activePersona: { name: string; stance: string };
  researchLinksBySection: Record<string, SocraticResearchLink[]>;
  clippedEvidenceBySection: Record<string, SocraticResearchLink[]>;
  researchLoadingSection: string | null;
  researchError: string | null;
  researchErrorSection: string | null;
  setActiveSectionKey: (sectionKey: string | null) => void;
  focusSection: (sectionKey: string) => void;
  requestResearch: (sectionKey: string, overridePrompt?: string) => Promise<void>;
  clipResearchEvidence: (sectionKey: string, link: SocraticResearchLink) => void;
  runDraftBoardAction: (action: DraftBoardAction) => Promise<void>;
}

export function useSocraticAgent({ documentContent, isReadOnly }: UseSocraticAgentParams): UseSocraticAgentResult {
  const [activeSectionKey, setActiveSectionKey] = useState<string | null>("executiveSummary");
  const [researchLinksBySection, setResearchLinksBySection] = useState<Record<string, SocraticResearchLink[]>>({});
  const [clippedEvidenceBySection, setClippedEvidenceBySection] = useState<Record<string, SocraticResearchLink[]>>({});
  const [researchLoadingSection, setResearchLoadingSection] = useState<string | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchErrorSection, setResearchErrorSection] = useState<string | null>(null);
  const [session, setSession] = useState<SocraticSession>(() => buildSocraticSession(documentContent, {}));
  const [strategicDocument, setStrategicDocument] = useState<StrategicDecisionDocument>(() =>
    buildStrategicDecisionDocument(documentContent, buildSocraticSession(documentContent, {}), {
      clippedEvidenceBySection: {},
    }),
  );
  const [isObserving, setIsObserving] = useState(false);
  const [activeDraftBoardAction, setActiveDraftBoardAction] = useState<DraftBoardAction | null>(null);
  const [debouncedDocument, setDebouncedDocument] = useState<CreateStrategyDraft>(documentContent);
  const [highlightedSectionKey, setHighlightedSectionKey] = useState<string | null>(null);
  const highlightResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedDocument(documentContent);
    }, OBSERVER_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [documentContent]);

  useEffect(() => {
    if (isReadOnly) {
      const nextSession = buildSocraticSession(debouncedDocument, researchLinksBySection);
      setSession(nextSession);
      setStrategicDocument(
        buildStrategicDecisionDocument(debouncedDocument, nextSession, {
          clippedEvidenceBySection,
          action: activeDraftBoardAction,
        }),
      );
      setIsObserving(false);
      return;
    }

    let cancelled = false;
    async function observeDocument(): Promise<void> {
      setIsObserving(true);
      try {
        const response = await fetch("/api/socratic/observe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draft: debouncedDocument,
            researchLinksBySection,
            clippedEvidenceBySection,
            action: activeDraftBoardAction,
          }),
        });
        const payload = (await response.json()) as SocraticObservePayload;
        if (!response.ok || !payload.session) {
          throw new Error(payload.error || "Observer request failed.");
        }
        if (!cancelled) {
          setSession(payload.session);
          if (payload.strategicDocument) {
            setStrategicDocument(payload.strategicDocument);
          } else {
            setStrategicDocument(
              buildStrategicDecisionDocument(debouncedDocument, payload.session, {
                clippedEvidenceBySection,
                action: activeDraftBoardAction,
              }),
            );
          }
        }
      } catch {
        if (!cancelled) {
          const fallbackSession = buildSocraticSession(debouncedDocument, researchLinksBySection);
          setSession(fallbackSession);
          setStrategicDocument(
            buildStrategicDecisionDocument(debouncedDocument, fallbackSession, {
              clippedEvidenceBySection,
              action: activeDraftBoardAction,
            }),
          );
        }
      } finally {
        if (!cancelled) {
          setIsObserving(false);
        }
      }
    }

    observeDocument().catch(() => {
      if (!cancelled) {
        setIsObserving(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeDraftBoardAction, clippedEvidenceBySection, debouncedDocument, isReadOnly, researchLinksBySection]);

  const activePersona = useMemo(() => {
    if (!activeSectionKey) {
      return {
        name: "Socratic Observer",
        stance: "Expose logic gaps before the board sees this document.",
      };
    }
    return session.personaBySection[activeSectionKey] ?? socraticPersonaForSection(activeSectionKey);
  }, [activeSectionKey, session.personaBySection]);

  const liveFeed = useMemo(
    () => buildSocraticLiveFeed(strategicDocument, session),
    [session, strategicDocument],
  );

  const focusSection = useCallback((sectionKey: string) => {
    setActiveSectionKey(sectionKey);
    setHighlightedSectionKey(sectionKey);
    if (typeof window !== "undefined") {
      if (highlightResetTimerRef.current !== null) {
        window.clearTimeout(highlightResetTimerRef.current);
      }
      highlightResetTimerRef.current = window.setTimeout(() => {
        setHighlightedSectionKey((current) => (current === sectionKey ? null : current));
      }, 2200);
    }
    if (typeof window === "undefined") {
      return;
    }
    const target = document.getElementById(`section-${sectionKey}`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (target instanceof HTMLElement) {
      const focusable = target.querySelector<HTMLElement>("textarea, input, select, button");
      if (focusable) {
        focusable.focus();
      } else {
        target.focus();
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (highlightResetTimerRef.current !== null && typeof window !== "undefined") {
        window.clearTimeout(highlightResetTimerRef.current);
      }
    };
  }, []);

  const requestResearch = useCallback(async (sectionKey: string, overridePrompt?: string): Promise<void> => {
    if (isReadOnly) {
      return;
    }

    const sectionContent = documentContent.sections[sectionKey] ?? "";
    const prompt = overridePrompt ?? session.checklist.find((item) => item.sectionKey === sectionKey)?.prompt ?? "";

    setResearchError(null);
    setResearchErrorSection(null);
    setResearchLoadingSection(sectionKey);
    try {
      const response = await fetch("/api/research/socratic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decisionName: documentContent.name,
          sectionKey,
          sectionContent,
          prompt,
        }),
      });
      const payload = (await response.json()) as { links?: SocraticResearchLink[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to fetch research.");
      }
      const nextLinks = Array.isArray(payload.links) ? payload.links : [];
      setResearchLinksBySection((prev) => ({
        ...prev,
        [sectionKey]: nextLinks,
      }));
      if (nextLinks.length === 0) {
        setResearchErrorSection(sectionKey);
        setResearchError("No live citations were returned. Add more context or configure a research provider.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to fetch research.";
      setResearchErrorSection(sectionKey);
      setResearchError(message);
    } finally {
      setResearchLoadingSection(null);
    }
  }, [documentContent.name, documentContent.sections, isReadOnly, session.checklist]);

  const clipResearchEvidence = useCallback((sectionKey: string, link: SocraticResearchLink) => {
    setClippedEvidenceBySection((prev) => {
      const current = prev[sectionKey] ?? [];
      if (current.some((entry) => entry.url === link.url)) {
        return prev;
      }
      return {
        ...prev,
        [sectionKey]: [...current, link],
      };
    });
  }, []);

  const runDraftBoardAction = useCallback(async (action: DraftBoardAction): Promise<void> => {
    setActiveDraftBoardAction(action);
    setIsObserving(true);
    try {
      const response = await fetch("/api/socratic/observe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          draft: documentContent,
          researchLinksBySection,
          clippedEvidenceBySection,
          action,
        }),
      });
      const payload = (await response.json()) as SocraticObservePayload;
      if (!response.ok || !payload.session) {
        throw new Error(payload.error || "Draft board analysis failed.");
      }
      setSession(payload.session);
      setStrategicDocument(
        payload.strategicDocument ??
          buildStrategicDecisionDocument(documentContent, payload.session, {
            clippedEvidenceBySection,
            action,
          }),
      );
    } catch {
      const fallbackSession = buildSocraticSession(documentContent, researchLinksBySection);
      setSession(fallbackSession);
      setStrategicDocument(
        buildStrategicDecisionDocument(documentContent, fallbackSession, {
          clippedEvidenceBySection,
          action,
        }),
      );
    } finally {
      setIsObserving(false);
    }
  }, [clippedEvidenceBySection, documentContent, researchLinksBySection]);

  return {
    session,
    strategicDocument,
    liveFeed,
    isObserving,
    activeDraftBoardAction,
    activeSectionKey,
    highlightedSectionKey,
    activePersona,
    researchLinksBySection,
    clippedEvidenceBySection,
    researchLoadingSection,
    researchError,
    researchErrorSection,
    setActiveSectionKey,
    focusSection,
    requestResearch,
    clipResearchEvidence,
    runDraftBoardAction,
  };
}

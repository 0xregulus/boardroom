import { useCallback, useState } from "react";

import type { ActiveTab, AppStage, WorkspaceView } from "../types";

interface UseWorkspaceNavigationResult {
  appStage: AppStage;
  workspaceView: WorkspaceView;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  openCreateStage: () => void;
  openDashboardList: () => void;
  openAgentConfig: () => void;
  openWorkspaceEditor: () => void;
  openWorkspacePreview: () => void;
  openHome: () => void;
}

export function useWorkspaceNavigation(): UseWorkspaceNavigationResult {
  const [appStage, setAppStage] = useState<AppStage>("list");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("dashboard");
  const [activeTab, setActiveTab] = useState<ActiveTab>("editor");

  const openCreateStage = useCallback(() => {
    setAppStage("create");
  }, []);

  const openDashboardList = useCallback(() => {
    setAppStage("list");
    setWorkspaceView("dashboard");
  }, []);

  const openAgentConfig = useCallback(() => {
    setAppStage("workspace");
    setWorkspaceView("agent-config");
    setActiveTab("editor");
  }, []);

  const openWorkspaceEditor = useCallback(() => {
    setAppStage("workspace");
    setWorkspaceView("dashboard");
    setActiveTab("editor");
  }, []);

  const openWorkspacePreview = useCallback(() => {
    setAppStage("workspace");
    setWorkspaceView("dashboard");
    setActiveTab("preview");
  }, []);

  const openHome = useCallback(() => {
    setAppStage("list");
    setWorkspaceView("dashboard");
    setActiveTab("editor");
  }, []);

  return {
    appStage,
    workspaceView,
    activeTab,
    setActiveTab,
    openCreateStage,
    openDashboardList,
    openAgentConfig,
    openWorkspaceEditor,
    openWorkspacePreview,
    openHome,
  };
}

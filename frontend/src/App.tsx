import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Files,
  FolderGit2,
  Loader2,
  MessageSquare,
  Moon,
  Network,
  Plus,
  Search,
  Sun,
  X,
} from "lucide-react";
import { ArchitectureModal } from "./components/ArchitectureModal";
import { ChatPanel } from "./components/ChatPanel";
import { CodeViewer } from "./components/CodeViewer";
import { FileTree } from "./components/FileTree";
import { LandingPage } from "./components/LandingPage";
import {
  ArchitectureData,
  ChatMessageItem,
  CitationRef,
  LanguageMode,
  OpenFileTab,
  RepoStatus,
  SearchResultItem,
  TreeNode,
} from "./types";

const INGEST_STEPS = [
  { key: "cloning", label: "Cloning" },
  { key: "parsing", label: "Parsing" },
  { key: "building_graph", label: "Building graph" },
  { key: "indexing", label: "Indexing" },
];

const WORKSPACES_STORAGE_KEY = "repoguru-workspaces-v1";
const ACTIVE_REPO_KEY = "repoguru-active-repo-v1";
const SESSION_TTL_MS = 9 * 60 * 60 * 1000; // 9 hours
const MAX_WORKSPACES = 5;

interface SavedSession {
  repoId: string;
  owner: string;
  name: string;
  expiresAt: number;
  openTabPaths: string[];
  activeFilePath: string | null;
  messages: ChatMessageItem[];
  languageMode: LanguageMode;
}

function loadSavedWorkspaces(): SavedSession[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) return [];
    const list: SavedSession[] = JSON.parse(raw);
    const now = Date.now();
    const valid = list.filter((w) => w.repoId && w.expiresAt && w.expiresAt > now);
    if (valid.length !== list.length) {
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(valid));
    }
    return valid;
  } catch {
    return [];
  }
}

function getRepoMonogram(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9]/g, "");
  return (clean.slice(0, 2) || "RG").toUpperCase();
}

const RAIL_COLORS = [
  "bg-[#7F1D1D] text-[#FAF9F5]",
  "bg-[#3B1D52] text-[#FAF9F5]",
  "bg-[#1E40AF] text-[#FAF9F5]",
  "bg-[#14532D] text-[#FAF9F5]",
  "bg-[#92400E] text-[#FAF9F5]",
];

function getRailColor(repoId: string): string {
  let hash = 0;
  for (let i = 0; i < repoId.length; i++) {
    hash = (hash * 31 + repoId.charCodeAt(i)) >>> 0;
  }
  return RAIL_COLORS[hash % RAIL_COLORS.length];
}

const EXAMPLE_REPOS = [
  "https://github.com/pallets/flask",
  "https://github.com/fastapi/fastapi",
];

function getStepState(currentStatus: string, stepKey: string): "done" | "active" | "pending" {
  const order = ["queued", "cloning", "parsing", "building_graph", "indexing", "ready"];
  const curIdx = order.indexOf(currentStatus);
  const stepIdx = order.indexOf(stepKey);
  if (curIdx > stepIdx || currentStatus === "ready") return "done";
  if (curIdx === stepIdx) return "active";
  return "pending";
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("repoguru-theme");
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("repoguru-theme", theme);
  }, [theme]);

  // Ingestion & Repo State
  const [repoUrl, setRepoUrl] = useState("");
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);

  // Workspace State
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [highlightedCitation, setHighlightedCitation] = useState<CitationRef | null>(null);

  // Sidebar & Modals
  const [sidebarTab, setSidebarTab] = useState<"explorer" | "search">("explorer");
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showChatPanel, setShowChatPanel] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const [archData, setArchData] = useState<ArchitectureData | null>(null);

  // Mobile responsive pane switcher
  const [mobilePane, setMobilePane] = useState<"explorer" | "code" | "chat">("chat");

  // Resizable pane widths (pixels)
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(430);
  const draggingRef = useRef<"left" | "right" | null>(null);

  // Chat State
  const [languageMode, setLanguageMode] = useState<LanguageMode>("english");
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [recentWorkspaces, setRecentWorkspaces] = useState<SavedSession[]>(() => loadSavedWorkspaces());
  const sessionExpiresAtRef = useRef<number | null>(null);
  const restoredRef = useRef(false);

  // Resize mouse handlers
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      if (draggingRef.current === "left") {
        setLeftWidth(Math.max(200, Math.min(440, e.clientX - 48)));
      } else if (draggingRef.current === "right") {
        setRightWidth(Math.max(320, Math.min(680, window.innerWidth - e.clientX)));
      }
    };
    const onMouseUp = () => {
      draggingRef.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const loadWorkspaceData = useCallback(async (repoId: string) => {
    try {
      const [treeRes, archRes] = await Promise.all([
        fetch(`/api/repos/${repoId}/tree`),
        fetch(`/api/repos/${repoId}/architecture`),
      ]);
      if (treeRes.ok) {
        const tData = await treeRes.json();
        setTree(tData.tree || []);
      }
      if (archRes.ok) {
        const aData = await archRes.json();
        setArchData(aData);
      }
    } catch (err) {
      console.error("Failed to load workspace metadata:", err);
    }
  }, []);

  const switchToWorkspace = useCallback(
    async (saved: SavedSession) => {
      try {
        const res = await fetch(`/api/repos/${saved.repoId}/status`);
        if (!res.ok) return;
        const statusData: RepoStatus = await res.json();
        if (statusData.status !== "ready") return;

        sessionExpiresAtRef.current = saved.expiresAt;
        localStorage.setItem(ACTIVE_REPO_KEY, saved.repoId);
        setRepoStatus(statusData);
        setHighlightedCitation(null);
        setSearchResults([]);
        setLanguageMode(saved.languageMode || "english");
        setMessages(
          Array.isArray(saved.messages)
            ? saved.messages.map((m) => ({ ...m, isStreaming: false }))
            : []
        );
        loadWorkspaceData(statusData.repo_id);

        if (Array.isArray(saved.openTabPaths) && saved.openTabPaths.length > 0) {
          const loadedTabs = await Promise.all(
            saved.openTabPaths.map(async (p) => {
              const fRes = await fetch(
                `/api/repos/${statusData.repo_id}/file?path=${encodeURIComponent(p)}`
              );
              if (!fRes.ok) return null;
              const fData = await fRes.json();
              return {
                path: fData.path,
                language: fData.language,
                content: fData.content,
                lineCount: fData.line_count,
              } as OpenFileTab;
            })
          );
          const validTabs = loadedTabs.filter((t): t is OpenFileTab => t !== null);
          setOpenTabs(validTabs);
          if (saved.activeFilePath && validTabs.some((t) => t.path === saved.activeFilePath)) {
            setActiveFilePath(saved.activeFilePath);
          } else if (validTabs.length > 0) {
            setActiveFilePath(validTabs[0].path);
          } else {
            setActiveFilePath(null);
          }
        } else {
          setOpenTabs([]);
          setActiveFilePath(null);
        }
      } catch (err) {
        console.error("Failed to restore workspace:", err);
      }
    },
    [loadWorkspaceData]
  );

  // Restore last active workspace from localStorage if within 9-hour TTL
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const savedList = loadSavedWorkspaces();
    setRecentWorkspaces(savedList);
    if (savedList.length === 0) return;

    const activeId = localStorage.getItem(ACTIVE_REPO_KEY);
    const target = savedList.find((w) => w.repoId === activeId) || savedList[0];
    if (target) {
      switchToWorkspace(target);
    }
  }, [switchToWorkspace]);

  // Persist current workspace into recentWorkspaces (9-hour TTL)
  useEffect(() => {
    if (!repoStatus || repoStatus.status !== "ready") return;
    if (!sessionExpiresAtRef.current || Date.now() >= sessionExpiresAtRef.current) {
      sessionExpiresAtRef.current = Date.now() + SESSION_TTL_MS;
    }
    const updatedEntry: SavedSession = {
      repoId: repoStatus.repo_id,
      owner: repoStatus.owner,
      name: repoStatus.name,
      expiresAt: sessionExpiresAtRef.current,
      openTabPaths: openTabs.map((t) => t.path),
      activeFilePath,
      messages: messages.filter((m) => !m.isStreaming),
      languageMode,
    };

    const existing = loadSavedWorkspaces().filter((w) => w.repoId !== repoStatus.repo_id);
    const nextList = [updatedEntry, ...existing].slice(0, MAX_WORKSPACES);
    setRecentWorkspaces(nextList);
    localStorage.setItem(ACTIVE_REPO_KEY, repoStatus.repo_id);
    try {
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(nextList));
    } catch {
      // Ignore quota errors
    }
  }, [repoStatus, openTabs, activeFilePath, messages, languageMode]);

  // Poll ingestion status until ready or failed
  useEffect(() => {
    if (!repoStatus || repoStatus.status === "ready" || repoStatus.status === "failed") {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/repos/${repoStatus.repo_id}/status`);
        if (!res.ok) return;
        const data: RepoStatus = await res.json();
        setRepoStatus(data);
        if (data.status === "ready") {
          loadWorkspaceData(data.repo_id);
        }
      } catch (err) {
        console.error("Status poll error:", err);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [repoStatus, loadWorkspaceData]);

  const handleIngestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = repoUrl.trim();
    if (!trimmed || isSubmittingUrl) return;

    const urlMatch = /^https:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i.exec(trimmed);
    const alreadySaved = urlMatch
      ? recentWorkspaces.find(
          (w) =>
            w.owner.toLowerCase() === urlMatch[1].toLowerCase() &&
            w.name.toLowerCase() === urlMatch[2].toLowerCase()
        )
      : undefined;
    if (alreadySaved) {
      switchToWorkspace(alreadySaved);
      return;
    }

    if (recentWorkspaces.length >= MAX_WORKSPACES) {
      setIngestError(
        `You can review up to ${MAX_WORKSPACES} repositories at a time. Remove one from the sidebar or recent list first.`
      );
      return;
    }

    setIngestError(null);
    setIsSubmittingUrl(true);

    try {
      const res = await fetch("/api/repos/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIngestError(data.detail || "Failed to start ingestion.");
        return;
      }
      setRepoStatus(data);
      if (data.status === "ready") {
        loadWorkspaceData(data.repo_id);
      }
    } catch {
      setIngestError("Network error: could not reach backend server.");
    } finally {
      setIsSubmittingUrl(false);
    }
  };

  const openFile = useCallback(
    async (filePath: string, citation?: CitationRef) => {
      if (!repoStatus) return;
      const existing = openTabs.find((t) => t.path === filePath);
      if (existing) {
        setActiveFilePath(filePath);
        if (citation) setHighlightedCitation({ ...citation });
        setMobilePane("code");
        return;
      }

      try {
        const res = await fetch(
          `/api/repos/${repoStatus.repo_id}/file?path=${encodeURIComponent(filePath)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const newTab: OpenFileTab = {
          path: data.path,
          language: data.language,
          content: data.content,
          lineCount: data.line_count,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveFilePath(data.path);
        if (citation) setHighlightedCitation({ ...citation });
        setMobilePane("code");
      } catch (err) {
        console.error("Failed to open file:", err);
      }
    },
    [repoStatus, openTabs]
  );

  const closeTab = (path: string) => {
    setOpenTabs((prev) => {
      const filtered = prev.filter((t) => t.path !== path);
      if (activeFilePath === path) {
        setActiveFilePath(filtered.length > 0 ? filtered[filtered.length - 1].path : null);
      }
      return filtered;
    });
  };

  const handleCodeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoStatus || !searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/repos/${repoStatus.repo_id}/search?q=${encodeURIComponent(searchQuery.trim())}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendMessage = async (question: string) => {
    if (!repoStatus || isStreaming) return;
    const userMsg: ChatMessageItem = {
      id: `u-${Date.now()}`,
      role: "user",
      content: question,
    };
    const assistantId = `a-${Date.now()}`;
    const assistantMsg: ChatMessageItem = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    const historyPayload = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    setActiveStage("Routing");

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo_id: repoStatus.repo_id,
          question,
          language_mode: languageMode,
          chat_history: historyPayload,
        }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text();
        throw new Error(errText || "Streaming request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let currentEvent = "message";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event:")) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            const rawData = line.slice(5).trim();
            if (!rawData) continue;
            try {
              const parsed = JSON.parse(rawData);
              if (currentEvent === "status" && parsed.stage) {
                setActiveStage(parsed.stage);
              } else if (currentEvent === "token" && parsed.token) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + parsed.token } : m
                  )
                );
              } else if (currentEvent === "citations" && parsed.citations) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, citations: parsed.citations } : m
                  )
                );
              } else if (currentEvent === "error") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: `Error: ${parsed.message || "Agent failed."}`, isStreaming: false }
                      : m
                  )
                );
              }
            } catch {
              // Ignore partial JSON frames
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stream response.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `Error: ${msg}`, isStreaming: false } : m
        )
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
      setIsStreaming(false);
      setActiveStage(null);
    }
  };

  const deleteWorkspace = (repoId: string) => {
    const remaining = recentWorkspaces.filter((w) => w.repoId !== repoId);
    setRecentWorkspaces(remaining);
    try {
      localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(remaining));
    } catch {
      // Ignore quota errors
    }

    if (repoStatus?.repo_id === repoId) {
      if (remaining.length > 0) {
        switchToWorkspace(remaining[0]);
      } else {
        openNewRepoScreen();
      }
    }
  };

  const openNewRepoScreen = () => {
    localStorage.removeItem(ACTIVE_REPO_KEY);
    sessionExpiresAtRef.current = null;
    setRepoStatus(null);
    setRepoUrl("");
    setTree([]);
    setOpenTabs([]);
    setActiveFilePath(null);
    setHighlightedCitation(null);
    setMessages([]);
    setSearchResults([]);
    setIngestError(null);
  };

  // Landing / Ingestion Screen (always light parchment; workspace keeps its own theme)
  if (!repoStatus || repoStatus.status !== "ready") {
    return (
      <LandingPage
        repoUrl={repoUrl}
        onChangeRepoUrl={setRepoUrl}
        onSubmitRepo={handleIngestSubmit}
        isSubmittingUrl={isSubmittingUrl}
        repoStatus={repoStatus}
        ingestError={ingestError}
        recentWorkspaces={recentWorkspaces}
        maxWorkspaces={MAX_WORKSPACES}
        onSelectRecent={(repoId) => {
          const found = recentWorkspaces.find((w) => w.repoId === repoId);
          if (found) switchToWorkspace(found);
        }}
        onDeleteRecent={deleteWorkspace}
      />
    );
  }

  // Three-Pane Workspace
  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      {/* Top Bar */}
      <header className="h-11 px-3 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <img
              src="/favicon.svg"
              alt="RepoGuru"
              className="w-6 h-6 rounded-md border border-border"
            />
            <span className="font-serif text-lg font-semibold">RepoGuru</span>
          </div>
          <span className="text-border">/</span>
          <div className="flex items-center gap-1.5 text-xs font-medium text-text truncate">
            <FolderGit2 className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate">
              {repoStatus.owner}/{repoStatus.name}
            </span>
          </div>
        </div>

        {/* Mobile Pane Tabs */}
        <div className="flex lg:hidden items-center gap-1 bg-surface-alt p-0.5 rounded-lg border border-border text-xs">
          <button
            type="button"
            onClick={() => setMobilePane("explorer")}
            className={`px-2 py-1 rounded-md ${mobilePane === "explorer" ? "bg-surface font-medium" : "text-text-muted"}`}
          >
            Files
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("code")}
            className={`px-2 py-1 rounded-md ${mobilePane === "code" ? "bg-surface font-medium" : "text-text-muted"}`}
          >
            Code
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("chat")}
            className={`px-2 py-1 rounded-md ${mobilePane === "chat" ? "bg-surface font-medium" : "text-text-muted"}`}
          >
            Mentor
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openNewRepoScreen}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-border bg-surface-alt hover:border-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Repo
          </button>
          <button
            type="button"
            onClick={() => {
              setShowChatPanel((prev) => !prev);
              setMobilePane("chat");
            }}
            aria-label="Toggle AI Mentor Chat"
            title={showChatPanel ? "Collapse AI Chat" : "Open AI Chat"}
            className={`p-1.5 rounded-lg border transition-colors ${
              showChatPanel
                ? "border-accent/40 bg-accent-soft text-accent"
                : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Toggle color theme"
            className="p-1.5 rounded-lg border border-border hover:bg-surface-alt transition-colors"
          >
            {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Three-Pane Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Thin Activity Bar + Slack-style Repo Switcher Rail */}
        <aside
          aria-label="Workspace activity bar"
          className="w-14 border-r border-border bg-surface-alt/50 flex flex-col items-center py-2.5 gap-2 shrink-0"
        >
          <button
            type="button"
            onClick={() => {
              if (showLeftSidebar && sidebarTab === "explorer") {
                setShowLeftSidebar(false);
              } else {
                setSidebarTab("explorer");
                setShowLeftSidebar(true);
                setMobilePane("explorer");
              }
            }}
            aria-label="Toggle Explorer"
            title={showLeftSidebar && sidebarTab === "explorer" ? "Collapse Explorer" : "Explorer"}
            className={`p-2.5 rounded-xl transition-colors ${
              showLeftSidebar && sidebarTab === "explorer"
                ? "bg-accent-soft text-accent"
                : "text-text-muted hover:text-text hover:bg-surface-alt"
            }`}
          >
            <Files className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (showLeftSidebar && sidebarTab === "search") {
                setShowLeftSidebar(false);
              } else {
                setSidebarTab("search");
                setShowLeftSidebar(true);
                setMobilePane("explorer");
              }
            }}
            aria-label="Toggle Code Search"
            title={showLeftSidebar && sidebarTab === "search" ? "Collapse Search" : "Search"}
            className={`p-2.5 rounded-xl transition-colors ${
              showLeftSidebar && sidebarTab === "search"
                ? "bg-accent-soft text-accent"
                : "text-text-muted hover:text-text hover:bg-surface-alt"
            }`}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setArchOpen(true)}
            aria-label="Architecture Graph"
            title="Architecture"
            className="p-2.5 rounded-xl text-text-muted hover:text-text hover:bg-surface-alt transition-colors"
          >
            <Network className="w-4 h-4" />
          </button>

          <div className="w-7 h-px bg-border my-1" />

          {/* Slack-style Recent Repositories Rail (max 5) */}
          <div className="flex-1 flex flex-col items-center gap-2.5 overflow-y-auto py-1.5 w-full">
            {recentWorkspaces.map((w) => {
              const isActive = w.repoId === repoStatus.repo_id;
              return (
                <div key={w.repoId} className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isActive) switchToWorkspace(w);
                    }}
                    title={`${w.owner}/${w.name}`}
                    aria-label={`Switch to ${w.owner}/${w.name}`}
                    className={`w-9 h-9 rounded-xl font-serif text-xs font-semibold flex items-center justify-center transition-all duration-150 ${getRailColor(
                      w.repoId
                    )} ${
                      isActive
                        ? "ring-2 ring-accent ring-offset-2 ring-offset-bg scale-105"
                        : "opacity-75 hover:opacity-100 hover:scale-105"
                    }`}
                  >
                    {getRepoMonogram(w.name)}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWorkspace(w.repoId);
                    }}
                    title={`Remove ${w.owner}/${w.name}`}
                    aria-label={`Remove ${w.owner}/${w.name}`}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shadow-sm hover:bg-red-700"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}

            {recentWorkspaces.length < MAX_WORKSPACES && (
              <button
                type="button"
                onClick={openNewRepoScreen}
                title="Add new repository"
                aria-label="Add new repository"
                className="w-9 h-9 rounded-xl border border-dashed border-border text-text-muted hover:text-accent hover:border-accent flex items-center justify-center transition-colors shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </aside>

        {/* Left Sidebar (Explorer / Search) */}
        {showLeftSidebar && (
          <>
            <section
              style={{ width: leftWidth }}
              className={`${
                mobilePane === "explorer" ? "flex w-full lg:w-auto" : "hidden lg:flex"
              } flex-col border-r border-border bg-surface shrink-0 min-h-0`}
            >
          {sidebarTab === "explorer" ? (
            <FileTree
              tree={tree}
              selectedPath={activeFilePath}
              onSelectFile={(path) => openFile(path)}
            />
          ) : (
            <div className="flex flex-col h-full">
              <form onSubmit={handleCodeSearch} className="p-3 border-b border-border flex gap-1.5">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Hybrid RAG search..."
                  aria-label="Search repository symbols and code"
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-surface-alt border border-border focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                >
                  Go
                </button>
              </form>
              <div className="flex-1 overflow-y-auto divide-y divide-border/60">
                {searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      openFile(res.file_path, {
                        file: res.file_path,
                        start_line: res.start_line,
                        end_line: res.end_line,
                      })
                    }
                    className="w-full text-left p-3 hover:bg-surface-alt transition-colors"
                  >
                    <div className="text-xs font-mono font-medium text-accent truncate">
                      {res.file_path}:{res.start_line}-{res.end_line}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5 truncate">
                      {res.symbol_name}
                    </div>
                  </button>
                ))}
                {searchResults.length === 0 && !isSearching && (
                  <div className="p-6 text-xs text-text-muted text-center">
                    Search functions, classes, or concepts across the repo.
                  </div>
                )}
              </div>
            </div>
          )}
            </section>

            {/* Left Resize Handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => {
                draggingRef.current = "left";
                document.body.style.cursor = "col-resize";
              }}
              className="hidden lg:block w-1 cursor-col-resize hover:bg-accent/50 transition-colors shrink-0"
            />
          </>
        )}

        {/* Center Code Viewer */}
        <main
          className={`${
            mobilePane === "code" ? "flex w-full" : "hidden lg:flex"
          } flex-1 flex-col min-w-0 min-h-0`}
        >
          <CodeViewer
            tabs={openTabs}
            activePath={activeFilePath}
            highlightedCitation={highlightedCitation}
            onSelectTab={(path) => setActiveFilePath(path)}
            onCloseTab={closeTab}
          />
        </main>

        {/* Right Resize Handle + Agent Chat Panel */}
        {showChatPanel && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => {
                draggingRef.current = "right";
                document.body.style.cursor = "col-resize";
              }}
              className="hidden lg:block w-1 cursor-col-resize hover:bg-accent/50 transition-colors shrink-0"
            />

            <aside
              style={{ width: rightWidth }}
              className={`${
                mobilePane === "chat" ? "flex w-full lg:w-auto" : "hidden lg:flex"
              } flex-col border-l border-border shrink-0 min-h-0`}
            >
              <ChatPanel
                messages={messages}
                languageMode={languageMode}
                activeStage={activeStage}
                isStreaming={isStreaming}
                languages={archData?.languages}
                onToggleLanguage={setLanguageMode}
                onSendMessage={handleSendMessage}
                onClickCitation={(cite) => openFile(cite.file, cite)}
              />
            </aside>
          </>
        )}
      </div>

      <ArchitectureModal
        isOpen={archOpen}
        data={archData}
        onClose={() => setArchOpen(false)}
        onSelectFile={(path) => openFile(path)}
      />
    </div>
  );
}


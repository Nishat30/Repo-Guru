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
} from "lucide-react";
import { ArchitectureModal } from "./components/ArchitectureModal";
import { ChatPanel } from "./components/ChatPanel";
import { CodeViewer } from "./components/CodeViewer";
import { FileTree } from "./components/FileTree";
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

  const resetWorkspace = () => {
    setRepoStatus(null);
    setTree([]);
    setOpenTabs([]);
    setActiveFilePath(null);
    setHighlightedCitation(null);
    setMessages([]);
    setSearchResults([]);
    setIngestError(null);
  };

  // Landing / Ingestion Screen
  if (!repoStatus || repoStatus.status !== "ready") {
    return (
      <div className="min-h-screen flex flex-col bg-bg text-text">
        <header className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-serif font-semibold text-lg">
              R
            </div>
            <span className="font-serif text-xl font-semibold tracking-tight">RepoGuru</span>
          </div>
          <button
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Toggle color theme"
            className="p-2 rounded-xl border border-border bg-surface hover:bg-surface-alt transition-colors"
          >
            {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center px-4 pb-16">
          <div className="w-full max-w-xl bg-surface border border-border rounded-2xl p-7 shadow-[var(--shadow-soft)]">
            <h1 className="font-serif text-3xl text-text mb-2">
              Understand any codebase in minutes
            </h1>
            <p className="text-sm text-text-muted mb-6">
              Paste a public GitHub repository URL. RepoGuru parses ASTs, maps dependencies, and pairs you with a bilingual Senior Mentor.
            </p>

            <form onSubmit={handleIngestSubmit} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  required
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="Paste a GitHub repository to begin (https://github.com/owner/repo)"
                  aria-label="GitHub repository URL"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-bg border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={isSubmittingUrl || (!!repoStatus && repoStatus.status !== "failed")}
                  className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors shrink-0"
                >
                  {isSubmittingUrl ? "Starting..." : "Analyze Repo"}
                </button>
              </div>

              {!repoStatus && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-text-muted">
                  <span>Try:</span>
                  {EXAMPLE_REPOS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setRepoUrl(ex)}
                      className="px-2.5 py-1 rounded-lg bg-surface-alt border border-border hover:border-accent text-text transition-colors"
                    >
                      {ex.replace("https://github.com/", "")}
                    </button>
                  ))}
                </div>
              )}
            </form>

            {(ingestError || repoStatus?.status === "failed") && (
              <div className="mt-5 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Ingestion failed</div>
                  <div className="text-xs opacity-90 mt-0.5">
                    {ingestError || repoStatus?.error_message}
                  </div>
                </div>
              </div>
            )}

            {repoStatus && repoStatus.status !== "failed" && (
              <div className="mt-6 pt-5 border-t border-border space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-text">
                    {repoStatus.owner}/{repoStatus.name}
                  </span>
                  <span className="text-text-muted">{repoStatus.progress}%</span>
                </div>

                {/* Progress Stepper */}
                <div className="grid grid-cols-4 gap-2">
                  {INGEST_STEPS.map((step) => {
                    const st = getStepState(repoStatus.status, step.key);
                    return (
                      <div
                        key={step.key}
                        className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs transition-colors ${
                          st === "done"
                            ? "bg-accent-soft border-accent/30 text-text"
                            : st === "active"
                              ? "bg-surface-alt border-accent text-accent font-medium"
                              : "bg-bg border-border text-text-muted"
                        }`}
                      >
                        {st === "done" ? (
                          <CheckCircle2 className="w-4 h-4 text-accent" />
                        ) : st === "active" ? (
                          <Loader2 className="w-4 h-4 animate-spin text-accent" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-border" />
                        )}
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-text-muted text-center">{repoStatus.step_message}</p>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // Three-Pane Workspace
  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      {/* Top Bar */}
      <header className="h-11 px-3 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-accent text-white flex items-center justify-center font-serif font-semibold text-sm">
              R
            </div>
            <span className="font-serif text-base font-semibold">RepoGuru</span>
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
            onClick={resetWorkspace}
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-border bg-surface-alt hover:border-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Repo
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
        {/* Thin Activity Bar */}
        <aside
          aria-label="Workspace activity bar"
          className="w-12 border-r border-border bg-surface-alt/50 flex flex-col items-center py-2.5 gap-2 shrink-0"
        >
          <button
            type="button"
            onClick={() => {
              setSidebarTab("explorer");
              setMobilePane("explorer");
            }}
            aria-label="Explorer"
            title="Explorer"
            className={`p-2.5 rounded-xl transition-colors ${
              sidebarTab === "explorer"
                ? "bg-accent-soft text-accent"
                : "text-text-muted hover:text-text hover:bg-surface-alt"
            }`}
          >
            <Files className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSidebarTab("search");
              setMobilePane("explorer");
            }}
            aria-label="Code Search"
            title="Search"
            className={`p-2.5 rounded-xl transition-colors ${
              sidebarTab === "search"
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
        </aside>

        {/* Left Sidebar (Explorer / Search) */}
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

        {/* Right Resize Handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => {
            draggingRef.current = "right";
            document.body.style.cursor = "col-resize";
          }}
          className="hidden lg:block w-1 cursor-col-resize hover:bg-accent/50 transition-colors shrink-0"
        />

        {/* Right Agent Chat Panel */}
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
            onToggleLanguage={setLanguageMode}
            onSendMessage={handleSendMessage}
            onClickCitation={(cite) => openFile(cite.file, cite)}
          />
        </aside>
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


import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  FileCode2,
  Files,
  FolderGit2,
  Lock,
  Moon,
  Network,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react";
import { RepoGuruSnapshot } from "../snapshot/schema";
import { decodeSnapshotFromShareUrl } from "../snapshot/shareLink";
import { ArchitectureData, CitationRef, OpenFileTab } from "../types";
import { ArchitectureModal } from "./ArchitectureModal";
import { CodeViewer } from "./CodeViewer";
import { FileTree } from "./FileTree";

const LANG_BAR_COLORS = ["#C49A52", "#4A1728", "#182B24", "#8B7355"];
const CITATION_SPLIT_RE = /(\[\[citation:[^:\]\s]+:\d+-\d+\]\])/g;
const CITATION_PARSE_RE = /^\[\[citation:([^:\]\s]+):(\d+)-(\d+)\]\]$/;

interface SnapshotViewerProps {
  /** Optional raw share URL/fragment override for deterministic testing. */
  initialShareUrl?: string;
}

export const SnapshotViewer: React.FC<SnapshotViewerProps> = ({ initialShareUrl }) => {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [snapshot, setSnapshot] = useState<RepoGuruSnapshot | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [highlightedCitation, setHighlightedCitation] = useState<CitationRef | null>(null);
  const [selectedFileNotice, setSelectedFileNotice] = useState<string | null>(null);
  const [archOpen, setArchOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const rawSource =
      initialShareUrl ?? (typeof window !== "undefined" ? window.location.href : "");

    (async () => {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const decoded = await decodeSnapshotFromShareUrl(rawSource);
        if (cancelled) return;
        setSnapshot(decoded);
        if (decoded.analysis.openFiles.length > 0) {
          setOpenTabs(decoded.analysis.openFiles);
          setActiveFilePath(decoded.analysis.openFiles[0].path);
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Failed to decrypt or validate this shared snapshot."
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialShareUrl]);

  const handleOpenFileOrCitation = (filePath: string, citation?: CitationRef) => {
    if (!snapshot) return;
    const embedded = snapshot.analysis.openFiles.find((f) => f.path === filePath);
    if (embedded) {
      setSelectedFileNotice(null);
      if (!openTabs.some((t) => t.path === embedded.path)) {
        setOpenTabs((prev) => [...prev, embedded]);
      }
      setActiveFilePath(embedded.path);
      if (citation) setHighlightedCitation({ ...citation });
    } else {
      setSelectedFileNotice(
        citation
          ? `Referenced ${filePath} (lines ${citation.start_line}–${citation.end_line}). Full file source was omitted from this read-only snapshot.`
          : `Selected ${filePath}. Full file source was omitted from this read-only snapshot.`
      );
    }
  };

  const handleCloseTab = (path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path !== path);
      if (activeFilePath === path) {
        setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg text-text px-4">
        <div className="p-6 rounded-2xl bg-surface border border-border max-w-md w-full text-center space-y-2 shadow-sm">
          <Lock className="w-6 h-6 text-accent mx-auto animate-pulse" />
          <h1 className="font-serif text-2xl font-semibold">Decrypting Snapshot</h1>
          <p className="text-xs text-text-muted">
            Verifying AES-256-GCM authentication tag and validating schema locally in your browser...
          </p>
        </div>
      </div>
    );
  }

  if (errorMsg || !snapshot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-bg text-text px-4">
        <div className="p-7 rounded-2xl bg-surface border border-border max-w-lg w-full space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-red-700 dark:text-red-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h1 className="font-serif text-2xl font-semibold">Unable to Open Snapshot</h1>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            {errorMsg || "The snapshot link is invalid or incomplete."}
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to RepoGuru
          </a>
        </div>
      </div>
    );
  }

  const archData: ArchitectureData = {
    repo_id: snapshot.repository.repoId,
    nodes: snapshot.analysis.architecture.nodes,
    edges: snapshot.analysis.architecture.edges,
    hub_files: snapshot.analysis.architecture.hub_files,
    languages: snapshot.analysis.languageStatistics,
    stats: snapshot.analysis.architecture.stats,
  };

  return (
    <div className="h-screen flex flex-col bg-bg text-text overflow-hidden">
      {/* Read-Only Top Header */}
      <header className="h-12 px-3 border-b border-border bg-surface flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <a href="/" className="flex items-center gap-2 shrink-0">
            <img
              src="/favicon.svg"
              alt="RepoGuru"
              className="w-6 h-6 rounded-md border border-border"
            />
            <span className="font-serif text-lg font-semibold">RepoGuru</span>
          </a>
          <span className="text-border">/</span>
          <a
            href={snapshot.repository.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-text hover:text-accent truncate"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="truncate">
              {snapshot.repository.owner}/{snapshot.repository.name}
            </span>
            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
          </a>
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-accent-soft text-accent border border-accent/30 shrink-0">
            <ShieldCheck className="w-3 h-3" />
            Shared Snapshot — Read Only
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-border bg-surface-alt hover:border-accent transition-colors"
          >
            Analyze a Repo
          </a>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            aria-label="Toggle color theme"
            className="p-1.5 rounded-lg border border-border hover:bg-surface-alt transition-colors"
          >
            {theme === "light" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Three-Pane Read-Only Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Minimal Activity Bar (No AI triggers or new repo mutation) */}
        <aside
          aria-label="Snapshot navigation"
          className="w-12 border-r border-border bg-surface-alt/50 flex flex-col items-center py-2.5 gap-2 shrink-0"
        >
          <span
            title="File Explorer"
            className="p-2.5 rounded-xl bg-accent-soft text-accent"
          >
            <Files className="w-4 h-4" />
          </span>
          <button
            type="button"
            onClick={() => setArchOpen(true)}
            aria-label="Architecture Graph"
            title="Architecture Graph"
            className="p-2.5 rounded-xl text-text-muted hover:text-text hover:bg-surface-alt transition-colors"
          >
            <Network className="w-4 h-4" />
          </button>
        </aside>

        {/* Left File Explorer */}
        <section className="hidden md:flex w-64 flex-col border-r border-border bg-surface shrink-0 min-h-0">
          <FileTree
            tree={snapshot.analysis.tree}
            selectedPath={activeFilePath}
            onSelectFile={(path) => handleOpenFileOrCitation(path)}
          />
        </section>

        {/* Center Code Viewer / Summary */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedFileNotice && (
            <div className="px-4 py-2 bg-accent-soft border-b border-accent/25 text-xs text-text flex items-center justify-between">
              <span>{selectedFileNotice}</span>
              <button
                type="button"
                onClick={() => setSelectedFileNotice(null)}
                className="text-accent hover:underline ml-3"
              >
                Dismiss
              </button>
            </div>
          )}

          {openTabs.length > 0 ? (
            <CodeViewer
              tabs={openTabs}
              activePath={activeFilePath}
              highlightedCitation={highlightedCitation}
              onSelectTab={(path) => setActiveFilePath(path)}
              onCloseTab={handleCloseTab}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-6 bg-[var(--code-bg)] space-y-6">
              <div className="max-w-2xl mx-auto space-y-4">
                <h2 className="font-serif text-2xl font-semibold text-text">
                  Repository Analysis Summary
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <div className="text-text-muted">Files</div>
                    <div className="font-mono text-base font-semibold mt-0.5">
                      {snapshot.repository.fileCount}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <div className="text-text-muted">AST Chunks</div>
                    <div className="font-mono text-base font-semibold mt-0.5">
                      {snapshot.repository.chunkCount}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <div className="text-text-muted">Dep Edges</div>
                    <div className="font-mono text-base font-semibold mt-0.5">
                      {snapshot.analysis.architecture.stats.edges}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <div className="text-text-muted">Commit</div>
                    <div className="font-mono text-xs font-semibold mt-1 truncate">
                      {snapshot.repository.commitSha
                        ? snapshot.repository.commitSha.slice(0, 8)
                        : "HEAD"}
                    </div>
                  </div>
                </div>

                {snapshot.analysis.architecture.hub_files.length > 0 && (
                  <div className="p-4 rounded-xl bg-surface border border-border space-y-2.5">
                    <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                      Top Architectural Hub Files
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {snapshot.analysis.architecture.hub_files.slice(0, 6).map((hub) => (
                        <button
                          key={hub.file}
                          type="button"
                          onClick={() => handleOpenFileOrCitation(hub.file)}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-surface-alt/70 border border-border hover:border-accent text-left text-xs"
                        >
                          <span className="font-mono truncate pr-2">{hub.file}</span>
                          <span className="text-[11px] text-text-muted shrink-0">
                            {hub.imported_by} in · {hub.imports} out
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* Right Read-Only Insights & Citations Panel (NO AI Chat Input!) */}
        <aside
          aria-label="Snapshot insights and citations"
          className="w-80 lg:w-[400px] border-l border-border bg-bg flex flex-col shrink-0 min-h-0"
        >
          <div className="px-4 py-2.5 border-b border-border bg-surface/70 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <span className="font-serif text-base font-medium">Captured Insights</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-surface-alt border border-border text-text-muted">
              Read Only
            </span>
          </div>

          {snapshot.analysis.languageStatistics.length > 0 && (
            <div className="px-4 py-2.5 border-b border-border/70 bg-surface-alt/40 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
                <span>Language Index</span>
                <span>
                  {snapshot.analysis.languageStatistics
                    .map((l) => `${l.language} ${Math.round(l.percent)}%`)
                    .slice(0, 2)
                    .join(" · ")}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden flex">
                {snapshot.analysis.languageStatistics.map((l, idx) => (
                  <div
                    key={l.language}
                    style={{
                      width: `${Math.max(2, l.percent)}%`,
                      backgroundColor: LANG_BAR_COLORS[idx % LANG_BAR_COLORS.length],
                    }}
                    title={`${l.language}: ${l.percent}%`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {snapshot.mentor.selectedExplanations.length === 0 ? (
              <div className="text-xs text-text-muted text-center py-8">
                No mentor explanations were captured in this snapshot. Use the File Explorer and Architecture Graph to inspect the repository.
              </div>
            ) : (
              snapshot.mentor.selectedExplanations.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3.5 rounded-xl bg-surface border border-border space-y-2 text-xs leading-relaxed text-text"
                >
                  {exp.content.split("\n").map((line, lIdx) => {
                    const parts = line.split(CITATION_SPLIT_RE);
                    return (
                      <p key={lIdx} className="whitespace-pre-wrap">
                        {parts.map((part, pIdx) => {
                          const match = CITATION_PARSE_RE.exec(part);
                          if (match) {
                            const cite: CitationRef = {
                              file: match[1],
                              start_line: Number(match[2]),
                              end_line: Number(match[3]),
                            };
                            const shortName = cite.file.split("/").pop() || cite.file;
                            return (
                              <button
                                key={pIdx}
                                type="button"
                                onClick={() => handleOpenFileOrCitation(cite.file, cite)}
                                className="inline-flex items-center gap-1 mx-0.5 px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent/25 font-mono text-[11px]"
                              >
                                <FileCode2 className="w-3 h-3 shrink-0" />
                                {shortName}:{cite.start_line}-{cite.end_line}
                              </button>
                            );
                          }
                          return <span key={pIdx}>{part}</span>;
                        })}
                      </p>
                    );
                  })}
                </div>
              ))
            )}

            {snapshot.analysis.citations.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
                  Verified Citations ({snapshot.analysis.citations.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {snapshot.analysis.citations.map((cite, idx) => (
                    <button
                      key={`${cite.file}:${cite.start_line}-${cite.end_line}:${idx}`}
                      type="button"
                      onClick={() => handleOpenFileOrCitation(cite.file, cite)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono bg-surface border border-border hover:border-accent text-text"
                    >
                      <FileCode2 className="w-3 h-3 text-accent shrink-0" />
                      {cite.file}:{cite.start_line}-{cite.end_line}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border bg-surface-alt/50 text-[11px] text-text-muted text-center">
            AI chat is disabled in shared read-only snapshots.
          </div>
        </aside>
      </div>

      <ArchitectureModal
        isOpen={archOpen}
        data={archData}
        onClose={() => setArchOpen(false)}
        onSelectFile={(path) => handleOpenFileOrCitation(path)}
      />
    </div>
  );
};


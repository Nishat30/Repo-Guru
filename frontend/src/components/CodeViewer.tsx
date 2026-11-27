import React, { useEffect, useMemo, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-css";
import { ChevronRight, Code2, X } from "lucide-react";
import { CitationRef, OpenFileTab } from "../types";

interface CodeViewerProps {
  tabs: OpenFileTab[];
  activePath: string | null;
  highlightedCitation: CitationRef | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
}

function mapPrismLanguage(lang: string): string {
  const mapping: Record<string, string> = {
    python: "python",
    javascript: "javascript",
    typescript: "typescript",
    tsx: "tsx",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
    json: "json",
    yaml: "yaml",
    bash: "bash",
    markdown: "markdown",
    css: "css",
    html: "markup",
  };
  return mapping[lang] || "clike";
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  tabs,
  activePath,
  highlightedCitation,
  onSelectTab,
  onCloseTab,
}) => {
  const activeTab = useMemo(
    () => tabs.find((t) => t.path === activePath) || null,
    [tabs, activePath]
  );

  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const highlightedLines = useMemo(() => {
    if (!activeTab) return [];
    const prismLang = mapPrismLanguage(activeTab.language);
    const grammar = Prism.languages[prismLang] || Prism.languages.clike;
    return activeTab.content.split(/\r?\n/).map((line) => {
      if (!line) return "&nbsp;";
      return Prism.highlight(line, grammar, prismLang);
    });
  }, [activeTab]);

  useEffect(() => {
    if (
      !highlightedCitation ||
      !activeTab ||
      highlightedCitation.file !== activeTab.path
    ) {
      return;
    }
    const targetEl = lineRefs.current.get(highlightedCitation.start_line);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedCitation, activeTab]);

  if (tabs.length === 0 || !activeTab) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-[var(--code-bg)]">
        <div className="w-12 h-12 rounded-xl bg-surface-alt border border-border flex items-center justify-center mb-4">
          <Code2 className="w-6 h-6 text-accent" />
        </div>
        <h3 className="font-serif text-xl text-text mb-1.5">Select a file to inspect</h3>
        <p className="text-sm text-text-muted max-w-sm">
          Choose any file from the explorer on the left, or click a citation badge in the mentor chat to jump straight to the referenced lines.
        </p>
      </div>
    );
  }

  const breadcrumbs = activeTab.path.split("/");
  const isFileHighlighted =
    highlightedCitation && highlightedCitation.file === activeTab.path;

  return (
    <div className="flex flex-col h-full bg-[var(--code-bg)]">
      {/* Editor Tab Bar */}
      <div
        role="tablist"
        aria-label="Open source files"
        className="flex items-center overflow-x-auto border-b border-border bg-surface-alt/60 px-1.5 pt-1.5 gap-1 shrink-0"
      >
        {tabs.map((tab) => {
          const fileName = tab.path.split("/").pop() || tab.path;
          const isActive = tab.path === activeTab.path;
          return (
            <div
              key={tab.path}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectTab(tab.path)}
              title={tab.path}
              className={`group flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-lg cursor-pointer border border-b-0 transition-colors duration-150 shrink-0 ${
                isActive
                  ? "bg-[var(--code-bg)] border-border text-text font-medium"
                  : "bg-transparent border-transparent text-text-muted hover:text-text hover:bg-surface/60"
              }`}
            >
              <span className="truncate max-w-[150px]">{fileName}</span>
              <button
                type="button"
                aria-label={`Close ${fileName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
                className="opacity-60 group-hover:opacity-100 hover:text-accent rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Breadcrumb Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border/70 text-xs text-text-muted bg-[var(--code-bg)] shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {breadcrumbs.map((segment, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />}
              <span className={idx === breadcrumbs.length - 1 ? "text-text font-medium" : ""}>
                {segment}
              </span>
            </React.Fragment>
          ))}
        </div>
        {isFileHighlighted && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-800 dark:text-amber-300 font-medium shrink-0">
            Lines {highlightedCitation.start_line}–{highlightedCitation.end_line}
          </span>
        )}
      </div>

      {/* Code Lines */}
      <div className="flex-1 overflow-auto font-mono text-[13px] leading-[1.6] py-2">
        {highlightedLines.map((html, index) => {
          const lineNum = index + 1;
          const isCited =
            isFileHighlighted &&
            lineNum >= highlightedCitation.start_line &&
            lineNum <= highlightedCitation.end_line;

          return (
            <div
              key={lineNum}
              ref={(el) => {
                if (el) lineRefs.current.set(lineNum, el);
                else lineRefs.current.delete(lineNum);
              }}
              className={`flex px-3 transition-colors duration-200 ${
                isCited ? "cited-line" : "hover:bg-surface-alt/50"
              }`}
            >
              <span className="w-11 pr-4 text-right select-none text-text-muted/60 text-xs leading-[1.7] shrink-0">
                {lineNum}
              </span>
              <span
                className="whitespace-pre text-text"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};


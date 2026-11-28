import React, { useEffect, useRef, useState } from "react";
import { ArrowUp, FileCode2, Languages, Loader2, Sparkles } from "lucide-react";
import { ChatMessageItem, CitationRef, LanguageMode, LanguageStat } from "../types";

interface ChatPanelProps {
  messages: ChatMessageItem[];
  languageMode: LanguageMode;
  activeStage: string | null;
  isStreaming: boolean;
  languages?: LanguageStat[];
  onToggleLanguage: (mode: LanguageMode) => void;
  onSendMessage: (question: string) => void;
  onClickCitation: (citation: CitationRef) => void;
}

const LANG_BAR_COLORS = ["#C49A52", "#4A1728", "#182B24", "#8B7355"];

const STARTER_QUESTIONS = [
  "Explain the architecture",
  "Trace the login flow",
  "Where is the entry point?",
];

const CITATION_SPLIT_RE = /(\[\[citation:[^:\]\s]+:\d+-\d+\]\])/g;
const CITATION_PARSE_RE = /^\[\[citation:([^:\]\s]+):(\d+)-(\d+)\]\]$/;

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  languageMode,
  activeStage,
  isStreaming,
  languages,
  onToggleLanguage,
  onSendMessage,
  onClickCitation,
}) => {
  const [input, setInput] = useState("");
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeStage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    onSendMessage(trimmed);
  };

  const renderInline = (text: string, keyPrefix: string) => {
    const parts = text.split(CITATION_SPLIT_RE);
    return parts.map((part, partIdx) => {
      const citeMatch = CITATION_PARSE_RE.exec(part);
      if (citeMatch) {
        const cite: CitationRef = {
          file: citeMatch[1],
          start_line: Number(citeMatch[2]),
          end_line: Number(citeMatch[3]),
        };
        const shortName = cite.file.split("/").pop() || cite.file;
        return (
          <button
            key={`${keyPrefix}-c-${partIdx}`}
            type="button"
            onClick={() => onClickCitation(cite)}
            title={`Open ${cite.file} lines ${cite.start_line}-${cite.end_line}`}
            className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded-md text-xs font-mono bg-accent-soft text-accent hover:bg-accent hover:text-white border border-accent/25 transition-colors duration-150 align-baseline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <FileCode2 className="w-3 h-3 shrink-0" />
            <span>
              {shortName}:{cite.start_line}-{cite.end_line}
            </span>
          </button>
        );
      }

      // Parse inline `code` and **bold** without leaving raw asterisks
      const tokenParts = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
      return (
        <React.Fragment key={`${keyPrefix}-t-${partIdx}`}>
          {tokenParts.map((seg, sIdx) => {
            if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) {
              return (
                <code
                  key={sIdx}
                  className="px-1.5 py-0.5 rounded bg-surface-alt border border-border/70 font-mono text-[12.5px] text-text"
                >
                  {seg.slice(1, -1)}
                </code>
              );
            }
            if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) {
              return (
                <strong key={sIdx} className="font-semibold text-text">
                  {seg.slice(2, -2)}
                </strong>
              );
            }
            return <span key={sIdx}>{seg}</span>;
          })}
        </React.Fragment>
      );
    });
  };

  const renderFormattedContent = (text: string, isMessageStreaming?: boolean) => {
    const blocks = text.split(/\n{2,}/);
    return (
      <div className="space-y-3 text-[14.5px] leading-[1.7] text-text">
        {blocks.map((block, bIdx) => {
          const isLastBlock = bIdx === blocks.length - 1;
          const lines = block.split("\n");

          // Render clean list blocks (- item, * item, or 1. item)
          const isBulletList = lines.every((l) => /^\s*[-*]\s+/.test(l));
          if (isBulletList) {
            return (
              <ul key={bIdx} className="list-disc pl-5 space-y-1.5">
                {lines.map((line, lIdx) => {
                  const cleaned = line.replace(/^\s*[-*]\s+/, "");
                  return (
                    <li key={lIdx}>
                      {renderInline(cleaned, `${bIdx}-${lIdx}`)}
                      {isMessageStreaming && isLastBlock && lIdx === lines.length - 1 && (
                        <span className="streaming-caret" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ul>
            );
          }

          const isOrderedList = lines.every((l) => /^\s*\d+\.\s+/.test(l));
          if (isOrderedList) {
            return (
              <ol key={bIdx} className="list-decimal pl-5 space-y-1.5">
                {lines.map((line, lIdx) => {
                  const cleaned = line.replace(/^\s*\d+\.\s+/, "");
                  return (
                    <li key={lIdx}>
                      {renderInline(cleaned, `${bIdx}-${lIdx}`)}
                      {isMessageStreaming && isLastBlock && lIdx === lines.length - 1 && (
                        <span className="streaming-caret" aria-hidden="true" />
                      )}
                    </li>
                  );
                })}
              </ol>
            );
          }

          return (
            <div key={bIdx} className="space-y-1.5">
              {lines.map((line, lIdx) => {
                const isLastLine = isMessageStreaming && isLastBlock && lIdx === lines.length - 1;
                const h3 = /^###\s+(.+)$/.exec(line);
                if (h3) {
                  return (
                    <h4 key={lIdx} className="font-serif text-base font-semibold text-text pt-1">
                      {renderInline(h3[1], `${bIdx}-${lIdx}`)}
                      {isLastLine && <span className="streaming-caret" aria-hidden="true" />}
                    </h4>
                  );
                }
                const h2 = /^#{1,2}\s+(.+)$/.exec(line);
                if (h2) {
                  return (
                    <h3 key={lIdx} className="font-serif text-lg font-semibold text-text pt-1.5">
                      {renderInline(h2[1], `${bIdx}-${lIdx}`)}
                      {isLastLine && <span className="streaming-caret" aria-hidden="true" />}
                    </h3>
                  );
                }
                const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
                if (bullet) {
                  return (
                    <div key={lIdx} className="flex gap-2 pl-2">
                      <span className="text-accent select-none">•</span>
                      <div>
                        {renderInline(bullet[1], `${bIdx}-${lIdx}`)}
                        {isLastLine && <span className="streaming-caret" aria-hidden="true" />}
                      </div>
                    </div>
                  );
                }
                return (
                  <p key={lIdx} className="whitespace-pre-wrap">
                    {renderInline(line, `${bIdx}-${lIdx}`)}
                    {isLastLine && <span className="streaming-caret" aria-hidden="true" />}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface/70 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="font-serif text-base font-medium text-text">Senior Mentor</span>
        </div>

        {/* English / Hinglish Toggle */}
        <div
          role="group"
          aria-label="Mentor language mode"
          className="flex items-center bg-surface-alt border border-border rounded-lg p-0.5 text-xs"
        >
          <button
            type="button"
            onClick={() => onToggleLanguage("english")}
            className={`px-2.5 py-1 rounded-md transition-colors duration-150 ${
              languageMode === "english"
                ? "bg-surface text-text font-medium shadow-sm"
                : "text-text-muted hover:text-text"
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => onToggleLanguage("hinglish")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors duration-150 ${
              languageMode === "hinglish"
                ? "bg-surface text-text font-medium shadow-sm"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Languages className="w-3 h-3" />
            Hinglish
          </button>
        </div>
      </div>

      {/* Language Index Bar */}
      {languages && languages.length > 0 && (
        <div className="px-4 py-2 border-b border-border/70 bg-surface-alt/40 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em] text-text-muted">
            <span>Language Index</span>
            <span>{languages.map((l) => `${l.language} ${Math.round(l.percent)}%`).slice(0, 2).join(" · ")}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden flex">
            {languages.map((l, idx) => (
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

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-5">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="py-8 text-center">
              <h3 className="font-serif text-2xl text-text mb-2">
                Ask anything about this codebase
              </h3>
              <p className="text-sm text-text-muted mb-6">
                {languageMode === "hinglish"
                  ? "Architecture samjho, data flow trace karo, ya line-by-line Hinglish mein poocho."
                  : "Explore architecture, trace cross-file flows, or request line-by-line explanations."}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSendMessage(q)}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium bg-surface border border-border text-text hover:border-accent hover:text-accent transition-colors duration-150 shadow-sm"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              {msg.role === "user" ? (
                <div className="max-w-[85%] px-4 py-2.5 rounded-2xl bg-surface-alt border border-border text-sm text-text">
                  {msg.content}
                </div>
              ) : (
                <div className="w-full">
                  {msg.content ? (
                    renderFormattedContent(msg.content, msg.isStreaming)
                  ) : (
                    msg.isStreaming && (
                      <div className="flex items-center gap-2 text-xs text-text-muted py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                        <span>Preparing grounded response...</span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Live Agent Status Pill */}
          {isStreaming && activeStage && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-accent-soft text-accent border border-accent/25">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                {activeStage}...
              </span>
            </div>
          )}

          <div ref={scrollEndRef} />
        </div>
      </div>

      {/* Input Box */}
      <div className="p-3 border-t border-border bg-bg shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-2xl mx-auto flex items-end gap-2 bg-surface border border-border rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-accent/35 focus-within:border-accent transition-all duration-150"
        >
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={
              languageMode === "hinglish"
                ? "Codebase ke baare mein kuch bhi poocho..."
                : "Ask about architecture, flows, or specific files..."
            }
            aria-label="Ask RepoGuru Mentor"
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            aria-label="Send message"
            className="p-2 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};


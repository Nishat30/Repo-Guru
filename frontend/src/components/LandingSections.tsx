import React from "react";
import {
  FileCode2,
  GitBranch,
  Languages,
  Network,
  Sparkles,
  Terminal,
} from "lucide-react";

const HOW_TO_STEPS = [
  {
    num: "01",
    title: "Paste your GSoC repo URL",
    desc: "Drop any public GitHub repository link above. RepoGuru shallow-clones it safely in seconds.",
  },
  {
    num: "02",
    title: "AST & Dependency Indexing",
    desc: "Tree-sitter splits functions & classes with exact 1-indexed lines while NetworkX maps cross-file imports.",
  },
  {
    num: "03",
    title: "Ask in English or Hinglish",
    desc: "Trace request lifecycles, locate good-first-issue entry points, or get line-by-line mentoring.",
  },
  {
    num: "04",
    title: "Jump straight to lines to patch",
    desc: "Click any citation badge in the mentor chat to auto-scroll and highlight exact lines in the code viewer.",
  },
];

export const LandingSections: React.FC = () => {
  return (
    <>
      <section className="w-full max-w-5xl mx-auto px-4 pt-10 pb-16 space-y-16">
        {/* What is RepoGuru */}
        <div className="space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent-soft text-accent border border-accent/25">
              <Sparkles className="w-3.5 h-3.5" />
              Use it for your GSoC repos
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl text-text">
              What is RepoGuru AI?
            </h2>
            <p className="text-sm text-text-muted">
              An autonomous codebase architect and bilingual senior mentor built to help you onboard onto large open-source &amp; GSoC repositories without getting lost.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-2">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                <Network className="w-4 h-4" />
              </div>
              <h3 className="font-serif text-lg text-text">AST + Hybrid RAG</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Parses Python, JS/TS, Go, Java, and C++ into intact syntactic blocks and fuses Qdrant vector search with BM25 keyword recall.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-2">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                <FileCode2 className="w-4 h-4" />
              </div>
              <h3 className="font-serif text-lg text-text">Verified Line Citations</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Every claim is verified against the cloned workspace and rendered as clickable badges that auto-scroll and highlight exact lines.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm space-y-2">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                <Languages className="w-4 h-4" />
              </div>
              <h3 className="font-serif text-lg text-text">English &amp; Hinglish Mentor</h3>
              <p className="text-xs leading-relaxed text-text-muted">
                Toggle between crisp English and conversational Roman-script Hinglish while keeping every symbol and file path exact.
              </p>
            </div>
          </div>
        </div>

        {/* Visual Usage Previews (Screenshots) */}
        <div className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-1.5">
            <h2 className="font-serif text-2xl text-text">Inside the Workspace</h2>
            <p className="text-xs text-text-muted">
              A VS Code-style explorer paired with a syntax-highlighted viewer and Claude-style AI mentor.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Preview 1: Slack-style Repo Rail + Explorer */}
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm flex flex-col">
              <div className="px-3.5 py-2 border-b border-border bg-surface-alt/70 flex items-center justify-between text-[11px] text-text-muted">
                <span className="font-medium text-text">1. Multi-Repo Explorer</span>
                <span>Up to 5 GSoC repos</span>
              </div>
              <div className="p-3.5 flex gap-2.5 flex-1 bg-bg/60">
                <div className="w-9 rounded-xl bg-surface-alt border border-border py-2 flex flex-col items-center gap-2 shrink-0">
                  <span className="w-6 h-6 rounded-lg bg-[#7F1D1D] text-white text-[10px] font-serif font-semibold flex items-center justify-center ring-2 ring-accent">
                    FL
                  </span>
                  <span className="w-6 h-6 rounded-lg bg-[#3B1D52] text-white text-[10px] font-serif font-semibold flex items-center justify-center opacity-80">
                    FA
                  </span>
                  <span className="w-6 h-6 rounded-lg border border-dashed border-border text-text-muted text-xs flex items-center justify-center">
                    +
                  </span>
                </div>
                <div className="flex-1 rounded-xl bg-surface border border-border p-2.5 font-mono text-[11px] space-y-1 text-text/90">
                  <div className="text-accent font-medium">▾ src/flask/</div>
                  <div className="pl-3 text-text-muted">▸ blueprints.py</div>
                  <div className="pl-3 bg-accent-soft text-accent rounded px-1.5 py-0.5">
                    app.py
                  </div>
                  <div className="pl-3 text-text-muted">▸ routing.py</div>
                  <div className="text-text-muted">▾ tests/</div>
                  <div className="pl-3 text-text-muted">test_basic.py</div>
                </div>
              </div>
            </div>

            {/* Preview 2: Highlighted Code Viewer */}
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm flex flex-col">
              <div className="px-3.5 py-2 border-b border-border bg-surface-alt/70 flex items-center justify-between text-[11px] text-text-muted">
                <span className="font-medium text-text">2. Auto-Scroll &amp; Highlight</span>
                <span>src/flask/app.py</span>
              </div>
              <div className="p-3.5 flex-1 bg-[var(--code-bg)] font-mono text-[11px] leading-relaxed space-y-0.5">
                <div className="flex gap-2 text-text-muted">
                  <span className="w-5 text-right opacity-60">41</span>
                  <span>class Flask(App):</span>
                </div>
                <div className="flex gap-2 cited-line px-1 rounded-sm text-text">
                  <span className="w-5 text-right opacity-60">42</span>
                  <span>def dispatch_request(self):</span>
                </div>
                <div className="flex gap-2 cited-line px-1 rounded-sm text-text">
                  <span className="w-5 text-right opacity-60">43</span>
                  <span>  rule = req.url_rule</span>
                </div>
                <div className="flex gap-2 cited-line px-1 rounded-sm text-text">
                  <span className="w-5 text-right opacity-60">44</span>
                  <span>  return self.view_functions[rule]()</span>
                </div>
                <div className="flex gap-2 text-text-muted">
                  <span className="w-5 text-right opacity-60">45</span>
                  <span>  # matched endpoint</span>
                </div>
              </div>
            </div>

            {/* Preview 3: Bilingual Senior Mentor */}
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm flex flex-col">
              <div className="px-3.5 py-2 border-b border-border bg-surface-alt/70 flex items-center justify-between text-[11px] text-text-muted">
                <span className="font-medium text-text">3. Bilingual Senior Mentor</span>
                <span>English · Hinglish</span>
              </div>
              <div className="p-3.5 flex-1 bg-bg/60 space-y-2.5 text-xs">
                <div className="ml-auto max-w-[85%] px-3 py-1.5 rounded-xl bg-surface-alt border border-border text-text">
                  Where does request routing happen?
                </div>
                <div className="text-text/90 leading-relaxed">
                  Request matching happens inside{" "}
                  <code className="px-1 py-0.5 rounded bg-surface-alt border border-border font-mono text-[11px]">
                    dispatch_request
                  </code>{" "}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent/25 font-mono text-[10px]">
                    app.py:42-44
                  </span>{" "}
                  which resolves the URL rule to its view function.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* How to Use */}
        <div className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-1.5">
            <h2 className="font-serif text-2xl text-text">How to Use It for GSoC</h2>
            <p className="text-xs text-text-muted">
              From unfamiliar repository to your first confident pull request in four steps.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {HOW_TO_STEPS.map((step) => (
              <div
                key={step.num}
                className="p-4 rounded-2xl bg-surface border border-border space-y-2"
              >
                <span className="font-mono text-xs font-semibold text-accent">
                  {step.num}
                </span>
                <h3 className="font-serif text-base text-text">{step.title}</h3>
                <p className="text-xs leading-relaxed text-text-muted">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface/60 px-6 py-5 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <img
              src="/favicon.svg"
              alt="RepoGuru Wizard"
              className="w-5 h-5 rounded border border-border"
            />
            <span className="font-serif font-medium text-text">RepoGuru AI</span>
            <span>·</span>
            <span>Use it for your GSoC repos</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="w-3.5 h-3.5 text-accent" />
              Tree-sitter + Hybrid RAG
            </span>
            <span className="inline-flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5 text-accent" />
              LangGraph + FastMCP
            </span>
          </div>
        </div>
      </footer>
    </>
  );
};


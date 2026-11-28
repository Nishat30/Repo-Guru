import React, { useState } from "react";
import {
  FileCode2,
  FolderOpen,
  GitBranch,
  Layers,
  MessageSquare,
  Network,
  Search,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "./BrandMark";

type PreviewTab =
  | "Overview"
  | "Architecture"
  | "File Explorer"
  | "Dependencies"
  | "AI Mentor"
  | "Code Search";

const SIDEBAR_ITEMS: { label: PreviewTab; icon: React.ReactNode }[] = [
  { label: "Overview", icon: <Layers className="w-3.5 h-3.5" /> },
  { label: "Architecture", icon: <Network className="w-3.5 h-3.5" /> },
  { label: "File Explorer", icon: <FolderOpen className="w-3.5 h-3.5" /> },
  { label: "Dependencies", icon: <GitBranch className="w-3.5 h-3.5" /> },
  { label: "AI Mentor", icon: <MessageSquare className="w-3.5 h-3.5" /> },
  { label: "Code Search", icon: <Search className="w-3.5 h-3.5" /> },
];

export const HeroDashboardPreview: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PreviewTab>("Overview");

  return (
    <div
      id="product"
      className="relative w-full rounded-2xl border border-[#C49A52]/35 bg-[#171923] text-[#F3EBDD] shadow-[0_20px_56px_rgba(0,0,0,0.34)] overflow-hidden text-left"
    >
      {/* Top Window Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#3A323D] bg-[#1E1C24]">
        <div className="flex items-center gap-3 min-w-0">
          <BrandMark className="w-6 h-6 shrink-0" />
          <div className="flex items-center gap-1.5 text-xs font-mono text-[#B6A998] truncate">
            <span>archive</span>
            <span>/</span>
            <span className="text-[#F3EBDD] font-medium">pallets / flask</span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-[#182B24] text-[#C49A52] border border-[#C49A52]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C49A52]" />
            Indexed · 142 AST Blocks
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider border border-[#C49A52]/30 text-[#C49A52] bg-[#C49A52]/10">
            Illustrative Preview
          </span>
          <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-[#3A323D] text-[11px] text-[#B6A998]">
            <span className="w-5 h-5 rounded-full bg-[#4A1728] text-[#F3EBDD] flex items-center justify-center font-serif text-xs border border-[#C49A52]/40">
              R
            </span>
            <span>Mentor Ready</span>
          </div>
        </div>
      </div>

      {/* Dashboard Body */}
      <div className="grid grid-cols-1 sm:grid-cols-[168px_1fr] min-h-[390px]">
        {/* Left Sidebar */}
        <aside className="border-b sm:border-b-0 sm:border-r border-[#3A323D] bg-[#1A1821] p-2.5 flex sm:flex-col gap-1 overflow-x-auto">
          {SIDEBAR_ITEMS.map((item) => {
            const isActive = activeTab === item.label;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setActiveTab(item.label)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap text-left ${
                  isActive
                    ? "bg-[#4A1728] text-[#FFFDF8] border border-[#C49A52]/40"
                    : "text-[#B6A998] hover:text-[#F3EBDD] hover:bg-[#28242D]"
                }`}
              >
                <span className={isActive ? "text-[#C49A52]" : "text-[#8B7355]"}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Language Distribution Widget */}
          <div className="hidden sm:block mt-auto pt-3 border-t border-[#3A323D]/80 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#8B7355]">
              Language Index
            </div>
            <div className="h-1.5 rounded-full bg-[#28242D] overflow-hidden flex">
              <div className="w-[74%] bg-[#C49A52]" />
              <div className="w-[18%] bg-[#4A1728]" />
              <div className="w-[8%] bg-[#182B24]" />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono text-[#B6A998]">
              <span>Python 74%</span>
              <span>RST 18%</span>
            </div>
          </div>
        </aside>

        {/* Main Preview Canvas */}
        <div className="p-3.5 sm:p-4 grid grid-cols-1 xl:grid-cols-12 gap-3.5 bg-[#171923]">
          {/* Left Column: Constellation Dependency Graph + File Explorer */}
          <div className="xl:col-span-7 flex flex-col gap-3">
            {/* Constellation Dependency Graph */}
            <div className="rounded-xl border border-[#3A323D] bg-[#1E1C24] p-4 flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#C49A52]">
                    {activeTab} · Constellation Map
                  </div>
                  <h3 className="font-serif text-lg text-[#FFFDF8]">
                    Module Dependency Graph
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-[#B6A998]">
                  38 nodes · 64 edges
                </span>
              </div>

              {/* Delicate Antique-Gold Constellation SVG */}
              <div className="relative rounded-lg border border-[#3A323D]/80 bg-[#14161F] p-3 overflow-hidden">
                <svg
                  viewBox="0 0 460 170"
                  className="w-full h-40"
                  role="img"
                  aria-label="Illustrative repository dependency constellation"
                >
                  {/* Gold connecting constellation lines */}
                  <g stroke="#C49A52" strokeOpacity="0.45" strokeWidth="1.2">
                    <line x1="230" y1="84" x2="92" y2="42" />
                    <line x1="230" y1="84" x2="98" y2="132" />
                    <line x1="230" y1="84" x2="365" y2="44" />
                    <line x1="230" y1="84" x2="368" y2="128" />
                    <line x1="92" y1="42" x2="98" y2="132" strokeDasharray="3 3" />
                    <line x1="365" y1="44" x2="368" y2="128" strokeDasharray="3 3" />
                  </g>

                  {/* Central Hub Node */}
                  <g>
                    <circle cx="230" cy="84" r="24" fill="#4A1728" stroke="#C49A52" strokeWidth="1.5" />
                    <text x="230" y="88" textAnchor="middle" fill="#FFFDF8" fontSize="10" fontFamily="JetBrains Mono">
                      app.py
                    </text>
                  </g>

                  {/* Satellite Nodes */}
                  {[
                    { x: 92, y: 42, label: "blueprints.py" },
                    { x: 98, y: 132, label: "routing.py" },
                    { x: 365, y: 44, label: "globals.py" },
                    { x: 368, y: 128, label: "testing.py" },
                  ].map((n) => (
                    <g key={n.label}>
                      <circle cx={n.x} cy={n.y} r="5" fill="#C49A52" />
                      <rect
                        x={n.x - 42}
                        y={n.y + 10}
                        width="84"
                        height="18"
                        rx="5"
                        fill="#1E1C24"
                        stroke="#3A323D"
                      />
                      <text
                        x={n.x}
                        y={n.y + 22}
                        textAnchor="middle"
                        fill="#F3EBDD"
                        fontSize="9"
                        fontFamily="JetBrains Mono"
                      >
                        {n.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {/* Mini File Explorer + Cited Source Snippet */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5 rounded-xl border border-[#3A323D] bg-[#1E1C24] p-3 font-mono text-[11px] space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#8B7355] mb-1.5">
                  File Explorer
                </div>
                <div className="text-[#C49A52]">▾ src/flask/</div>
                <div className="pl-3 px-1.5 py-0.5 rounded bg-[#4A1728]/70 text-[#FFFDF8] border border-[#C49A52]/30">
                  app.py
                </div>
                <div className="pl-3 text-[#B6A998]">blueprints.py</div>
                <div className="pl-3 text-[#B6A998]">globals.py</div>
                <div className="text-[#B6A998]">▾ tests/</div>
              </div>

              <div className="sm:col-span-7 rounded-xl border border-[#3A323D] bg-[#14161F] p-3 font-mono text-[11px] space-y-0.5 overflow-x-auto">
                <div className="flex items-center justify-between text-[10px] text-[#8B7355] mb-1">
                  <span>src/flask/app.py</span>
                  <span className="text-[#C49A52]">Lines 42–45</span>
                </div>
                <div className="flex gap-2 bg-[#C49A52]/15 border-l-2 border-[#C49A52] px-1.5 py-0.5 text-[#FFFDF8]">
                  <span className="text-[#8B7355]">42</span>
                  <span>def dispatch_request(self):</span>
                </div>
                <div className="flex gap-2 bg-[#C49A52]/15 border-l-2 border-[#C49A52] px-1.5 py-0.5 text-[#F3EBDD]">
                  <span className="text-[#8B7355]">43</span>
                  <span>  req = request_ctx.request</span>
                </div>
                <div className="flex gap-2 bg-[#C49A52]/15 border-l-2 border-[#C49A52] px-1.5 py-0.5 text-[#F3EBDD]">
                  <span className="text-[#8B7355]">44</span>
                  <span>  return self.view_functions[rule]()</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Bilingual AI Mentor Preview */}
          <div className="xl:col-span-5 rounded-xl border border-[#3A323D] bg-[#1E1C24] p-3.5 flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between border-b border-[#3A323D] pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#C49A52]" />
                <span className="font-serif text-base text-[#FFFDF8]">Senior Mentor</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-mono bg-[#171923] border border-[#3A323D] rounded-md p-0.5">
                <span className="px-2 py-0.5 rounded bg-[#4A1728] text-[#FFFDF8]">English</span>
                <span className="px-2 py-0.5 text-[#B6A998]">Hinglish</span>
              </div>
            </div>

            <div className="space-y-3 text-xs leading-relaxed flex-1">
              <div className="ml-auto max-w-[85%] px-3 py-2 rounded-xl bg-[#28242D] border border-[#3A323D] text-[#F3EBDD]">
                Trace how an incoming HTTP request reaches a view function.
              </div>

              <div className="space-y-2 text-[#E5DCCB]">
                <p>
                  Requests enter through <code className="px-1 py-0.5 rounded bg-[#171923] border border-[#3A323D] font-mono text-[11px] text-[#C49A52]">wsgi_app</code> and delegate URL matching to{" "}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#4A1728]/80 text-[#F3EBDD] border border-[#C49A52]/40 font-mono text-[10px]">
                    <FileCode2 className="w-2.5 h-2.5 text-[#C49A52]" />
                    app.py:42-45
                  </span>
                  .
                </p>
                <p className="text-[#B6A998]">
                  If a blueprint owns the endpoint, context hooks execute in registration order before returning the response.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2.5 border-t border-[#3A323D] text-[10px] font-mono text-[#8B7355]">
              <span>Verified via repo_mcp · Hybrid RAG</span>
              <span className="text-[#C49A52]">100% Grounded</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


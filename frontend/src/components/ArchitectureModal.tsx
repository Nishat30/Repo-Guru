import React from "react";
import { GitFork, Network, X } from "lucide-react";
import { ArchitectureData } from "../types";

interface ArchitectureModalProps {
  isOpen: boolean;
  data: ArchitectureData | null;
  onClose: () => void;
  onSelectFile: (path: string) => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  isOpen,
  data,
  onClose,
  onSelectFile,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Repository Dependency Architecture"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-surface border border-border rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <Network className="w-5 h-5 text-accent" />
            <div>
              <h2 className="font-serif text-xl text-text">Architecture &amp; Dependency Graph</h2>
              {data && (
                <p className="text-xs text-text-muted">
                  {data.stats.files} indexed files · {data.stats.edges} internal import edges
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close architecture modal"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {!data || data.nodes.length === 0 ? (
            <div className="text-sm text-text-muted text-center py-10">
              No internal import edges detected for this repository.
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                  Key Architectural Hubs (Most Connected Files)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {data.hub_files.map((hub) => (
                    <button
                      key={hub.file}
                      type="button"
                      onClick={() => {
                        onSelectFile(hub.file);
                        onClose();
                      }}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-alt/70 border border-border hover:border-accent text-left transition-colors"
                    >
                      <span className="font-mono text-xs text-text truncate pr-3">
                        {hub.file}
                      </span>
                      <span className="text-[11px] text-text-muted shrink-0">
                        {hub.imported_by} in · {hub.imports} out
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                  Dependency Edges ({data.edges.length})
                </h3>
                <div className="max-h-60 overflow-y-auto rounded-xl border border-border divide-y divide-border/60 bg-bg">
                  {data.edges.slice(0, 60).map((edge, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-text"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelectFile(edge.source);
                          onClose();
                        }}
                        className="hover:text-accent truncate"
                      >
                        {edge.source}
                      </button>
                      <GitFork className="w-3 h-3 text-accent shrink-0" />
                      <button
                        type="button"
                        onClick={() => {
                          onSelectFile(edge.target);
                          onClose();
                        }}
                        className="hover:text-accent truncate"
                      >
                        {edge.target}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


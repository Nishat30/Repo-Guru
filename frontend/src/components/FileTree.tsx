import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Search,
  X,
} from "lucide-react";
import { TreeNode } from "../types";

interface FileTreeProps {
  tree: TreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

interface FlatItem {
  node: TreeNode;
  depth: number;
}

function getFileIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".py")) return <FileCode2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />;
  if (lower.endsWith(".ts") || lower.endsWith(".tsx"))
    return <FileCode2 className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />;
  if (lower.endsWith(".js") || lower.endsWith(".jsx"))
    return <FileCode2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />;
  if (lower.endsWith(".go")) return <FileCode2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />;
  if (lower.endsWith(".json") || lower.endsWith(".yaml") || lower.endsWith(".yml"))
    return <FileJson className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
  return <FileText className="w-4 h-4 text-text-muted shrink-0" />;
}

function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) return nodes;
  const q = query.toLowerCase();
  const result: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.path.toLowerCase().includes(q)) {
        result.push(node);
      }
    } else if (node.children) {
      const filteredChildren = filterTree(node.children, query);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
}

export const FileTree: React.FC<FileTreeProps> = ({ tree, selectedPath, onSelectFile }) => {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const node of tree) {
      if (node.type === "dir") initial.add(node.path);
    }
    return initial;
  });
  const [focusedPath, setFocusedPath] = useState<string | null>(selectedPath);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tree.length > 0 && expanded.size === 0) {
      const next = new Set<string>();
      for (const node of tree) {
        if (node.type === "dir") next.add(node.path);
      }
      setExpanded(next);
    }
  }, [tree]);

  const visibleTree = useMemo(() => filterTree(tree, filter), [tree, filter]);

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        items.push({ node, depth });
        const isOpen = filter.trim().length > 0 || expanded.has(node.path);
        if (node.type === "dir" && isOpen && node.children) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(visibleTree, 0);
    return items;
  }, [visibleTree, expanded, filter]);

  const toggleDir = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatItems.length === 0) return;
    const currentIndex = flatItems.findIndex((item) => item.node.path === focusedPath);
    const idx = currentIndex >= 0 ? currentIndex : 0;
    const current = flatItems[idx];

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = flatItems[Math.min(idx + 1, flatItems.length - 1)];
      setFocusedPath(next.node.path);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = flatItems[Math.max(idx - 1, 0)];
      setFocusedPath(prev.node.path);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (current.node.type === "dir" && !expanded.has(current.node.path)) {
        toggleDir(current.node.path);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (current.node.type === "dir" && expanded.has(current.node.path)) {
        toggleDir(current.node.path);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (current.node.type === "dir") toggleDir(current.node.path);
      else onSelectFile(current.node.path);
    }
  };

  return (
    <div className="flex flex-col h-full select-none">
      <div className="px-3 py-2 border-b border-border">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files..."
            aria-label="Filter repository files"
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-surface-alt border border-border text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              aria-label="Clear file filter"
              className="absolute right-2 text-text-muted hover:text-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        ref={treeRef}
        role="tree"
        aria-label="Repository file explorer"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto py-1.5 focus:outline-none"
      >
        {flatItems.length === 0 ? (
          <div className="px-4 py-6 text-xs text-text-muted text-center">No matching files</div>
        ) : (
          flatItems.map(({ node, depth }) => {
            const isDir = node.type === "dir";
            const isOpen = filter.trim().length > 0 || expanded.has(node.path);
            const isSelected = selectedPath === node.path;
            const isFocused = focusedPath === node.path;

            return (
              <button
                key={node.path}
                type="button"
                role="treeitem"
                aria-expanded={isDir ? isOpen : undefined}
                aria-selected={isSelected}
                onClick={() => {
                  setFocusedPath(node.path);
                  if (isDir) toggleDir(node.path);
                  else onSelectFile(node.path);
                }}
                style={{ paddingLeft: `${depth * 14 + 10}px` }}
                className={`w-full flex items-center gap-1.5 pr-3 py-1 text-left text-[13px] transition-colors duration-150 relative ${
                  isSelected
                    ? "bg-accent-soft text-text font-medium"
                    : isFocused
                      ? "bg-surface-alt text-text"
                      : "text-text/85 hover:bg-surface-alt/80"
                }`}
              >
                {/* Indent guides */}
                {depth > 0 &&
                  Array.from({ length: depth }).map((_, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      style={{ left: `${i * 14 + 16}px` }}
                      className="absolute top-0 bottom-0 w-px bg-border/70"
                    />
                  ))}

                {isDir ? (
                  <>
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    )}
                    {isOpen ? (
                      <FolderOpen className="w-4 h-4 text-accent shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-accent/80 shrink-0" />
                    )}
                  </>
                ) : (
                  <>
                    <span className="w-3.5 shrink-0" />
                    {getFileIcon(node.name)}
                  </>
                )}

                <span className="truncate">{node.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};


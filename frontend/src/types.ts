export type LanguageMode = "english" | "hinglish";

export interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  language?: string;
  children?: TreeNode[];
}

export interface RepoStatus {
  repo_id: string;
  url?: string;
  owner: string;
  name: string;
  status: "queued" | "cloning" | "parsing" | "building_graph" | "indexing" | "ready" | "failed";
  progress: number;
  step_message: string;
  error_message?: string | null;
  file_count?: number;
  chunk_count?: number;
  commit_sha?: string | null;
}

export interface OpenFileTab {
  path: string;
  language: string;
  content: string;
  lineCount: number;
}

export interface CitationRef {
  file: string;
  start_line: number;
  end_line: number;
}

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: CitationRef[];
  isStreaming?: boolean;
}

export interface SearchResultItem {
  file_path: string;
  start_line: number;
  end_line: number;
  symbol_name: string;
  language: string;
  content: string;
  rrf_score: number;
}

export interface ArchitectureData {
  repo_id: string;
  nodes: { id: string; language: string; in_degree: number; out_degree: number }[];
  edges: { source: string; target: string }[];
  hub_files: { file: string; imported_by: number; imports: number }[];
  stats: { files: number; edges: number };
}


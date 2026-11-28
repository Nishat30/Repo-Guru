import {
  ArchitectureData,
  ChatMessageItem,
  CitationRef,
  LanguageStat,
  OpenFileTab,
  RepoStatus,
  TreeNode,
} from "../types";

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

export interface SnapshotExplanation {
  id: string;
  content: string;
  citations: CitationRef[];
}

export interface RepoGuruSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  createdAt: string;
  repository: {
    repoId: string;
    owner: string;
    name: string;
    url: string;
    commitSha: string | null;
    fileCount: number;
    chunkCount: number;
  };
  analysis: {
    tree: TreeNode[];
    architecture: {
      nodes: ArchitectureData["nodes"];
      edges: ArchitectureData["edges"];
      hub_files: ArchitectureData["hub_files"];
      stats: ArchitectureData["stats"];
    };
    languageStatistics: LanguageStat[];
    openFiles: OpenFileTab[];
    citations: CitationRef[];
  };
  mentor: {
    selectedExplanations: SnapshotExplanation[];
  };
}

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotValidationError";
  }
}

const GITHUB_HTTPS_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;
const SAFE_REPO_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CITATION_RE = /\[\[citation:([^:\]\s]+):(\d+)-(\d+)\]\]/g;

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function isSafeRelativePath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (path.startsWith("/") || path.startsWith("\\") || path.includes("\0")) return false;
  const segments = path.split(/[\\/]/);
  return segments.every((s) => s !== "" && s !== "." && s !== "..");
}

function sanitizeCitation(raw: unknown): CitationRef | null {
  if (!isRecord(raw)) return null;
  const file = typeof raw.file === "string" ? raw.file.trim() : "";
  const start = Number(raw.start_line);
  const end = Number(raw.end_line);
  if (
    !isSafeRelativePath(file) ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 1 ||
    end < start
  ) {
    return null;
  }
  return { file, start_line: start, end_line: end };
}

function sanitizeTreeNode(raw: unknown, depth = 0): TreeNode {
  if (depth > 25) {
    throw new SnapshotValidationError("Repository tree exceeds maximum nesting depth.");
  }
  if (!isRecord(raw)) {
    throw new SnapshotValidationError("Invalid file tree node.");
  }
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  const type = raw.type;
  if (!name || !isSafeRelativePath(path) || (type !== "dir" && type !== "file")) {
    throw new SnapshotValidationError("Invalid file tree node metadata.");
  }
  const node: TreeNode = {
    name,
    path,
    type,
  };
  if (typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size >= 0) {
    node.size = raw.size;
  }
  if (typeof raw.language === "string") {
    node.language = raw.language;
  }
  if (type === "dir" && Array.isArray(raw.children)) {
    node.children = raw.children.map((child) => sanitizeTreeNode(child, depth + 1));
  }
  return node;
}

export function validateSnapshot(raw: unknown): RepoGuruSnapshot {
  if (!isRecord(raw)) {
    throw new SnapshotValidationError("Snapshot payload must be a JSON object.");
  }

  if (raw.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new SnapshotValidationError(
      `Unsupported snapshot schema version: ${String(raw.schemaVersion)}.`
    );
  }

  const snapshotId = typeof raw.snapshotId === "string" ? raw.snapshotId.trim() : "";
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt.trim() : "";
  if (!snapshotId || !createdAt || Number.isNaN(Date.parse(createdAt))) {
    throw new SnapshotValidationError("Missing or invalid snapshotId / createdAt.");
  }

  if (!isRecord(raw.repository)) {
    throw new SnapshotValidationError("Missing repository metadata.");
  }
  const repo = raw.repository;
  const repoId = typeof repo.repoId === "string" ? repo.repoId.trim() : "";
  const owner = typeof repo.owner === "string" ? repo.owner.trim() : "";
  const name = typeof repo.name === "string" ? repo.name.trim() : "";
  const url = typeof repo.url === "string" ? repo.url.trim() : "";
  if (
    !SAFE_REPO_ID_RE.test(repoId) ||
    !owner ||
    !name ||
    !GITHUB_HTTPS_RE.test(url)
  ) {
    throw new SnapshotValidationError("Invalid or unsafe repository metadata.");
  }

  if (!isRecord(raw.analysis)) {
    throw new SnapshotValidationError("Missing analysis payload.");
  }
  const analysis = raw.analysis;
  if (!Array.isArray(analysis.tree)) {
    throw new SnapshotValidationError("Missing repository file tree.");
  }
  const tree = analysis.tree.map((n) => sanitizeTreeNode(n, 0));

  if (!isRecord(analysis.architecture)) {
    throw new SnapshotValidationError("Missing architecture graph.");
  }
  const arch = analysis.architecture;
  const nodes = Array.isArray(arch.nodes)
    ? arch.nodes
        .filter(
          (n): n is ArchitectureData["nodes"][number] =>
            isRecord(n) &&
            typeof n.id === "string" &&
            isSafeRelativePath(n.id) &&
            typeof n.language === "string" &&
            typeof n.in_degree === "number" &&
            typeof n.out_degree === "number"
        )
        .map((n) => ({
          id: n.id,
          language: n.language,
          in_degree: n.in_degree,
          out_degree: n.out_degree,
        }))
    : [];
  const edges = Array.isArray(arch.edges)
    ? arch.edges
        .filter(
          (e): e is ArchitectureData["edges"][number] =>
            isRecord(e) &&
            typeof e.source === "string" &&
            typeof e.target === "string" &&
            isSafeRelativePath(e.source) &&
            isSafeRelativePath(e.target)
        )
        .map((e) => ({ source: e.source, target: e.target }))
    : [];
  const hub_files = Array.isArray(arch.hub_files)
    ? arch.hub_files
        .filter(
          (h): h is ArchitectureData["hub_files"][number] =>
            isRecord(h) &&
            typeof h.file === "string" &&
            isSafeRelativePath(h.file) &&
            typeof h.imported_by === "number" &&
            typeof h.imports === "number"
        )
        .map((h) => ({
          file: h.file,
          imported_by: h.imported_by,
          imports: h.imports,
        }))
    : [];
  const stats =
    isRecord(arch.stats) &&
    typeof arch.stats.files === "number" &&
    typeof arch.stats.edges === "number"
      ? { files: arch.stats.files, edges: arch.stats.edges }
      : { files: nodes.length, edges: edges.length };

  const languageStatistics: LanguageStat[] = Array.isArray(analysis.languageStatistics)
    ? analysis.languageStatistics
        .filter(
          (l): l is LanguageStat =>
            isRecord(l) &&
            typeof l.language === "string" &&
            typeof l.percent === "number" &&
            Number.isFinite(l.percent)
        )
        .map((l) => ({ language: l.language, percent: l.percent }))
    : [];

  const openFiles: OpenFileTab[] = Array.isArray(analysis.openFiles)
    ? analysis.openFiles
        .filter(
          (f): f is OpenFileTab =>
            isRecord(f) &&
            typeof f.path === "string" &&
            isSafeRelativePath(f.path) &&
            typeof f.language === "string" &&
            typeof f.content === "string" &&
            typeof f.lineCount === "number"
        )
        .map((f) => ({
          path: f.path,
          language: f.language,
          content: f.content,
          lineCount: f.lineCount,
        }))
    : [];

  const citations: CitationRef[] = Array.isArray(analysis.citations)
    ? analysis.citations
        .map(sanitizeCitation)
        .filter((c): c is CitationRef => c !== null)
    : [];

  if (!isRecord(raw.mentor) || !Array.isArray(raw.mentor.selectedExplanations)) {
    throw new SnapshotValidationError("Missing mentor explanations section.");
  }

  const selectedExplanations: SnapshotExplanation[] = raw.mentor.selectedExplanations
    .filter(
      (item): item is Record<string, unknown> =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.content === "string"
    )
    .map((item) => ({
      id: item.id as string,
      content: item.content as string,
      citations: Array.isArray(item.citations)
        ? item.citations
            .map(sanitizeCitation)
            .filter((c): c is CitationRef => c !== null)
        : [],
    }));

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    createdAt,
    repository: {
      repoId,
      owner,
      name,
      url,
      commitSha: typeof repo.commitSha === "string" ? repo.commitSha : null,
      fileCount: typeof repo.fileCount === "number" ? repo.fileCount : stats.files,
      chunkCount: typeof repo.chunkCount === "number" ? repo.chunkCount : 0,
    },
    analysis: {
      tree,
      architecture: {
        nodes,
        edges,
        hub_files,
        stats,
      },
      languageStatistics,
      openFiles,
      citations,
    },
    mentor: {
      selectedExplanations,
    },
  };
}

export interface SerializeSnapshotInput {
  repoStatus: RepoStatus;
  tree: TreeNode[];
  archData: ArchitectureData | null;
  openTabs?: OpenFileTab[];
  messages?: ChatMessageItem[];
  includeOpenFiles?: boolean;
}

function extractInlineCitations(text: string): CitationRef[] {
  const seen = new Set<string>();
  const results: CitationRef[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const file = match[1];
    const start_line = Number(match[2]);
    const end_line = Number(match[3]);
    const key = `${file}:${start_line}-${end_line}`;
    if (!seen.has(key) && isSafeRelativePath(file) && start_line >= 1 && end_line >= start_line) {
      seen.add(key);
      results.push({ file, start_line, end_line });
    }
  }
  return results;
}

/**
 * Build a validated, read-only snapshot from completed repository analysis state.
 * Strictly excludes API keys, credentials, settings, and original user chat prompts.
 */
export function serializeSnapshot(input: SerializeSnapshotInput): RepoGuruSnapshot {
  const { repoStatus, tree, archData, openTabs = [], messages = [], includeOpenFiles = false } = input;
  const canonicalUrl =
    repoStatus.url && GITHUB_HTTPS_RE.test(repoStatus.url)
      ? repoStatus.url
      : `https://github.com/${repoStatus.owner}/${repoStatus.name}`;

  // Include ONLY completed assistant explanations (never original user prompts/conversation)
  const selectedExplanations: SnapshotExplanation[] = messages
    .filter((m) => m.role === "assistant" && !m.isStreaming && m.content.trim().length > 0)
    .slice(-5)
    .map((m) => {
      const mergedCitations =
        m.citations && m.citations.length > 0
          ? m.citations
          : extractInlineCitations(m.content);
      return {
        id: m.id,
        content: m.content,
        citations: mergedCitations,
      };
    });

  const allCitationsMap = new Map<string, CitationRef>();
  for (const exp of selectedExplanations) {
    for (const c of exp.citations) {
      allCitationsMap.set(`${c.file}:${c.start_line}-${c.end_line}`, c);
    }
  }

  const candidate: RepoGuruSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    snapshotId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    repository: {
      repoId: repoStatus.repo_id,
      owner: repoStatus.owner,
      name: repoStatus.name,
      url: canonicalUrl,
      commitSha: repoStatus.commit_sha ?? null,
      fileCount: repoStatus.file_count ?? archData?.stats.files ?? 0,
      chunkCount: repoStatus.chunk_count ?? 0,
    },
    analysis: {
      tree,
      architecture: {
        nodes: archData?.nodes ?? [],
        edges: archData?.edges ?? [],
        hub_files: archData?.hub_files ?? [],
        stats: archData?.stats ?? { files: repoStatus.file_count ?? 0, edges: 0 },
      },
      languageStatistics: archData?.languages ?? [],
      openFiles: includeOpenFiles ? openTabs.slice(0, 5) : [],
      citations: Array.from(allCitationsMap.values()),
    },
    mentor: {
      selectedExplanations,
    },
  };

  return validateSnapshot(candidate);
}


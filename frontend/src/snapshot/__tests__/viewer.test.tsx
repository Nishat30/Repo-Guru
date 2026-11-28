import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SnapshotViewer } from "../../components/SnapshotViewer";
import { serializeSnapshot } from "../schema";
import { encodeSnapshotToShareUrl } from "../shareLink";
import { ArchitectureData, ChatMessageItem, RepoStatus, TreeNode } from "../../types";

describe("SnapshotViewer (Read-Only Guarantee)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("decrypts and renders read-only snapshot without making any network or AI requests", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const repoStatus: RepoStatus = {
      repo_id: "bb69cc12b4b0",
      url: "https://github.com/pallets/flask",
      owner: "pallets",
      name: "flask",
      status: "ready",
      progress: 100,
      step_message: "Ready",
      file_count: 15,
      chunk_count: 42,
      commit_sha: "deadbeef1234",
    };
    const tree: TreeNode[] = [
      { name: "app.py", path: "app.py", type: "file", language: "python", size: 512 },
    ];
    const archData: ArchitectureData = {
      repo_id: "bb69cc12b4b0",
      nodes: [{ id: "app.py", language: "python", in_degree: 2, out_degree: 0 }],
      edges: [],
      hub_files: [{ file: "app.py", imported_by: 2, imports: 0 }],
      languages: [{ language: "python", percent: 100 }],
      stats: { files: 15, edges: 4 },
    };
    const messages: ChatMessageItem[] = [
      { id: "u-1", role: "user", content: "Private user prompt" },
      {
        id: "a-1",
        role: "assistant",
        content: "Flask entry point lives in [[citation:app.py:1-12]].",
        citations: [{ file: "app.py", start_line: 1, end_line: 12 }],
      },
    ];

    const snap = serializeSnapshot({ repoStatus, tree, archData, messages });
    const { url } = await encodeSnapshotToShareUrl(snap, "https://repoguru.app");

    render(<SnapshotViewer initialShareUrl={url} />);

    await waitFor(() => {
      expect(screen.getByText("pallets/flask")).toBeInTheDocument();
    });

    // Strict read-only badge and captured insights
    expect(screen.getByText("Shared Snapshot — Read Only")).toBeInTheDocument();
    expect(screen.getByText(/Flask entry point lives in/)).toBeInTheDocument();
    expect(screen.getAllByText("app.py:1-12").length).toBeGreaterThanOrEqual(1);

    // Must NOT expose AI chat input or send controls
    expect(screen.queryByLabelText("Ask RepoGuru Mentor")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    expect(screen.queryByText("Private user prompt")).not.toBeInTheDocument();

    // Must NOT make any backend / AI / DB fetch requests
    expect(fetchSpy).not.toHaveBeenCalled();

    // Must NOT persist decrypted snapshot into localStorage
    expect(localStorage.length).toBe(0);
  });

  it("renders a safe error screen for tampered or malformed share URLs", async () => {
    render(<SnapshotViewer initialShareUrl="https://repoguru.app/share#v1.bad.data.here" />);

    await waitFor(() => {
      expect(screen.getByText("Unable to Open Snapshot")).toBeInTheDocument();
    });
  });
});

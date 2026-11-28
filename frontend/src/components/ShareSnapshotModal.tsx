import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  Lock,
  Share2,
  ShieldAlert,
  X,
} from "lucide-react";
import { isCompressionSupported } from "../snapshot/compression";
import { isWebCryptoSupported } from "../snapshot/crypto";
import { serializeSnapshot, SerializeSnapshotInput } from "../snapshot/schema";
import {
  encodeSnapshotToShareUrl,
  EncodedShareResult,
  SnapshotTooLargeError,
} from "../snapshot/shareLink";

interface ShareSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshotInput: SerializeSnapshotInput;
}

export const ShareSnapshotModal: React.FC<ShareSnapshotModalProps> = ({
  isOpen,
  onClose,
  snapshotInput,
}) => {
  const [includeOpenFiles, setIncludeOpenFiles] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<EncodedShareResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [oversizedInfo, setOversizedInfo] = useState<{
    urlLength: number;
    maxLength: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const browserSupported = isWebCryptoSupported() && isCompressionSupported();

  const previewStats = useMemo(() => {
    try {
      const snap = serializeSnapshot({ ...snapshotInput, includeOpenFiles });
      const rawBytes = new TextEncoder().encode(JSON.stringify(snap)).byteLength;
      return {
        snapshot: snap,
        rawKb: (rawBytes / 1024).toFixed(1),
        explanationCount: snap.mentor.selectedExplanations.length,
        citationCount: snap.analysis.citations.length,
      };
    } catch {
      return null;
    }
  }, [snapshotInput, includeOpenFiles]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!browserSupported) {
      setErrorMsg(
        "Your browser does not support Web Crypto (AES-256-GCM) or CompressionStream (gzip)."
      );
      return;
    }
    if (!previewStats) {
      setErrorMsg("Repository analysis data is incomplete or invalid.");
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setOversizedInfo(null);
    setCopied(false);

    try {
      const encoded = await encodeSnapshotToShareUrl(previewStats.snapshot);
      setResult(encoded);
    } catch (err) {
      setResult(null);
      if (err instanceof SnapshotTooLargeError) {
        setOversizedInfo({ urlLength: err.urlLength, maxLength: err.maxLength });
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to encrypt snapshot.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg("Could not copy automatically. Please select and copy the link manually.");
    }
  };

  const handleClose = () => {
    setResult(null);
    setErrorMsg(null);
    setOversizedInfo(null);
    setCopied(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share your repository knowledge"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg bg-surface border border-border rounded-2xl shadow-xl overflow-hidden text-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0 mt-0.5">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold text-text">
                Share your repository knowledge
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Create an encrypted, read-only snapshot that anyone can explore using a single link.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close share dialog"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-alt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-surface-alt/70 border border-border">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Repository
              </div>
              <div className="font-mono font-medium text-text mt-0.5 truncate">
                {snapshotInput.repoStatus.owner}/{snapshotInput.repoStatus.name}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-alt/70 border border-border">
              <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Snapshot Size
              </div>
              <div className="font-mono font-medium text-text mt-0.5">
                {result
                  ? `${(result.compressedBytes / 1024).toFixed(1)} KB compressed (${result.urlLength.toLocaleString()} chars)`
                  : previewStats
                    ? `~${previewStats.rawKb} KB uncompressed`
                    : "Unavailable"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-alt/70 border border-border flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-accent shrink-0" />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  Encryption
                </div>
                <div className="font-medium text-text">AES-256-GCM (Local)</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface-alt/70 border border-border flex items-center gap-2">
              <Eye className="w-3.5 h-3.5 text-accent shrink-0" />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                  Access Mode
                </div>
                <div className="font-medium text-text">Read-Only Snapshot</div>
              </div>
            </div>
          </div>

          {/* Included Sections */}
          <div className="p-3.5 rounded-xl bg-bg border border-border space-y-2 text-xs">
            <div className="font-medium text-text">Included analysis sections</div>
            <ul className="grid grid-cols-2 gap-1.5 text-text-muted">
              <li>• File explorer tree</li>
              <li>• Dependency graph</li>
              <li>• Language statistics</li>
              <li>
                • {previewStats?.explanationCount ?? 0} mentor explanations &amp;{" "}
                {previewStats?.citationCount ?? 0} citations
              </li>
            </ul>

            <label className="flex items-center gap-2 pt-2 border-t border-border/70 text-text cursor-pointer">
              <input
                type="checkbox"
                checked={includeOpenFiles}
                onChange={(e) => {
                  setIncludeOpenFiles(e.target.checked);
                  setResult(null);
                  setErrorMsg(null);
                  setOversizedInfo(null);
                }}
                className="rounded border-border accent-accent"
              />
              <span>Include currently open file snippets (increases link size)</span>
            </label>
          </div>

          {/* Browser Compatibility Warning */}
          {!browserSupported && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Your browser does not support Web Crypto AES-GCM or CompressionStream gzip.
              </span>
            </div>
          )}

          {/* Error / Oversized Warning */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300 space-y-1">
              <div className="font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  {oversizedInfo ? "Snapshot too large for URL sharing" : "Could not generate link"}
                </span>
              </div>
              <p>{errorMsg}</p>
              {oversizedInfo && (
                <p className="opacity-85">
                  Try unchecking open file snippets. Snapshots are never uploaded to a server.
                </p>
              )}
            </div>
          )}

          {/* Generated Link Output */}
          {result && (
            <div className="space-y-2.5 p-3.5 rounded-xl bg-accent-soft border border-accent/30">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-accent flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  Encrypted link ready
                </span>
                <span className="font-mono text-[11px] text-text-muted">
                  {result.urlLength.toLocaleString()} chars
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={result.url}
                  aria-label="Generated encrypted snapshot URL"
                  onFocus={(e) => e.target.select()}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-surface border border-border font-mono text-[11px] text-text focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy Link"}
                </button>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-text-muted pt-1">
                <ShieldAlert className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                <span>
                  Anyone possessing the complete link can decrypt and view this snapshot. The key stays in the URL fragment and is never sent to any server.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border bg-surface-alt/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="px-3.5 py-2 rounded-lg text-xs border border-border bg-surface hover:bg-surface-alt transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !browserSupported || !previewStats}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-accent hover:bg-accent-hover text-white disabled:opacity-50 transition-colors"
          >
            {isGenerating ? "Encrypting..." : result ? "Regenerate Link" : "Generate Share Link"}
          </button>
        </div>
      </div>
    </div>
  );
};


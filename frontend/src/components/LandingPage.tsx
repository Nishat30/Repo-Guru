import React, { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileCode2,
  GitBranch,
  Github,
  Languages,
  Loader2,
  Network,
  X,
} from "lucide-react";
import { RepoStatus } from "../types";
import { HeroDashboardPreview } from "./HeroDashboardPreview";

gsap.registerPlugin(ScrollTrigger);

export interface RecentWorkspaceSummary {
  repoId: string;
  owner: string;
  name: string;
}

interface LandingPageProps {
  repoUrl: string;
  onChangeRepoUrl: (url: string) => void;
  onSubmitRepo: (e: React.FormEvent) => void;
  isSubmittingUrl: boolean;
  repoStatus: RepoStatus | null;
  ingestError: string | null;
  recentWorkspaces: RecentWorkspaceSummary[];
  maxWorkspaces: number;
  onSelectRecent: (repoId: string) => void;
  onDeleteRecent: (repoId: string) => void;
}

const EXAMPLE_REPOS = [
  { label: "pallets/flask", url: "https://github.com/pallets/flask" },
  { label: "fastapi/fastapi", url: "https://github.com/fastapi/fastapi" },
];

const INGEST_STEPS = [
  { key: "cloning", label: "Cloning" },
  { key: "parsing", label: "Parsing" },
  { key: "building_graph", label: "Building graph" },
  { key: "indexing", label: "Indexing" },
];

function getStepState(currentStatus: string, stepKey: string): "done" | "active" | "pending" {
  const order = ["queued", "cloning", "parsing", "building_graph", "indexing", "ready"];
  const curIdx = order.indexOf(currentStatus);
  const stepIdx = order.indexOf(stepKey);
  if (curIdx > stepIdx || currentStatus === "ready") return "done";
  if (curIdx === stepIdx) return "active";
  return "pending";
}

const CAPABILITIES = [
  {
    title: "AST + Hybrid RAG",
    desc: "Tree-sitter syntax blocks fused with Qdrant & BM25.",
    icon: <BookOpen className="w-4 h-4" />,
  },
  {
    title: "Verified Line Citations",
    desc: "Clickable file:start-end badges verified on disk.",
    icon: <FileCode2 className="w-4 h-4" />,
  },
  {
    title: "Dependency Mapping",
    desc: "Cross-file import graphs built with NetworkX.",
    icon: <Network className="w-4 h-4" />,
  },
  {
    title: "English & Hinglish AI Mentor",
    desc: "Conversational guidance keeping every symbol exact.",
    icon: <Languages className="w-4 h-4" />,
  },
];

const FEATURE_CARDS = [
  {
    tag: "01 · Code Intelligence",
    title: "Syntactic AST Chunking",
    desc: "Instead of blind text splitting, RepoGuru parses functions, classes, and interfaces across Python, JS/TS, Go, Java, and C++ with exact 1-indexed line coordinates.",
  },
  {
    tag: "02 · Grounded Verification",
    title: "Zero-Hallucination Citations",
    desc: "A dedicated verifier checks every cited file path and line range against the cloned repository before streaming—clicking a badge scrolls straight to the source.",
  },
  {
    tag: "03 · Architectural Clarity",
    title: "Module Dependency Graphs",
    desc: "Surface the core hub modules and trace how routes, middleware, and services connect before you write your first pull request.",
  },
  {
    tag: "04 · Bilingual Mentoring",
    title: "Learn in English or Hinglish",
    desc: "Built for GSoC contributors and open-source engineers: switch languages anytime without losing technical precision.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Discover your repository.",
    desc: "Paste any public GitHub URL. RepoGuru safely shallow-clones the codebase, parses ASTs, and indexes symbols in seconds.",
  },
  {
    step: "02",
    title: "Explore its architecture.",
    desc: "Navigate the keyboard-friendly file explorer, inspect dependency hubs, and search across definitions.",
  },
  {
    step: "03",
    title: "Learn with your AI mentor.",
    desc: "Ask high-level or line-by-line questions and follow verified citation badges straight to the lines you need to patch.",
  },
];

const AMBIENT_DUST = [
  { top: "14%", left: "12%", size: 11, glyph: "✦" },
  { top: "24%", left: "84%", size: 12, glyph: "✦" },
  { top: "38%", left: "18%", size: 9, glyph: "•" },
  { top: "18%", left: "70%", size: 10, glyph: "✦" },
  { top: "44%", left: "80%", size: 9, glyph: "•" },
  { top: "30%", left: "28%", size: 10, glyph: "✦" },
  { top: "16%", left: "42%", size: 8, glyph: "•" },
  { top: "48%", left: "10%", size: 11, glyph: "✦" },
  { top: "40%", left: "90%", size: 10, glyph: "✦" },
  { top: "26%", left: "62%", size: 8, glyph: "•" },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  repoUrl,
  onChangeRepoUrl,
  onSubmitRepo,
  isSubmittingUrl,
  repoStatus,
  ingestError,
  recentWorkspaces,
  maxWorkspaces,
  onSelectRecent,
  onDeleteRecent,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroInputRef = useRef<HTMLInputElement>(null);
  const dustLayerRef = useRef<HTMLDivElement>(null);
  const lastSparkRef = useRef<number>(0);
  const [useFallbackPreview, setUseFallbackPreview] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || !rootRef.current) return;

    const ctx = gsap.context(() => {
      // Initial hero entrance
      gsap.from(".hero-nav", {
        opacity: 0,
        y: -12,
        duration: 0.55,
        ease: "power2.out",
      });

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".hero-eyebrow", { opacity: 0, y: 16, duration: 0.5 })
        .from(".hero-headline", { opacity: 0, y: 26, duration: 0.65 }, "-=0.3")
        .from(".hero-desc", { opacity: 0, y: 18, duration: 0.55 }, "-=0.35")
        .from(".hero-input-wrap", { opacity: 0, y: 18, duration: 0.55 }, "-=0.3")
        .from(".hero-chip", { opacity: 0, y: 10, stagger: 0.08, duration: 0.4 }, "-=0.25");

      // Ambient antique gold dust in hero sky
      gsap.utils.toArray<HTMLElement>(".hero-dust").forEach((el, idx) => {
        gsap.fromTo(
          el,
          { opacity: 0.35, y: 0, scale: 0.85, rotation: 0 },
          {
            opacity: 0.95,
            scale: 1.2,
            y: idx % 2 === 0 ? -20 : -12,
            x: idx % 2 === 0 ? 10 : -10,
            rotation: idx % 2 === 0 ? 45 : -45,
            duration: 2.6 + (idx % 4) * 0.6,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
          }
        );
      });

      // Subtle scroll parallax on the light grid background
      gsap.to(".landing-grid", {
        y: 45,
        ease: "none",
        scrollTrigger: {
          trigger: rootRef.current,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
        },
      });

      // Terminal showcase outer container entrance (settle with clearProps so text stays razor-sharp)
      gsap.from(".terminal-showcase", {
        opacity: 0,
        y: 22,
        duration: 0.65,
        delay: 0.35,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });

      // Capabilities strip staggered reveal
      gsap.from(".cap-card", {
        opacity: 0,
        y: 22,
        stagger: 0.1,
        duration: 0.55,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".capabilities-strip",
          start: "top 86%",
          once: true,
        },
      });

      // Features heading + staggered cards
      gsap.from(".features-heading", {
        opacity: 0,
        y: 20,
        duration: 0.55,
        ease: "power2.out",
        scrollTrigger: {
          trigger: "#features",
          start: "top 86%",
          once: true,
        },
      });
      gsap.from(".feature-card", {
        opacity: 0,
        y: 28,
        scale: 0.97,
        stagger: 0.12,
        duration: 0.6,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ".features-grid",
          start: "top 86%",
          once: true,
        },
      });

      // How It Works timeline: heading + drawing gold line + staggered steps
      const howTl = gsap.timeline({
        scrollTrigger: {
          trigger: "#how-it-works",
          start: "top 82%",
          once: true,
        },
      });
      howTl
        .from(".how-heading", { opacity: 0, y: 20, duration: 0.5, ease: "power2.out" })
        .from(
          ".how-connector",
          { scaleX: 0, transformOrigin: "left center", duration: 0.75, ease: "power2.inOut" },
          "-=0.2"
        )
        .from(
          ".how-step",
          { opacity: 0, y: 28, scale: 0.95, stagger: 0.18, duration: 0.6, ease: "power2.out" },
          "-=0.5"
        );

      // Final CTA + Footer reveals
      gsap.fromTo(
        ".cta-item",
        { opacity: 0, y: 22 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.1,
          duration: 0.55,
          ease: "power2.out",
          clearProps: "transform,opacity",
          scrollTrigger: {
            trigger: "#documentation",
            start: "top 92%",
            once: true,
          },
        }
      );
      gsap.fromTo(
        ".landing-footer",
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: "power2.out",
          clearProps: "transform,opacity",
          scrollTrigger: {
            trigger: ".landing-footer",
            start: "top 98%",
            once: true,
          },
        }
      );

      // Refresh ScrollTrigger measurements after initial paint
      requestAnimationFrame(() => ScrollTrigger.refresh());
    }, rootRef);

    return () => ctx.revert();
  }, []);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const now = performance.now();
    if (now - lastSparkRef.current < 45) return;
    lastSparkRef.current = now;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const layer = dustLayerRef.current;
    if (!layer) return;

    const rect = layer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (y < 0 || y > rect.height) return;

    const spark = document.createElement("span");
    spark.textContent = Math.random() > 0.4 ? "✦" : "•";
    spark.style.position = "absolute";
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    spark.style.pointerEvents = "none";
    spark.style.color = Math.random() > 0.25 ? "#9A722E" : "#4A1728";
    spark.style.fontSize = `${9 + Math.floor(Math.random() * 6)}px`;
    spark.style.lineHeight = "1";
    spark.style.userSelect = "none";
    layer.appendChild(spark);

    gsap.fromTo(
      spark,
      { opacity: 0.95, scale: 0.6, x: 0, y: 0, rotation: 0 },
      {
        opacity: 0,
        scale: 1.3,
        x: (Math.random() - 0.5) * 28,
        y: -22 - Math.random() * 18,
        rotation: (Math.random() - 0.5) * 80,
        duration: 0.9,
        ease: "power2.out",
        onComplete: () => spark.remove(),
      }
    );
  };

  const focusHeroInput = () => {
    heroInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => heroInputRef.current?.focus(), 200);
  };

  return (
    <div
      ref={rootRef}
      style={
        {
          "--bg": "#F3EBDD",
          "--surface": "#FFFDF8",
          "--surface-alt": "#EAE0CF",
          "--border": "#DCCDB8",
          "--text": "#321C25",
          "--text-muted": "#77695D",
          "--accent": "#4A1728",
          "--accent-hover": "#38101E",
          "--gold": "#B9914D",
          "--forest": "#182B24",
        } as React.CSSProperties
      }
      className="min-h-screen flex flex-col bg-[#F3EBDD] text-[#321C25] relative overflow-x-hidden"
    >
      {/* Subtle Light Grid & Parchment Texture */}
      <div
        className="landing-grid pointer-events-none fixed inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(185,145,77,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(185,145,77,0.12) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          maskImage: "radial-gradient(ellipse 85% 75% at 50% 18%, black 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 75% at 50% 18%, black 35%, transparent 100%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(185,145,77,0.14), transparent 72%)",
        }}
        aria-hidden="true"
      />

      {/* Ambient Hero Gold Dust (Hero Only, Never Over Terminal) */}
      <div
        ref={dustLayerRef}
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px] overflow-hidden z-0"
        aria-hidden="true"
      >
        {AMBIENT_DUST.map((d, idx) => (
          <span
            key={idx}
            className="hero-dust absolute text-[#9A722E] select-none"
            style={{
              top: d.top,
              left: d.left,
              fontSize: `${d.size}px`,
              lineHeight: 1,
            }}
          >
            {d.glyph}
          </span>
        ))}
      </div>

      {/* Minimal Sticky Light Navigation (No Theme Toggle) */}
      <header className="hero-nav sticky top-0 z-40 border-b border-[#DCCDB8]/85 bg-[#F3EBDD]/90 backdrop-blur-md">
        <nav
          aria-label="Primary navigation"
          className="max-w-6xl mx-auto px-4 sm:px-6 h-15 py-3 flex items-center justify-between gap-4"
        >
          <a href="#" className="flex items-center gap-2.5 shrink-0">
            <img
              src="/favicon.svg"
              alt="RepoGuru"
              className="w-8 h-8 rounded-lg border border-[#DCCDB8]"
            />
            <span className="font-serif text-2xl font-semibold tracking-tight text-[#321C25]">
              RepoGuru
            </span>
          </a>

          <div className="hidden md:flex items-center gap-7 text-sm font-medium text-[#77695D]">
            <a href="#product" className="hover:text-[#321C25] transition-colors">
              Product
            </a>
            <a href="#features" className="hover:text-[#321C25] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#321C25] transition-colors">
              How it works
            </a>
            <a href="#documentation" className="hover:text-[#321C25] transition-colors">
              Documentation
            </a>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://github.com/Nishat30/Repo-Guru"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#77695D] hover:text-[#321C25] transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <button
              type="button"
              onClick={focusHeroInput}
              className="px-4 py-2 rounded-lg bg-[#4A1728] hover:bg-[#38101E] text-[#FFFDF8] text-xs font-medium border border-[#B9914D]/35 transition-colors"
            >
              Get Started
            </button>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1">
        {/* Centered Revolte-Inspired Hero */}
        <section
          onMouseMove={handleHeroMouseMove}
          className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-10 text-center"
        >
          <div className="hero-eyebrow inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#B9914D]/55 bg-[#FFFDF8]/85 font-mono text-[11px] uppercase tracking-[0.15em] text-[#77695D] mb-5">
            <span className="text-[#4A1728]">✦</span>
            <span>AI CODEBASE INTELLIGENCE</span>
          </div>

          <h1 className="hero-headline font-serif text-4xl sm:text-5xl lg:text-[62px] font-semibold tracking-tight leading-[1.08] text-[#4A1728] max-w-4xl mx-auto">
            Every codebase has a story.
            <span className="block text-[#B9914D] mt-1">Discover yours.</span>
          </h1>

          <p className="hero-desc mt-4 text-sm sm:text-base text-[#77695D] max-w-2xl mx-auto leading-relaxed">
            Explore unfamiliar repositories, uncover hidden architecture, trace dependencies, and learn directly from your bilingual AI senior mentor.
          </p>

          {/* Centered Repository URL Input */}
          <form onSubmit={onSubmitRepo} className="hero-input-wrap mt-7 max-w-2xl mx-auto space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-xl bg-[#FFFDF8] border border-[#B9914D]/50 shadow-[0_10px_30px_rgba(50,28,37,0.08)] focus-within:border-[#4A1728] focus-within:ring-2 focus-within:ring-[#B9914D]/30 transition-all">
              <div className="flex items-center gap-2.5 flex-1 px-3">
                <Github className="w-4 h-4 text-[#77695D] shrink-0" />
                <input
                  ref={heroInputRef}
                  type="url"
                  required
                  value={repoUrl}
                  onChange={(e) => onChangeRepoUrl(e.target.value)}
                  placeholder="Paste a public GitHub repository URL..."
                  aria-label="Public GitHub repository URL"
                  className="w-full py-2 bg-transparent text-sm text-[#321C25] placeholder:text-[#77695D]/80 focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingUrl || (!!repoStatus && repoStatus.status !== "failed")}
                className="px-5 py-2.5 rounded-lg bg-[#4A1728] hover:bg-[#38101E] text-[#FFFDF8] text-xs sm:text-sm font-medium border border-[#B9914D]/35 disabled:opacity-50 transition-colors shrink-0 inline-flex items-center justify-center gap-2"
              >
                <span>{isSubmittingUrl ? "Starting..." : "Analyze Repository"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Example Chips & Recent Repos */}
            {!repoStatus && (
              <div className="flex flex-col items-center gap-2 pt-1 text-xs text-[#77695D]">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span>Try:</span>
                  {EXAMPLE_REPOS.map((ex) => (
                    <button
                      key={ex.url}
                      type="button"
                      onClick={() => onChangeRepoUrl(ex.url)}
                      className="hero-chip px-2.5 py-1 rounded-md font-mono text-[11px] bg-[#FFFDF8] border border-[#DCCDB8] hover:border-[#B9914D] text-[#321C25] transition-colors"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                {recentWorkspaces.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span>
                      Recent ({recentWorkspaces.length}/{maxWorkspaces}):
                    </span>
                    {recentWorkspaces.map((w) => (
                      <div
                        key={w.repoId}
                        className="inline-flex items-center rounded-md bg-[#FFFDF8] border border-[#B9914D]/45 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectRecent(w.repoId)}
                          className="px-2.5 py-0.5 font-mono text-[11px] text-[#321C25] hover:bg-[#4A1728] hover:text-[#FFFDF8] transition-colors"
                        >
                          {w.owner}/{w.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecent(w.repoId)}
                          title={`Remove ${w.owner}/${w.name}`}
                          aria-label={`Remove ${w.owner}/${w.name}`}
                          className="px-1.5 py-0.5 text-[#77695D] hover:text-white hover:bg-red-700 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Error Banner */}
            {(ingestError || repoStatus?.status === "failed") && (
              <div className="mt-3 flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-left text-sm text-red-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium">Ingestion failed</div>
                  <div className="text-xs opacity-90 mt-0.5">
                    {ingestError || repoStatus?.error_message}
                  </div>
                </div>
              </div>
            )}

            {/* Live Progress Stepper */}
            {repoStatus && repoStatus.status !== "failed" && (
              <div className="mt-4 p-4 rounded-xl bg-[#FFFDF8] border border-[#B9914D]/45 text-left space-y-3 shadow-sm">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-medium text-[#321C25]">
                    {repoStatus.owner}/{repoStatus.name}
                  </span>
                  <span className="text-[#77695D]">{repoStatus.progress}%</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {INGEST_STEPS.map((step) => {
                    const st = getStepState(repoStatus.status, step.key);
                    return (
                      <div
                        key={step.key}
                        className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border text-xs transition-colors ${
                          st === "done"
                            ? "bg-[#4A1728]/10 border-[#B9914D]/45 text-[#321C25]"
                            : st === "active"
                              ? "bg-[#EAE0CF] border-[#4A1728] text-[#4A1728] font-medium"
                              : "bg-[#F3EBDD] border-[#DCCDB8] text-[#77695D]"
                        }`}
                      >
                        {st === "done" ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#B9914D]" />
                        ) : st === "active" ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#4A1728]" />
                        ) : (
                          <span className="w-3.5 h-3.5 rounded-full border border-[#DCCDB8]" />
                        )}
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-[#77695D] text-center">{repoStatus.step_message}</p>
              </div>
            )}
          </form>

          {/* Dark Terminal Screenshot in MacBook Mockup Directly Below Hero */}
          <div id="product" className="terminal-showcase mt-10 sm:mt-12 max-w-[920px] mx-auto px-2 sm:px-4">
            {!useFallbackPreview ? (
              <div className="relative">
                {/* MacBook Lid / Bezel */}
                <div className="rounded-t-2xl bg-[#121318] p-2 sm:p-3 pt-4 sm:pt-5 border border-[#2D2E38] shadow-[0_26px_65px_rgba(50,28,37,0.22)] relative">
                  {/* Camera Dot */}
                  <div
                    aria-hidden="true"
                    className="absolute top-1.5 sm:top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#242630] border border-[#353744]"
                  />
                  <div className="rounded-lg overflow-hidden bg-[#171923]">
                    <img
                      src="/terminal-preview.svg"
                      alt="RepoGuru dark repository analysis workspace"
                      className="w-full h-auto object-contain block"
                      onError={() => setUseFallbackPreview(true)}
                    />
                  </div>
                </div>
                {/* MacBook Base Lip */}
                <div
                  aria-hidden="true"
                  className="relative h-3 sm:h-4 w-[104%] -ml-[2%] rounded-b-xl bg-gradient-to-b from-[#DCD6CA] via-[#BDB6A9] to-[#948D81] border border-[#A8A194] shadow-md"
                >
                  <div className="mx-auto w-16 sm:w-24 h-1 sm:h-1.5 rounded-b-md bg-[#8E877B]/70" />
                </div>
              </div>
            ) : (
              <HeroDashboardPreview />
            )}
          </div>
        </section>

        {/* Capabilities Strip */}
        <section className="capabilities-strip border-y border-[#DCCDB8] bg-[#FFFDF8]/70 py-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CAPABILITIES.map((cap) => (
              <div key={cap.title} className="cap-card flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#4A1728]/10 border border-[#B9914D]/35 text-[#4A1728] flex items-center justify-center shrink-0">
                  {cap.icon}
                </div>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-[#321C25]">{cap.title}</h2>
                  <p className="text-xs text-[#77695D] leading-relaxed mt-0.5">{cap.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 space-y-10">
          <div className="features-heading text-center max-w-2xl mx-auto space-y-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#77695D]">
              ✦ ARCHIVAL INTELLIGENCE
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#321C25]">
              Built for serious codebase exploration
            </h2>
          </div>

          <div className="features-grid grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURE_CARDS.map((card) => (
              <article
                key={card.title}
                className="feature-card p-6 rounded-xl bg-[#FFFDF8] border border-[#DCCDB8] hover:border-[#B9914D] transition-colors space-y-2.5 shadow-sm"
              >
                <div className="font-mono text-[11px] uppercase tracking-wider text-[#4A1728]">
                  {card.tag}
                </div>
                <h3 className="font-serif text-2xl font-semibold text-[#321C25]">{card.title}</h3>
                <p className="text-sm text-[#77695D] leading-relaxed">{card.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* How It Works Timeline */}
        <section id="how-it-works" className="border-y border-[#DCCDB8] bg-[#FFFDF8]/55 py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-12">
            <div className="how-heading text-center space-y-2">
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#77695D]">
                ✦ THREE-STEP METHOD
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#321C25]">
                How it works
              </h2>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                aria-hidden="true"
                className="how-connector hidden md:block absolute top-6 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[#B9914D]/60 to-transparent"
              />
              {HOW_IT_WORKS.map((item) => (
                <div key={item.step} className="how-step relative flex flex-col items-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#FFFDF8] border border-[#B9914D]/65 flex items-center justify-center font-mono text-xs font-semibold text-[#4A1728] shadow-sm z-10">
                    {item.step}
                  </div>
                  <h3 className="font-serif text-xl font-semibold text-[#321C25]">
                    {item.step} — {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#77695D] leading-relaxed max-w-xs">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section id="documentation" className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center space-y-5">
          <div className="cta-item inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#77695D]">
            <GitBranch className="w-3.5 h-3.5 text-[#B9914D]" />
            <span>USE IT FOR YOUR GSOC &amp; OPEN-SOURCE REPOS</span>
          </div>

          <h2 className="cta-item font-serif text-3xl sm:text-4xl font-semibold text-[#4A1728] leading-tight">
            Every great contribution begins with understanding.
          </h2>
          <p className="cta-item text-sm sm:text-base text-[#77695D] max-w-xl mx-auto">
            Enter a repository. Discover how it works. Find where you belong.
          </p>

          <form onSubmit={onSubmitRepo} className="cta-item max-w-xl mx-auto pt-1">
            <div className="flex flex-col sm:flex-row gap-2 p-1.5 rounded-xl bg-[#FFFDF8] border border-[#B9914D]/50 shadow-sm focus-within:border-[#4A1728]">
              <input
                type="url"
                required
                value={repoUrl}
                onChange={(e) => onChangeRepoUrl(e.target.value)}
                placeholder="Paste a public GitHub repository URL..."
                aria-label="Repository URL"
                className="flex-1 px-3 py-2 bg-transparent text-sm text-[#321C25] placeholder:text-[#77695D]/80 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isSubmittingUrl || (!!repoStatus && repoStatus.status !== "failed")}
                className="px-4 py-2 rounded-lg bg-[#4A1728] hover:bg-[#38101E] text-[#FFFDF8] text-xs sm:text-sm font-medium border border-[#B9914D]/35 disabled:opacity-50 transition-colors shrink-0"
              >
                Analyze Repository
              </button>
            </div>
          </form>
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="landing-footer relative z-10 border-t border-[#DCCDB8] bg-[#FFFDF8]/75">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#77695D]">
          <div className="flex items-center gap-2.5">
            <img
              src="/favicon.svg"
              alt="RepoGuru"
              className="w-6 h-6 rounded-md border border-[#DCCDB8]"
            />
            <span className="font-serif text-base font-semibold text-[#321C25]">RepoGuru</span>
            <span>·</span>
            <span>AI Codebase Intelligence</span>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <a href="#product" className="hover:text-[#321C25] transition-colors">
              Product
            </a>
            <a href="#features" className="hover:text-[#321C25] transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-[#321C25] transition-colors">
              How it works
            </a>
            <a href="#documentation" className="hover:text-[#321C25] transition-colors">
              Documentation
            </a>
            <a
              href="https://github.com/Nishat30/Repo-Guru"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-[#321C25] transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

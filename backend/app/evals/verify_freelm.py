"""Verification script for freelm integration: prints llm.health() and a test prompt response."""

import asyncio
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core import llm


async def main() -> int:
    print("== llm.health() ==")
    print(json.dumps(llm.health(), indent=2, default=str))

    if not llm.has_llm_credentials():
        print(
            "\nNo free-tier API keys are set in environment or backend/.env.\n"
            "Add at least one optional key to backend/.env to test live inference:\n"
            "  OPENROUTER_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY, GROQ_API_KEY, "
            "CEREBRAS_API_KEY, or MISTRAL_API_KEY\n"
            "(Or set FREELM_KEYLESS=1 to test keyless public endpoints.)"
        )
        return 0

    print("\n== Sending test prompt via freelm (model='chat:fast') ==")
    try:
        resp = await llm.ask_response(
            "Reply with one short sentence confirming freelm is working.",
            model="chat:fast",
        )
        text = resp.choices[0].message.content if resp.choices else ""
        print(f"provider:   {resp.provider}")
        print(f"model:      {resp.model}")
        print(f"latency_ms: {resp.latency_ms}")
        print(f"reply:      {text}")
    except RuntimeError as exc:
        print(f"Handled error: {exc}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))


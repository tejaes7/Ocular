"""FastAPI service.

Contract: docs/API.md. Callers are the extension and (later) the backend worker.

Design rule: **this service must always answer.** If a model is missing, failing
or slow, fall back to the baseline rather than returning an error — the caller
treats a 5xx as "AI is broken" and hides the feature, which is worse for the user
than a slightly blunter verdict.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import baseline
from .features import extract_features
from .schemas import ExtractRequest, ExtractResponse, VerdictRequest, VerdictResponse

log = logging.getLogger("ocular_ai")

app = FastAPI(title="Ocular AI", version="0.1.0")

# The extension calls from a service worker, so it needs permissive CORS.
# Tighten to the published extension ID once there is one.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ocular-ai", "model": "baseline-v1"}


@app.post("/verdict", response_model=VerdictResponse)
def verdict(request: VerdictRequest) -> dict:
    """Is this a good price? See baseline.judge for the current logic.

    TODO(sathwik): once a trained model exists, try it here and fall back to the
    baseline on any exception or low-confidence output. Keep the baseline call —
    do not replace it.
    """
    history = [point.model_dump() for point in request.history]

    try:
        features = extract_features(history)
    except ValueError:
        return {
            "verdict": "neutral",
            "confidence": "low",
            "reasoning": "Not enough price history yet to judge.",
            "fairPrice": None,
            "model": "baseline-v1",
        }

    return baseline.judge(features)


@app.post("/extract", response_model=ExtractResponse)
def extract(request: ExtractRequest) -> dict:
    """Last-resort price extraction from a trimmed DOM snippet.

    Reached only when all four deterministic rungs in @ocular/shared/extract
    have missed, which is rare. Lower priority than /verdict.

    TODO(sathwik): implement. Until then this 501s rather than guessing — a wrong
    price is far worse than no price, because it poisons the stored history and
    fires a bogus "lowest ever" alert.
    """
    from fastapi import HTTPException

    log.info("extract requested for %s (%d chars)", request.url, len(request.snippet))
    raise HTTPException(status_code=501, detail="Extraction model not implemented yet")

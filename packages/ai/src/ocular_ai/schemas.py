"""Request/response models.

These MUST stay in step with docs/API.md and with the extension's client in
packages/extension/src/lib/ai.js. Changing a field name here is a breaking
change for two other people — bump the version and say so in the PR.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PricePoint(BaseModel):
    ts: int = Field(..., description="Unix epoch milliseconds")
    price: float
    inStock: bool = True
    lastSeen: int | None = None


class VerdictRequest(BaseModel):
    history: list[PricePoint] = Field(..., min_length=1)
    currency: str = "INR"
    title: str | None = None


class VerdictResponse(BaseModel):
    verdict: Literal["buy_now", "wait", "neutral"]
    confidence: Literal["low", "medium", "high"]
    reasoning: str
    fairPrice: float | None = None
    model: str


class ExtractRequest(BaseModel):
    # A TRIMMED snippet from buildPriceSnippet(), never raw HTML. Raw pages are
    # ~2 MB; the snippet is ~2 KB and gives better answers.
    snippet: str = Field(..., max_length=20_000)
    url: str


class ExtractResponse(BaseModel):
    price: float
    currency: str = "INR"
    inStock: bool = True
    # Cached per hostname by the extension, so a site costs one inference ever.
    selector: str | None = None
    confidence: Literal["low", "medium", "high"]
    model: str

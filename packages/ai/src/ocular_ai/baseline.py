"""Deterministic baseline.

This exists so the service can answer correctly on day one, before any model is
trained, and so a model outage degrades to "slightly worse answers" rather than
"the feature is down".

Two rules that matter more than any model:

  1. Judge against the 90-day **median**, never the retailer's M.R.P. The listed
     M.R.P. is frequently fictional; the median is what people actually paid.
  2. Distrust a discount that follows a price spike. See `spike_before_drop` in
     features.py.

Any trained model must beat this on the eval set to be worth deploying.
"""

from __future__ import annotations

from .features import PriceFeatures

# A drop this far below the usual price is a genuinely good moment to buy.
GOOD_DEAL_PCT = -8.0
# Above the usual price by this much: actively wait.
OVERPRICED_PCT = 4.0
# A recent peak this far above the usual price makes any "discount" suspect.
FAKE_SALE_PCT = 18.0

MIN_POINTS_FOR_CONFIDENCE = 8
MIN_DAYS_FOR_CONFIDENCE = 14.0


def judge(f: PriceFeatures) -> dict:
    """Return the /verdict response body. Never raises."""
    confidence = _confidence(f)

    # Fake-sale check runs first: it overrides an apparently good price.
    if f.spike_before_drop >= FAKE_SALE_PCT and f.pct_from_median > GOOD_DEAL_PCT:
        return _result(
            "wait",
            confidence,
            "The price was recently inflated, so this discount is measured against a "
            "temporary high rather than what the product usually costs.",
            f.median_90d,
        )

    if f.pct_from_median <= GOOD_DEAL_PCT:
        at_low = f.pct_from_min <= 1.0
        reason = (
            "At its lowest observed price."
            if at_low
            else f"About {abs(f.pct_from_median):.0f}% below its usual price."
        )
        return _result("buy_now", confidence, reason, f.median_90d)

    if f.pct_from_median >= OVERPRICED_PCT:
        return _result(
            "wait",
            confidence,
            f"Currently around {f.pct_from_median:.0f}% above its usual price.",
            f.median_90d,
        )

    return _result(
        "neutral",
        confidence,
        "Close to its usual price — no particular reason to rush or wait.",
        f.median_90d,
    )


def _confidence(f: PriceFeatures) -> str:
    """Confidence is about how much history we have, not how sure the rule is.

    Three readings over two days cannot support a strong claim no matter how
    clean the signal looks.
    """
    if f.n_points < 4 or f.days_tracked < 3:
        return "low"
    if f.n_points >= MIN_POINTS_FOR_CONFIDENCE and f.days_tracked >= MIN_DAYS_FOR_CONFIDENCE:
        # Very jumpy series still don't support a confident call.
        return "medium" if f.volatility > 0.25 else "high"
    return "medium"


def _result(verdict: str, confidence: str, reasoning: str, fair_price: float) -> dict:
    return {
        "verdict": verdict,
        "confidence": confidence,
        "reasoning": reasoning,
        "fairPrice": round(fair_price, 2),
        "model": "baseline-v1",
    }

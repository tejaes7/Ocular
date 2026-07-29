"""Feature extraction from a price series.

Used at BOTH training and serving time. That is the whole point of this module:
if training features and serving features are computed differently, the model
scores well offline and behaves badly in production, and the mismatch is very
hard to spot. Import from here in both places; never reimplement.

A "point" is one reading, matching the extension's storage format:

    {"ts": 1769000000000, "lastSeen": ..., "price": 4499.0, "inStock": true}
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from statistics import median, pstdev

DAY_MS = 24 * 60 * 60 * 1000


@dataclass(frozen=True)
class PriceFeatures:
    """Everything the verdict model sees. Keep this stable — it is the schema."""

    current: float
    minimum: float
    maximum: float
    median_all: float
    median_90d: float

    # Relative position: what actually decides "is this a good price".
    pct_from_median: float
    pct_from_min: float
    pct_from_max: float

    days_tracked: float
    days_since_min: float
    n_points: int

    volatility: float          # stdev / median, so it's comparable across price ranges
    recent_trend: float        # % change over the last third of the series
    spike_before_drop: float   # evidence of a pre-sale price hike
    out_of_stock_ratio: float

    def to_dict(self) -> dict:
        return asdict(self)


def _pct(value: float, reference: float) -> float:
    if not reference:
        return 0.0
    return (value - reference) / reference * 100.0


def extract_features(history: list[dict], now_ms: int | None = None) -> PriceFeatures:
    """Compute the feature vector for one product's price history.

    Raises ValueError on an empty series — callers should fall back to the
    baseline's "neutral, low confidence" answer rather than fabricating features.
    """
    points = [p for p in history if isinstance(p.get("price"), (int, float)) and p["price"] > 0]
    if not points:
        raise ValueError("empty price history")

    points.sort(key=lambda p: p["ts"])
    prices = [float(p["price"]) for p in points]
    now = now_ms if now_ms is not None else points[-1]["ts"]

    current = prices[-1]
    minimum, maximum = min(prices), max(prices)
    med_all = median(prices)

    cutoff = now - 90 * DAY_MS
    recent = [float(p["price"]) for p in points if p.get("lastSeen", p["ts"]) >= cutoff]
    # Fall back to the whole series so a dormant product still gets a usual price.
    med_90 = median(recent or prices)

    span_ms = points[-1]["ts"] - points[0]["ts"]
    min_index = prices.index(minimum)

    # Volatility as a coefficient of variation: a ₹200 swing means something very
    # different on a ₹500 product than on a ₹90,000 one.
    volatility = (pstdev(prices) / med_all) if len(prices) > 1 and med_all else 0.0

    tail = prices[max(1, (len(prices) * 2) // 3):] or prices[-1:]
    recent_trend = _pct(tail[-1], tail[0])

    return PriceFeatures(
        current=current,
        minimum=minimum,
        maximum=maximum,
        median_all=med_all,
        median_90d=med_90,
        pct_from_median=_pct(current, med_90),
        pct_from_min=_pct(current, minimum),
        pct_from_max=_pct(current, maximum),
        days_tracked=span_ms / DAY_MS,
        days_since_min=(now - points[min_index]["ts"]) / DAY_MS,
        n_points=len(points),
        volatility=volatility,
        recent_trend=recent_trend,
        spike_before_drop=_spike_before_drop(prices, med_90),
        out_of_stock_ratio=sum(1 for p in points if p.get("inStock") is False) / len(points),
    )


def _spike_before_drop(prices: list[float], baseline: float) -> float:
    """Evidence of the pre-sale price hike.

    The trick: hold a price steady, raise it sharply for a week or two, then
    "discount" back down to roughly the original. Buyers see a big percentage
    off; the real price never changed.

    Returns how far above the usual price the recent peak sat, as a percentage.
    A high value means any current "discount" should be treated sceptically.
    """
    if len(prices) < 4 or not baseline:
        return 0.0

    window = prices[-min(len(prices), 10):]
    peak = max(window)
    return max(0.0, _pct(peak, baseline))

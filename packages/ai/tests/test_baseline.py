"""Baseline behaviour tests.

These double as the acceptance criteria for any trained model: whatever replaces
the baseline must still get every one of these right, especially the fake-sale
case. A model that calls a pre-sale price hike a bargain is worse than useless —
it actively costs the user money.
"""

from __future__ import annotations

import pytest

from ocular_ai.baseline import judge
from ocular_ai.features import DAY_MS, extract_features

BASE_TS = 1_700_000_000_000


def series(prices: list[float], *, step_days: int = 3) -> list[dict]:
    return [
        {"ts": BASE_TS + i * step_days * DAY_MS, "lastSeen": BASE_TS + i * step_days * DAY_MS,
         "price": float(p), "inStock": True}
        for i, p in enumerate(prices)
    ]


def verdict_for(prices: list[float], **kwargs) -> dict:
    history = series(prices, **kwargs)
    return judge(extract_features(history, now_ms=history[-1]["ts"]))


def test_clear_discount_is_buy_now():
    result = verdict_for([10_000] * 10 + [8_500])
    assert result["verdict"] == "buy_now"


def test_price_above_usual_is_wait():
    result = verdict_for([10_000] * 10 + [11_500])
    assert result["verdict"] == "wait"


def test_price_at_usual_is_neutral():
    result = verdict_for([10_000] * 10 + [10_050])
    assert result["verdict"] == "neutral"


def test_fake_sale_is_not_celebrated():
    """The pre-sale hike: hold at 10k, spike to 20k, 'discount' to 11k.

    A naive percentage-off reading calls this a 45% saving. It is a price rise.
    """
    result = verdict_for([10_000] * 8 + [20_000, 20_000, 11_000])
    assert result["verdict"] == "wait", result
    assert "inflated" in result["reasoning"].lower()


def test_genuine_drop_after_a_spike_still_registers():
    """A real drop below the usual price should survive the fake-sale guard."""
    result = verdict_for([10_000] * 8 + [20_000, 20_000, 7_500])
    assert result["verdict"] == "buy_now", result


def test_confidence_is_low_without_enough_history():
    result = verdict_for([10_000, 8_000])
    assert result["confidence"] == "low"


def test_confidence_rises_with_a_long_stable_history():
    result = verdict_for([10_000] * 20 + [8_500], step_days=5)
    assert result["confidence"] == "high"


def test_volatile_series_never_reports_high_confidence():
    noisy = [5_000, 15_000, 6_000, 14_000, 5_500, 13_000, 7_000, 12_000, 6_500, 11_000] * 2
    result = verdict_for(noisy + [4_000], step_days=5)
    assert result["confidence"] != "high"


def test_all_time_low_is_called_out_explicitly():
    result = verdict_for([10_000] * 10 + [6_000])
    assert result["verdict"] == "buy_now"
    assert "lowest" in result["reasoning"].lower()


def test_empty_history_raises_rather_than_guessing():
    with pytest.raises(ValueError):
        extract_features([])


def test_junk_points_are_discarded():
    history = series([10_000] * 10 + [8_000])
    history.extend([{"ts": BASE_TS, "price": 0}, {"ts": BASE_TS, "price": -5}])
    features = extract_features(history)
    assert features.minimum > 0

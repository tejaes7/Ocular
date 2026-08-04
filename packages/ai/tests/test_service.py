"""Service endpoint tests for ocular_ai."""

from __future__ import annotations

from fastapi.testclient import TestClient

from ocular_ai.service import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert data["service"] == "ocular-ai"


def test_verdict_endpoint_valid():
    history = [
        {"ts": 1700000000000 + i * 86400000 * 3, "lastSeen": 1700000000000 + i * 86400000 * 3, "price": 10000.0, "inStock": True}
        for i in range(10)
    ]
    history.append({"ts": 1700000000000 + 30 * 86400000, "lastSeen": 1700000000000 + 30 * 86400000, "price": 8500.0, "inStock": True})

    response = client.post("/verdict", json={"history": history})
    assert response.status_code == 200
    data = response.json()
    assert data["verdict"] in ("buy_now", "wait", "neutral")


def test_verdict_endpoint_insufficient_history():
    response = client.post("/verdict", json={"history": []})
    assert response.status_code == 200
    data = response.json()
    assert data["verdict"] == "neutral"
    assert data["confidence"] == "low"


def test_extract_endpoint_returns_501():
    response = client.post(
        "/extract",
        json={
            "url": "https://example.com/p/1",
            "snippet": "TITLE: Kettle\nPRICE CANDIDATES:\nspan :: ₹1,299",
        },
    )
    assert response.status_code == 501


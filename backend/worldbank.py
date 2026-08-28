from __future__ import annotations

import asyncio
from typing import Any

import httpx

WB_BASE = "https://api.worldbank.org/v2/country/IN/indicator"

DEFAULT_INDICATORS = [
    ("NY.GDP.MKTP.KD.ZG", "gdp_growth_annual_pct"),
    ("FP.CPI.TOTL.ZG", "inflation_cpi_annual_pct"),
    ("EN.ATM.CO2E.PC", "co2_emissions_metric_tons_per_capita"),
]

DOMAIN_EXTRA: dict[str, list[tuple[str, str]]] = {
    "economic": [("SL.UEM.TOTL.ZS", "unemployment_total_pct")],
    "environmental": [("EG.FEC.RNEW.ZS", "renewable_energy_consumption_pct")],
    "environment": [("EG.FEC.RNEW.ZS", "renewable_energy_consumption_pct")],
    "social": [("SI.POV.DDAY", "poverty_headcount_ratio_1_90")],
}


def _parse_wb_payload(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return []
    rows = []
    for item in payload[1]:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "year": item.get("date"),
                "value": item.get("value"),
                "indicator": (item.get("indicator") or {}).get("value"),
            }
        )
    return rows


async def fetch_indicator(client: httpx.AsyncClient, code: str) -> list[dict[str, Any]]:
    url = f"{WB_BASE}/{code}?format=json&per_page=5"
    response = await client.get(url, timeout=12.0)
    response.raise_for_status()
    return _parse_wb_payload(response.json())


async def fetch_supporting_indicators(
    client: httpx.AsyncClient,
    domain: str | None,
) -> dict[str, Any]:
    indicators = list(DEFAULT_INDICATORS)
    extra_key = (domain or "").strip().lower()
    for key, extras in DOMAIN_EXTRA.items():
        if key in extra_key:
            indicators.extend(extras)
            break

    async def one(code: str, label: str) -> tuple[str, dict[str, Any]]:
        try:
            return label, {"code": code, "series": await fetch_indicator(client, code)}
        except Exception as exc:
            return label, {"code": code, "series": [], "error": str(exc)[:200]}

    pairs = await asyncio.gather(*(one(code, label) for code, label in indicators))
    return dict(pairs)

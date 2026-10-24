"""Elexon data retrieval and day-ahead wind forecast evaluation."""

from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone
import json
import math
from threading import Lock
from time import monotonic
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


API_BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DELIVERY_START = date(2026, 1, 1)
DELIVERY_END = date(2026, 1, 31)
UK_TIME = ZoneInfo("Europe/London")
UTC = timezone.utc
CACHE_SECONDS = 1800

_cache_lock = Lock()
_cached_dashboard: dict[str, Any] | None = None
_cache_expires_at = 0.0


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _fetch_json(url: str) -> list[dict[str, Any]]:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "WindForecastDesk/1.0"})
    with urlopen(request, timeout=45) as response:
        body = response.read()
    payload = json.loads(body)
    if not isinstance(payload, list):
        raise ValueError("Elexon returned an unexpected response format.")
    return payload


def fetch_actuals(fetcher=_fetch_json) -> list[dict[str, Any]]:
    query = urlencode(
        {
            "settlementDateFrom": DELIVERY_START.isoformat(),
            "settlementDateTo": DELIVERY_END.isoformat(),
            "fuelType": "WIND",
        }
    )
    return fetcher(f"{API_BASE}/FUELHH/stream?{query}")


def fetch_forecasts(fetcher=_fetch_json) -> list[dict[str, Any]]:
    query = urlencode(
        {
            "publishDateTimeFrom": "2025-12-31T00:00:00Z",
            "publishDateTimeTo": "2026-02-01T00:00:00Z",
        }
    )
    return fetcher(f"{API_BASE}/WINDFOR/stream?{query}")


def _metric_values(values: list[tuple[float, float]]) -> dict[str, float | int | None]:
    if not values:
        return {"mae_mw": None, "rmse_mw": None, "bias_mw": None, "matched_periods": 0}

    errors = [forecast - actual for forecast, actual in values]
    count = len(errors)
    return {
        "mae_mw": round(sum(abs(error) for error in errors) / count, 2),
        "rmse_mw": round(math.sqrt(sum(error * error for error in errors) / count), 2),
        "bias_mw": round(sum(errors) / count, 2),
        "matched_periods": count,
    }


def build_dashboard(
    actual_records: list[dict[str, Any]],
    forecast_records: list[dict[str, Any]],
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """Join actual half-hours to the latest pre-delivery-day hourly vintage."""
    selected_forecast: dict[datetime, tuple[datetime, float]] = {}
    for record in forecast_records:
        start_time = _parse_datetime(record["startTime"])
        publish_time = _parse_datetime(record["publishTime"])
        delivery_date = start_time.astimezone(UK_TIME).date()
        cutoff = datetime.combine(delivery_date, time.min, tzinfo=UK_TIME).astimezone(UTC)
        if publish_time >= cutoff:
            continue

        hour_start = start_time.replace(minute=0, second=0, microsecond=0)
        current = selected_forecast.get(hour_start)
        generation = float(record["generation"])
        if current is None or publish_time > current[0]:
            selected_forecast[hour_start] = (publish_time, generation)

    actuals = sorted(
        (
            _parse_datetime(record["startTime"]),
            float(record["generation"]),
        )
        for record in actual_records
        if record.get("fuelType", "WIND") == "WIND"
        and DELIVERY_START <= date.fromisoformat(record["settlementDate"]) <= DELIVERY_END
    )

    series: list[dict[str, Any]] = []
    all_values: list[tuple[float, float]] = []
    daily_values: dict[str, list[tuple[float, float]]] = defaultdict(list)
    dates_with_actuals = sorted({start.astimezone(UK_TIME).date().isoformat() for start, _ in actuals})

    for start_time, actual in actuals:
        local_start = start_time.astimezone(UK_TIME)
        delivery_date = local_start.date().isoformat()
        hour_start = start_time.replace(minute=0, second=0, microsecond=0)
        selected = selected_forecast.get(hour_start)
        forecast = selected[1] if selected is not None else None
        publish_time = selected[0] if selected is not None else None
        error = forecast - actual if forecast is not None else None
        row = {
            "start_time": start_time.isoformat().replace("+00:00", "Z"),
            "delivery_date": delivery_date,
            "forecast_mw": forecast,
            "actual_mw": actual,
            "error_mw": round(error, 2) if error is not None else None,
            "publish_time": publish_time.isoformat().replace("+00:00", "Z") if publish_time else None,
        }
        series.append(row)
        if forecast is not None:
            pair = (forecast, actual)
            all_values.append(pair)
            daily_values[delivery_date].append(pair)

    metrics = _metric_values(all_values)
    total_actual_periods = len(series)
    metrics["total_actual_periods"] = total_actual_periods
    metrics["coverage_pct"] = round(metrics["matched_periods"] * 100 / total_actual_periods, 1) if total_actual_periods else 0.0

    daily = []
    for delivery_date in dates_with_actuals:
        day_metrics = _metric_values(daily_values[delivery_date])
        day_metrics["date"] = delivery_date
        day_metrics["total_actual_periods"] = sum(1 for row in series if row["delivery_date"] == delivery_date)
        daily.append(day_metrics)

    return {
        "month": "2026-01",
        "generated_at": (generated_at or datetime.now(UTC)).astimezone(UTC).isoformat().replace("+00:00", "Z"),
        "metrics": metrics,
        "daily": daily,
        "series": series,
    }


def get_dashboard_data(now: float | None = None) -> dict[str, Any]:
    """Return the cached dashboard or fetch both source datasets concurrently."""
    global _cached_dashboard, _cache_expires_at
    current_time = monotonic() if now is None else now
    with _cache_lock:
        if _cached_dashboard is not None and current_time < _cache_expires_at:
            return _cached_dashboard

        with ThreadPoolExecutor(max_workers=2) as pool:
            actual_future = pool.submit(fetch_actuals)
            forecast_future = pool.submit(fetch_forecasts)
            actual_records = actual_future.result()
            forecast_records = forecast_future.result()

        _cached_dashboard = build_dashboard(actual_records, forecast_records)
        _cache_expires_at = current_time + CACHE_SECONDS
        return _cached_dashboard


def clear_cache() -> None:
    """Clear the in-memory response cache, primarily for isolated tests."""
    global _cached_dashboard, _cache_expires_at
    with _cache_lock:
        _cached_dashboard = None
        _cache_expires_at = 0.0

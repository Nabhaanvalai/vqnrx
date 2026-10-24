from datetime import datetime, timezone
import unittest

from backend.wind_data import build_dashboard


def record(start_time, generation, *, publish_time=None, fuel_type="WIND", dataset="WINDFOR"):
    value = {"startTime": start_time, "generation": generation, "dataset": dataset}
    if publish_time is not None:
        value["publishTime"] = publish_time
    if dataset == "FUELHH":
        value["settlementDate"] = start_time[:10]
        value["fuelType"] = fuel_type
    return value


class WindDataTests(unittest.TestCase):
    def test_uses_latest_forecast_published_before_delivery_day_and_matches_both_half_hours(self):
        actuals = [
            record("2026-01-01T00:00:00Z", 100, dataset="FUELHH"),
            record("2026-01-01T00:30:00Z", 120, dataset="FUELHH"),
        ]
        forecasts = [
            record("2026-01-01T00:00:00Z", 80, publish_time="2025-12-31T10:00:00Z"),
            record("2026-01-01T00:00:00Z", 110, publish_time="2025-12-31T22:30:00Z"),
            record("2026-01-01T00:00:00Z", 999, publish_time="2026-01-01T00:00:00Z"),
        ]

        result = build_dashboard(actuals, forecasts, datetime(2026, 2, 1, tzinfo=timezone.utc))

        self.assertEqual([row["forecast_mw"] for row in result["series"]], [110, 110])
        self.assertEqual([row["publish_time"] for row in result["series"]], ["2025-12-31T22:30:00Z"] * 2)
        self.assertEqual(result["metrics"]["mae_mw"], 10.0)
        self.assertEqual(result["metrics"]["rmse_mw"], 10.0)
        self.assertEqual(result["metrics"]["bias_mw"], 0.0)
        self.assertEqual(result["metrics"]["matched_periods"], 2)

    def test_missing_forecast_is_not_imputed_or_counted_in_accuracy(self):
        actuals = [record("2026-01-02T00:00:00Z", 100, dataset="FUELHH")]

        result = build_dashboard(actuals, [], datetime(2026, 2, 1, tzinfo=timezone.utc))

        self.assertIsNone(result["series"][0]["forecast_mw"])
        self.assertIsNone(result["series"][0]["error_mw"])
        self.assertEqual(result["metrics"]["matched_periods"], 0)
        self.assertEqual(result["metrics"]["coverage_pct"], 0.0)
        self.assertIsNone(result["daily"][0]["mae_mw"])

    def test_filters_non_wind_actuals_and_dates_outside_january(self):
        actuals = [
            record("2026-01-02T00:00:00Z", 100, dataset="FUELHH"),
            record("2026-01-02T00:30:00Z", 20, dataset="FUELHH", fuel_type="SOLAR"),
            record("2026-02-01T00:00:00Z", 500, dataset="FUELHH"),
        ]

        result = build_dashboard(actuals, [], datetime(2026, 2, 1, tzinfo=timezone.utc))

        self.assertEqual(len(result["series"]), 1)
        self.assertEqual(result["series"][0]["actual_mw"], 100)

    def test_forecast_before_midnight_utc_is_still_day_ahead_for_january_gmt(self):
        actuals = [record("2026-01-15T11:30:00Z", 500, dataset="FUELHH")]
        forecasts = [
            record("2026-01-15T11:00:00Z", 450, publish_time="2026-01-14T23:30:00Z"),
        ]

        result = build_dashboard(actuals, forecasts)

        self.assertEqual(result["series"][0]["forecast_mw"], 450)
        self.assertEqual(result["series"][0]["error_mw"], -50)
        self.assertEqual(result["metrics"]["bias_mw"], -50)

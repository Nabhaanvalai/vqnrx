"""FastAPI application and local static asset serving."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from .wind_data import get_dashboard_data

app = FastAPI(title="Wind Forecast Desk", version="1.0.0")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard() -> dict:
    try:
        return get_dashboard_data()
    except Exception as exc:  # Surface an actionable API error to the dashboard.
        raise HTTPException(status_code=502, detail=f"Unable to load Elexon data: {exc}") from exc


static_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if static_dir.is_dir():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

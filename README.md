# Wind Forecast Desk

A small decision-support dashboard for reviewing Great Britain wind generation forecasts and actual outturn during January 2026. The app uses only Elexon BMRS FUELHH and WINDFOR data.

## What it shows

- January actual wind generation and the day-ahead forecast selected for each delivery date.
- Monthly and daily mean absolute error (MAE), root mean square error (RMSE), and forecast bias.
- Half-hourly detail for the selected delivery date, including the chosen forecast publication time and forecast error.
- Match coverage, so missing forecast vintages are visible instead of being filled with invented values.

## Data and calculations

The backend requests actuals from [FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream), filtered to fuel type `WIND` and settlement dates January 1 through January 31, 2026. It requests forecast vintages from [WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream), including publications from December 31, 2025 through January 31, 2026.

For every delivery date and forecast start time, the dashboard chooses the newest forecast published before 00:00 in `Europe/London` on the delivery date. WINDFOR is hourly and FUELHH is half-hourly, so an hourly forecast value is compared with each of the two actual half-hour periods in that hour. The scoring set includes only periods with both values.

Forecast error is forecast minus actual. MAE is the mean absolute error, RMSE is the square root of mean squared error, and bias is the mean signed error. The API response is cached in memory for 30 minutes. No API key is required by the app.

## Project structure

```text
app.py               Vercel FastAPI entrypoint
backend/             Elexon retrieval, forecast matching, metrics, and FastAPI app
frontend/            React interface, styling, and production build setup
docs/                Customer and technical demo script
tests/               Unit tests for vintage selection, matching, and scoring
Dockerfile           Multi-stage build for the app and static frontend
docker-compose.yml   Local container startup
vercel.json          Vercel build and API routing configuration
requirements.txt     Python runtime dependencies
```

## Start locally

### Docker

Install Docker Desktop, then from this directory run:

```bash
docker compose up --build
```

Open [http://localhost:8000](http://localhost:8000). Stop the app with `Ctrl+C`.

### Without Docker

In one terminal, install and run the API:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

In a second terminal, install and run the React app:

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL printed in the terminal. Vite forwards `/api` requests to FastAPI on port 8000.

## Tests

```bash
python -m unittest discover -s tests -v
```

## Deploy

The project is configured for Vercel. Import the public GitHub repository in Vercel or deploy with the Vercel CLI. Vercel uses `app.py` as the FastAPI entrypoint and builds the React output from `frontend/`; FastAPI serves the built interface and `/api/*` routes from the same app.

**Hosted app:** add the Vercel production URL here after deployment.

## Demo and submission

The challenge demo is planned as two sections: a customer overview (up to five minutes) and a technical walkthrough (up to five minutes), with a total runtime no longer than ten minutes. Upload it as an unlisted YouTube video and submit the app, repository, and video URLs at the [challenge submission form](https://forms.cloud.microsoft/r/Ljmf1aWESK). Verify each URL in an incognito session before submitting.

## AI tools

AI tools were used to assist with planning, implementation, and documentation. Data selection and forecast scoring are implemented in the application code and covered by unit tests.

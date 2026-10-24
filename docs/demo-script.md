# Wind Forecast Desk Demo Script

Target runtime: about 8 minutes total, split into a customer walkthrough and a technical walkthrough. Keep each section under five minutes.

## Part 1: Customer walkthrough

### 0:00–0:35 | Set the context

“This pilot gives the market operations team one place to review the GB wind generation forecast that was available before each January delivery day, then compare it with the eventual generation outturn. The goal is to make the forecast and its uncertainty visible before a day-ahead purchase decision.”

### 0:35–1:25 | Read the monthly summary

“The page covers January 2026 and uses only the Elexon BMRS wind forecast and actual generation datasets. For this month, mean absolute error is about 1,941 MW, root mean square error is about 2,411 MW, and average forecast bias is about +1,714 MW. A positive bias means the selected forecast was higher than the outturn on average.”

“All 1,488 half-hour actual periods have a matched forecast in this dataset. The coverage figure matters because the error summary only scores periods where both a forecast and an actual value exist.”

### 1:25–2:35 | Explore a delivery day

“I can choose any January delivery date here. The top chart compares actual outturn with the forecast vintage selected for that day. The source forecast is hourly, while actual generation is half-hourly, so each hourly forecast is compared with both half-hours in that hour.”

“The cutoff is midnight UK time at the start of the delivery date. That keeps the comparison aligned with the day-ahead decision and avoids using forecast revisions published after delivery began.”

### 2:35–3:35 | Inspect daily accuracy and periods

“The daily chart shows how mean absolute error changes across the month. Selecting a bar opens that day in the profile and the detailed settlement-period table. Each row includes the forecast publication time, forecast MW, actual MW, and signed forecast error.”

“Here, positive errors mean the forecast was above actual generation; negative errors mean it was below. A missing forecast would be shown as missing and left out of the accuracy score.”

### 3:35–4:20 | Close with the decision value and scope

“This view helps the team see the wind generation forecast, its historical day-ahead error, and the direction of its bias before translating that forecast into a procurement view. It does not calculate residual demand, wholesale prices, or a recommended purchase volume. Those are outside this pilot’s Elexon wind-only scope.”

## Part 2: Technical walkthrough

### 0:00–0:40 | Show the project structure

“The frontend is a small React app under `frontend/`. The FastAPI service and data logic are under `backend/`. `Dockerfile` builds the React bundle and runs it with FastAPI in one container. The same FastAPI entrypoint is exposed to Vercel through `app.py`.”

### 0:40–1:35 | Explain data retrieval

“The backend requests FUELHH actuals for the January settlement dates, filtered to WIND. It requests WINDFOR publication records beginning December 31 so January 1 has its prior-day forecasts. Both source calls run concurrently, and the combined dashboard response is cached in memory for 30 minutes.”

### 1:35–2:30 | Explain the join and scoring

“Timestamps are parsed as UTC and delivery dates are evaluated in `Europe/London`. For each forecast hour, the code selects the newest publication earlier than midnight on that forecast’s delivery date. The hourly value is paired with the two matching half-hour actual records.”

“The error is forecast minus actual. MAE measures typical absolute miss, RMSE gives larger misses more weight, and bias shows the average direction. Unmatched periods are excluded from scores and counted in coverage.”

### 2:30–3:20 | Walk through the interface

“The dashboard fetches one JSON response from `/api/dashboard`. React handles the loading, error, and empty states. The hourly profile is a small SVG chart; daily error bars and the half-hour table are native HTML, so there is no separate chart framework to maintain.”

### 3:20–4:15 | Cover runtime and deployment

“For local development, Vite proxies `/api` to FastAPI. For Docker, a multi-stage image builds the frontend and copies its static bundle into the Python runtime. FastAPI serves both the static page and the API. Vercel uses the same app entrypoint and frontend build command.”

### 4:15–4:50 | Show verification and handoff

“Four unit tests cover forecast vintage selection, both half-hour matches, missing vintages, fuel and date filters, and the error calculation. The README documents startup, data definitions, limitations, and the AI tools used during development. The app intentionally stays within the two Elexon datasets in the brief.”

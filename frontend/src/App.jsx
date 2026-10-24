import { useEffect, useMemo, useState } from 'react';

const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

function formatMetric(value, suffix = ' MW') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return `${decimalFormat.format(value)}${suffix}`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function formatDay(date) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function MetricCard({ label, value, note, tone = 'neutral' }) {
  return (
    <section className={`metric-card metric-card--${tone}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </section>
  );
}

function profilePath(rows, key, x, y) {
  let drawing = false;
  return rows.reduce((path, row, index) => {
    const value = row[key];
    if (value === null || value === undefined) {
      drawing = false;
      return path;
    }
    const command = drawing ? 'L' : 'M';
    drawing = true;
    return `${path}${command}${x(index)},${y(value)} `;
  }, '');
}

function ProfileChart({ rows }) {
  const width = 760;
  const height = 250;
  const margin = { top: 12, right: 14, bottom: 28, left: 54 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = rows.flatMap((row) => [row.actual_mw, row.forecast_mw]).filter(Number.isFinite);
  const maxValue = Math.max(...values, 1000);
  const yMax = Math.ceil(maxValue / 5000) * 5000;
  const x = (index) => margin.left + (rows.length <= 1 ? 0 : (index / (rows.length - 1)) * plotWidth);
  const y = (value) => margin.top + plotHeight - (value / yMax) * plotHeight;
  const yTicks = [0, 1, 2, 3, 4].map((index) => (yMax * index) / 4);
  const xTicks = [0, 6, 12, 18, 24, 30, 36, 42, 47].filter((index) => index < rows.length);
  const actualPath = profilePath(rows, 'actual_mw', x, y);
  const forecastPath = profilePath(rows, 'forecast_mw', x, y);

  return (
    <svg className="profile-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Actual wind outturn and day-ahead forecast in megawatts by half-hour for the selected delivery day">
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} className="chart-gridline" />
          <text x={margin.left - 9} y={y(tick) + 4} textAnchor="end" className="chart-axis-label">{Math.round(tick / 1000)}k</text>
        </g>
      ))}
      {xTicks.map((index) => (
        <text key={index} x={x(index)} y={height - 7} textAnchor="middle" className="chart-axis-label">{formatTime(rows[index].start_time)}</text>
      ))}
      <path d={actualPath} className="chart-line chart-line--actual" />
      <path d={forecastPath} className="chart-line chart-line--forecast" />
      {rows.map((row, index) => (index % 6 === 0 ? (
        <g key={row.start_time}>
          <circle cx={x(index)} cy={y(row.actual_mw)} r="3" className="chart-point chart-point--actual">
            <title>{`${formatTime(row.start_time)} actual ${numberFormat.format(row.actual_mw)} MW`}</title>
          </circle>
          {row.forecast_mw !== null && <circle cx={x(index)} cy={y(row.forecast_mw)} r="3" className="chart-point chart-point--forecast"><title>{`${formatTime(row.start_time)} forecast ${numberFormat.format(row.forecast_mw)} MW`}</title></circle>}
        </g>
      ) : null))}
    </svg>
  );
}

function DailyAccuracyChart({ rows, average, selectedDate, onSelectDate }) {
  const maximum = Math.max(...rows.map((row) => row.mae_mw ?? 0), average ?? 0, 1);
  const averageHeight = (average / maximum) * 100;
  return (
    <div className="daily-chart" aria-label="Daily mean absolute error. Select a bar to choose a delivery date.">
      <div className="daily-scale"><span>{formatMetric(maximum, '')}</span><span>0</span></div>
      <div className="daily-bars">
        <div className="daily-average" style={{ bottom: `${averageHeight}%` }} aria-hidden="true" />
        {rows.map((row) => {
          const value = row.mae_mw ?? 0;
          const height = Math.max(value === 0 ? 0 : 2, (value / maximum) * 100);
          return (
            <button
              key={row.date}
              type="button"
              className={`daily-bar-button${selectedDate === row.date ? ' is-selected' : ''}`}
              style={{ '--bar-height': `${height}%` }}
              onClick={() => onSelectDate(row.date)}
              aria-label={`${formatDay(row.date)} mean absolute error ${formatMetric(row.mae_mw)}; select this date`}
              title={`${formatDay(row.date)} · ${formatMetric(row.mae_mw)}`}
            >
              <span className="daily-bar-fill" />
            </button>
          );
        })}
      </div>
      <div className="daily-axis-labels"><span>1 Jan</span><span>10 Jan</span><span>20 Jan</span><span>31 Jan</span></div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="state-panel" role="status">
      <span className="loading-spinner" aria-hidden="true" />
      <strong>Loading January wind data</strong>
      <span className="state-hint">Fetching historical records from Elexon BMRS. The first request may take a few seconds.</span>
    </div>
  );
}

function Dashboard({ data }) {
  const [selectedDate, setSelectedDate] = useState(data.daily[0]?.date ?? '2026-01-01');
  const dayRows = useMemo(
    () => data.series.filter((row) => row.delivery_date === selectedDate),
    [data.series, selectedDate],
  );
  const selectedDaily = data.daily.find((row) => row.date === selectedDate);

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Wind Forecast Desk home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>GRIDBRICKS <span className="brand-divider">/</span> MARKET INTELLIGENCE</span>
        </a>
        <span className="period-badge">JAN 2026 REVIEW</span>
      </header>

      <section className="intro" id="top">
        <div>
          <span className="eyebrow">GB WIND GENERATION</span>
          <h1>Forecast performance</h1>
          <span className="intro-copy">Day-ahead wind outlook compared with generation outturn across January 2026.</span>
        </div>
        <div className="source-stamp">
          <span className="source-badge"><i /> Elexon BMRS</span>
          <span>Forecast cutoff: 00:00 UK time on delivery day</span>
          <span className="source-time">Refreshed {formatDateTime(data.generated_at)}</span>
        </div>
      </section>

      <section className="metric-grid" aria-label="January accuracy summary">
        <MetricCard label="Mean absolute error" value={formatMetric(data.metrics.mae_mw)} note="Typical absolute difference" tone="blue" />
        <MetricCard label="Root mean square error" value={formatMetric(data.metrics.rmse_mw)} note="Weights larger misses more" tone="green" />
        <MetricCard
          label="Forecast bias"
          value={formatMetric(data.metrics.bias_mw)}
          note={data.metrics.bias_mw === null ? 'No matched periods' : data.metrics.bias_mw > 0 ? 'Forecast was higher than outturn' : data.metrics.bias_mw < 0 ? 'Forecast was lower than outturn' : 'Forecast matched outturn on average'}
          tone={data.metrics.bias_mw > 0 ? 'amber' : 'neutral'}
        />
        <MetricCard
          label="Matched half-hours"
          value={`${numberFormat.format(data.metrics.matched_periods)} / ${numberFormat.format(data.metrics.total_actual_periods)}`}
          note={`${decimalFormat.format(data.metrics.coverage_pct)}% of actual periods scored`}
          tone="neutral"
        />
      </section>

      <section className="analysis-grid">
        <section className="panel profile-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">DELIVERY DAY DETAIL</span>
              <h2>Wind generation profile</h2>
            </div>
            <label className="date-picker-label">
              <span>Delivery date</span>
              <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
                {data.daily.map((row) => <option value={row.date} key={row.date}>{formatDay(row.date)}</option>)}
              </select>
            </label>
          </div>
          <div className="chart-legend-note">
            <span><i className="legend-dot legend-dot--actual" /> Actual outturn</span>
            <span><i className="legend-dot legend-dot--forecast" /> Day-ahead forecast</span>
            <span className="chart-resolution">Hourly forecast paired with two half-hour actuals.</span>
          </div>
          <div className="profile-chart">
            {dayRows.length ? <ProfileChart rows={dayRows} /> : <div className="empty-chart">No generation records are available for this date.</div>}
          </div>
          <div className="selected-day-summary">
            <span>{formatDay(selectedDate)} accuracy</span>
            <strong>MAE {formatMetric(selectedDaily?.mae_mw)}</strong>
            <strong>Bias {formatMetric(selectedDaily?.bias_mw)}</strong>
            <span>{numberFormat.format(selectedDaily?.matched_periods ?? 0)} matched half-hours</span>
          </div>
        </section>

        <section className="panel daily-panel">
          <div className="panel-heading panel-heading--compact">
            <div>
              <span className="eyebrow">ACCURACY BY DAY</span>
              <h2>Daily mean absolute error</h2>
            </div>
          </div>
          <p className="panel-description">Select a date to inspect its generation profile and half-hour matches.</p>
          <DailyAccuracyChart
            rows={data.daily}
            average={data.metrics.mae_mw}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          <div className="chart-footnote"><span className="benchmark-line" /> Month average {formatMetric(data.metrics.mae_mw)}</div>
        </section>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading table-heading">
          <div>
            <span className="eyebrow">HALF-HOURLY DETAIL</span>
            <h2>{formatDay(selectedDate)} settlement periods</h2>
          </div>
          <span className="table-count">{dayRows.length} actual periods</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th scope="col">Time (UK)</th><th scope="col">Forecast vintage</th><th scope="col">Forecast</th><th scope="col">Actual outturn</th><th scope="col">Forecast error</th></tr>
            </thead>
            <tbody>
              {dayRows.map((row) => (
                <tr key={row.start_time}>
                  <td>{formatTime(row.start_time)}</td>
                  <td>{row.publish_time ? formatDateTime(row.publish_time) : <span className="muted">No day-ahead vintage</span>}</td>
                  <td>{row.forecast_mw === null ? '–' : `${numberFormat.format(row.forecast_mw)} MW`}</td>
                  <td>{row.actual_mw === null ? '–' : `${numberFormat.format(row.actual_mw)} MW`}</td>
                  <td className={row.error_mw > 0 ? 'error-positive' : row.error_mw < 0 ? 'error-negative' : ''}>
                    {row.error_mw === null ? '–' : `${row.error_mw > 0 ? '+' : ''}${numberFormat.format(row.error_mw)} MW`}
                  </td>
                </tr>
              ))}
              {!dayRows.length && <tr><td colSpan="5" className="empty-row">No records for this date.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-note">Forecast error is forecast minus actual. Accuracy metrics use only rows with both values.</div>
      </section>

      <footer className="page-footer">
        <span>Source: Elexon BMRS FUELHH and WINDFOR datasets</span>
        <span>All times shown in UK local time · MW</span>
      </footer>
    </main>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch('/api/dashboard', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || `Request failed (${response.status})`);
        }
        return response.json();
      })
      .then(setData)
      .catch((cause) => {
        if (cause.name !== 'AbortError') setError(cause.message || 'Unable to load Elexon data.');
      });
    return () => controller.abort();
  }, [retryCount]);

  if (error) {
    return (
      <main className="page-shell state-shell">
        <div className="state-brand"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span> WIND FORECAST DESK</div>
        <div className="error-message" role="alert">{error}</div>
        <p className="state-hint">Elexon BMRS may be temporarily unavailable. Try the request again in a moment.</p>
        <button className="retry-button" type="button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button>
      </main>
    );
  }

  if (!data) return <main className="page-shell state-shell"><LoadingState /></main>;
  if (!data.series.length) {
    return <main className="page-shell state-shell"><div className="warning-message" role="status">No January wind records were returned by Elexon BMRS.</div></main>;
  }
  return <Dashboard data={data} />;
}

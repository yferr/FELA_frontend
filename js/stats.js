/**
 * stats.js — FELA statistics module
 * Computes aggregated metrics from geoJsonData and renders KPI bar + charts.
 */

import Chart from 'chart.js/auto';

// Keep chart instances so we can destroy them before re-rendering
const chartInstances = {};

// ---------------------------------------------------------------------------
// Compute all stats from the raw geoJsonData structure
// ---------------------------------------------------------------------------

export function computeStats(data) {
    const events = data?.events || {};

    let totalEvents        = 0;
    let totalPresentations = 0;
    const uniqueSpeakers   = new Set();
    const eventCountries   = new Set();
    const speakerCountries     = new Map();  // country → Set of speaker names
    const speakerPresentations = new Map();  // speaker name → count of presentations
    const languages        = new Map();  // language → count of presentations
    const agencies         = new Map();  // agency   → count of events
    const years            = new Map();  // year     → count of events
    const eventByCountry   = new Map();  // country  → count of events

    Object.entries(events).forEach(([year, yearEvents]) => {
        Object.entries(yearEvents).forEach(([, eventList]) => {
            eventList.forEach(ev => {
                totalEvents++;

                const year_ = String(year);
                years.set(year_, (years.get(year_) || 0) + 1);

                const country = ev.place?.[0]?.country;
                if (country && country !== '-') {
                    eventCountries.add(country);
                    eventByCountry.set(country, (eventByCountry.get(country) || 0) + 1);
                }

                (ev.agency || []).forEach(ag => {
                    if (ag?.trim()) agencies.set(ag, (agencies.get(ag) || 0) + 1);
                });

                Object.values(ev.titles || {}).forEach(presList => {
                    presList.forEach(pres => {
                        totalPresentations++;

                        (pres.language || []).forEach(lang => {
                            if (lang?.trim()) languages.set(lang, (languages.get(lang) || 0) + 1);
                        });

                        (pres.speakers || []).forEach(sp => {
                            const name = sp.speaker?.trim();
                            if (name) {
                                uniqueSpeakers.add(name);
                                speakerPresentations.set(name, (speakerPresentations.get(name) || 0) + 1);
                            }
                            const sc = sp.country?.trim();
                            if (sc && sc !== '-') {
                                if (!speakerCountries.has(sc)) speakerCountries.set(sc, new Set());
                                speakerCountries.get(sc).add(name || '?');
                            }
                        });
                    });
                });
            });
        });
    });

    // Sort by value desc, keep top N
    const top = (map, n = 10) =>
        [...map.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, n);

    return {
        totalEvents,
        totalPresentations,
        totalSpeakers:   uniqueSpeakers.size,
        totalCountries:  eventCountries.size,
        totalLanguages:  languages.size,
        totalAgencies:   agencies.size,
        eventsByYear:    new Map([...years.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
        topCountries:    top(eventByCountry),
        topSpeakerCountries: top(new Map([...speakerCountries.entries()].map(([c, s]) => [c, s.size]))),
        topLanguages:    top(languages),
        topAgencies:     top(agencies),
        topSpeakers:     top(speakerPresentations),
    };
}

// ---------------------------------------------------------------------------
// Download helpers
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = new Set(['id', 'created_by', 'generated_at']);

function sanitizeForDownload(value) {
    if (Array.isArray(value)) {
        return value.map(sanitizeForDownload);
    }
    if (value !== null && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            if (!SENSITIVE_KEYS.has(k)) out[k] = sanitizeForDownload(v);
        }
        return out;
    }
    return value;
}

function downloadGeoJson(data) {
    const clean    = sanitizeForDownload(data);
    const json     = JSON.stringify(clean, null, 2);
    const blob     = new Blob([json], { type: 'application/geo+json' });
    const url      = URL.createObjectURL(blob);
    const anchor   = document.createElement('a');
    anchor.href     = url;
    anchor.download = `fela_data_${new Date().toISOString().slice(0, 10)}.geojson`;
    anchor.click();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// KPI bar — 4 numbers shown above the map
// ---------------------------------------------------------------------------

export function updateKPIBar(data) {
    const stats = computeStats(data);
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('kpi-events',        stats.totalEvents);
    set('kpi-presentations', stats.totalPresentations);
    set('kpi-speakers',      stats.totalSpeakers);
    set('kpi-countries',     stats.totalCountries);
}

// ---------------------------------------------------------------------------
// Full statistics page render
// ---------------------------------------------------------------------------

export function renderStats(container, data) {
    if (!data) {
        container.innerHTML = '<p style="padding:20px;">Datos no disponibles. Regresa al mapa primero.</p>';
        return;
    }

    destroyAllCharts();

    const stats = computeStats(data);

    container.innerHTML = `
        <div class="stats-page">
            <div class="stats-header">
                <h1>📊 Estadísticas FELA</h1>
                <p>Resumen de la actividad registrada en la plataforma</p>
            </div>

            <!-- Download card -->
            <div class="stats-download-card">
                <div class="stats-download-info">
                    <span class="stats-download-icon">📥</span>
                    <div>
                        <strong>Descargar datos</strong>
                        <p>Exporta todos los eventos, presentaciones y ponentes en formato GeoJSON para análisis externo. No incluye metadatos internos.</p>
                    </div>
                </div>
                <button id="btn-download-geojson" class="stats-download-btn">
                    ⬇ Descargar GeoJSON
                </button>
            </div>

            <!-- KPI cards -->
            <div class="stats-kpi-grid">
                <div class="stats-kpi-card">
                    <div class="stats-kpi-icon">🌍</div>
                    <div class="stats-kpi-value">${stats.totalEvents}</div>
                    <div class="stats-kpi-label">Eventos</div>
                </div>
                <div class="stats-kpi-card">
                    <div class="stats-kpi-icon">📋</div>
                    <div class="stats-kpi-value">${stats.totalPresentations}</div>
                    <div class="stats-kpi-label">Presentaciones</div>
                </div>
                <div class="stats-kpi-card">
                    <div class="stats-kpi-icon">👥</div>
                    <div class="stats-kpi-value">${stats.totalSpeakers}</div>
                    <div class="stats-kpi-label">Ponentes/Autores</div>
                </div>
                <div class="stats-kpi-card">
                    <div class="stats-kpi-icon">🗺️</div>
                    <div class="stats-kpi-value">${stats.totalCountries}</div>
                    <div class="stats-kpi-label">Países</div>
                </div>
                <div class="stats-kpi-card">
                    <div class="stats-kpi-icon">🗣️</div>
                    <div class="stats-kpi-value">${stats.totalLanguages}</div>
                    <div class="stats-kpi-label">Idiomas</div>
                </div>
                <div class="stats-kpi-card">
                    <div class="stats-kpi-icon">🏛️</div>
                    <div class="stats-kpi-value">${stats.totalAgencies}</div>
                    <div class="stats-kpi-label">Organismos</div>
                </div>
            </div>

            <!-- Charts grid -->
            <div class="stats-charts-grid">
                <div class="stats-chart-card stats-chart-wide">
                    <h3>Eventos por año</h3>
                    <canvas id="chart-events-year"></canvas>
                </div>
                <div class="stats-chart-card">
                    <h3>Top países (eventos)</h3>
                    <canvas id="chart-events-country"></canvas>
                </div>
                <div class="stats-chart-card">
                    <h3>Presentaciones por idioma</h3>
                    <canvas id="chart-languages"></canvas>
                </div>
                <div class="stats-chart-card">
                    <h3>Top países (ponentes)</h3>
                    <canvas id="chart-speakers-country"></canvas>
                </div>
                <div class="stats-chart-card">
                    <h3>Top organismos</h3>
                    <canvas id="chart-agencies"></canvas>
                </div>
                <div class="stats-chart-card stats-chart-wide">
                    <h3>Top 10 ponentes/autores (por presentaciones)</h3>
                    <canvas id="chart-top-speakers"></canvas>
                </div>
            </div>
        </div>
    `;

    buildCharts(stats);

    document.getElementById('btn-download-geojson')
        ?.addEventListener('click', () => downloadGeoJson(data));
}

// ---------------------------------------------------------------------------
// Chart builders
// ---------------------------------------------------------------------------

function buildCharts(stats) {
    const BLUE_PALETTE = [
        '#2196F3','#4CAF50','#FF5722','#9C27B0','#FF9800',
        '#00BCD4','#E91E63','#8BC34A','#673AB7','#F44336',
    ];

    // Events by year — vertical bar
    createChart('chart-events-year', 'bar', {
        labels:   [...stats.eventsByYear.keys()],
        datasets: [{
            label:           'Eventos',
            data:            [...stats.eventsByYear.values()],
            backgroundColor: '#2196F3',
            borderColor:     '#1565C0',
            borderWidth:     1,
            borderRadius:    4,
        }]
    }, {
        plugins: { legend: { display: false } },
        scales:  { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    });

    // Top countries by events — horizontal bar
    const countryLabels = stats.topCountries.map(([c]) => c);
    const countryValues = stats.topCountries.map(([, v]) => v);
    createChart('chart-events-country', 'bar', {
        labels:   countryLabels,
        datasets: [{
            label:           'Eventos',
            data:            countryValues,
            backgroundColor: BLUE_PALETTE.slice(0, countryLabels.length),
            borderWidth:     1,
        }]
    }, {
        indexAxis: 'y',
        plugins:   { legend: { display: false } },
        scales:    { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    });

    // Presentations by language — doughnut
    const langLabels = stats.topLanguages.map(([l]) => l);
    const langValues = stats.topLanguages.map(([, v]) => v);
    createChart('chart-languages', 'doughnut', {
        labels:   langLabels,
        datasets: [{
            data:            langValues,
            backgroundColor: BLUE_PALETTE.slice(0, langLabels.length),
            borderWidth:     2,
        }]
    }, {
        plugins: {
            legend: { position: 'right', labels: { boxWidth: 14, font: { size: 11 } } }
        }
    });

    // Speakers by country — horizontal bar
    const spLabels = stats.topSpeakerCountries.map(([c]) => c);
    const spValues = stats.topSpeakerCountries.map(([, v]) => v);
    createChart('chart-speakers-country', 'bar', {
        labels:   spLabels,
        datasets: [{
            label:           'Ponentes',
            data:            spValues,
            backgroundColor: '#FF5722',
            borderWidth:     1,
        }]
    }, {
        indexAxis: 'y',
        plugins:   { legend: { display: false } },
        scales:    { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    });

    // Top agencies — horizontal bar
    const agLabels = stats.topAgencies.map(([a]) => a);
    const agValues = stats.topAgencies.map(([, v]) => v);
    createChart('chart-agencies', 'bar', {
        labels:   agLabels,
        datasets: [{
            label:           'Eventos',
            data:            agValues,
            backgroundColor: '#9C27B0',
            borderWidth:     1,
        }]
    }, {
        indexAxis: 'y',
        plugins:   { legend: { display: false } },
        scales:    { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    });

    // Top 10 speakers by presentation count — horizontal bar
    const spkLabels = stats.topSpeakers.map(([name]) => name);
    const spkValues = stats.topSpeakers.map(([, v]) => v);
    createChart('chart-top-speakers', 'bar', {
        labels:   spkLabels,
        datasets: [{
            label:           'Presentaciones',
            data:            spkValues,
            backgroundColor: BLUE_PALETTE.slice(0, spkLabels.length),
            borderWidth:     1,
            borderRadius:    4,
        }]
    }, {
        indexAxis: 'y',
        plugins:   { legend: { display: false } },
        scales:    { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
    });
}

function createChart(id, type, chartData, options = {}) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    chartInstances[id] = new Chart(canvas, {
        type,
        data:    chartData,
        options: {
            responsive:          true,
            maintainAspectRatio: true,
            ...options,
        }
    });
}

function destroyAllCharts() {
    Object.entries(chartInstances).forEach(([id, chart]) => {
        chart?.destroy();
        delete chartInstances[id];
    });
}

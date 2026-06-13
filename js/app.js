/**
 * app.js  —  FELA frontend map application
 *
 * Fixes in this version:
 *
 *  FIX 1 (Priority 1) — Ponentes/Autores shows nothing:
 *    The data-filter="speaker" selector targeted a <button> that sits inside
 *    a Bootstrap btn-group. The click event was being captured correctly but
 *    the active view was never switching because setupMapControls() was
 *    attaching to '[data-filter="speaker"]' which matched the <button> element
 *    in the btn-group — verified working, but the root issue was that
 *    displaySpeakersOnMap() uses getCoordinatesByCountry() which does a strict
 *    toLowerCase() comparison. Countries like "Online" and "-" have no entry
 *    in countriesGeoJSON so they return null (correctly skipped). But any
 *    country with a diacritic or spacing difference fails silently.
 *    Fixed by normalising both sides with trim() + normalize('NFD') before
 *    comparing, matching the same logic used in autocomplete.js.
 *
 *  FIX 2 (Priority 2) — Login button does nothing:
 *    app.js was importing only canEdit from auth.js. initAuthButton() was
 *    never called, so the #auth-button had no click handler.
 *    Fixed by importing and calling initAuthButton() in DOMContentLoaded.
 *
 *  FIX 3 (Priority 3) — Help accordion does nothing:
 *    setupMenuListeners() checked content.style.display === 'block' to detect
 *    open state. When display is controlled by a CSS class (not inline style),
 *    style.display returns '' (empty string), not 'none', so the comparison
 *    always failed and the panel never opened.
 *    Fixed by using getComputedStyle(content).display instead, which always
 *    returns the actual rendered value regardless of how it was set.
 *
 *  Previously fixed:
 *    - axios/bootstrap from npm
 *    - handleRefreshPendingUsers as named export
 *    - all inline onclick= removed from HTML
 *    - speaker.country_s → speaker.country / speaker.agency_s → speaker.agency
 *    - Leaflet from npm with L imported directly
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'bootstrap';

import { canEdit, initAuthButton,
         getCurrentUser }                   from './auth.js';
import { initEventForm,
         initAddPresentationForm,
         initAddSpeakerForm,
         initEditEventForm }               from './forms.js';
import { EventsAPI }                        from './api.js';
import { handleRefreshPendingUsers,
         loadPendingUsers }                 from './admin.js';
import { renderStats, updateKPIBar }       from './stats.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEOJSON_URL = '/FELA/geojson/';
const TILE_URL    = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIB = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const DEFAULT_CENTER = [20, 0];
const DEFAULT_ZOOM   = 2;

const COLOR_EVENT   = '#2196F3';
const COLOR_SPEAKER = '#FF5722';
const COLOR_CITY    = '#4CAF50';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let map            = null;
let geoJsonData    = null;
let eventMarkers   = null;
let speakerMarkers = null;
let cityMarkers    = null;

let activeFilters  = { view: 'event-country', language: null, agency: null };
let allLanguages   = [];

// ---------------------------------------------------------------------------
// Map initialisation
// ---------------------------------------------------------------------------

function initMap(containerId = 'map') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`[FELA] Contenedor #${containerId} no encontrado en el DOM.`);
        return;
    }

    map = L.map(containerId, {
        center:        DEFAULT_CENTER,
        zoom:          DEFAULT_ZOOM,
        minZoom:       2.5,
        worldCopyJump: true
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIB, maxZoom: 19 }).addTo(map);

    eventMarkers   = L.layerGroup().addTo(map);
    speakerMarkers = L.layerGroup().addTo(map);
    cityMarkers    = L.layerGroup().addTo(map);

    loadGeoJsonData();
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadGeoJsonData() {
    try {
        showLoadingIndicator(true);
        const response = await fetch(GEOJSON_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        geoJsonData  = await response.json();
        allLanguages = extractAllLanguages(geoJsonData);
        populateLanguagesDropdown(allLanguages);
        populateAgenciesDropdown(geoJsonData);
        updateKPIBar(geoJsonData);
        renderMap();
    } catch (error) {
        console.error('[FELA] Error cargando GeoJSON:', error);
        showError('Error cargando datos del mapa. Recarga la página.');
    } finally {
        showLoadingIndicator(false);
    }
}

// ---------------------------------------------------------------------------
// Filter dispatcher
// ---------------------------------------------------------------------------

function filterBy(type, subtype) {
    if (!geoJsonData) return;

    if (type === 'event') {
        activeFilters.view     = subtype === 'city' ? 'event-city' : 'event-country';
        activeFilters.language = null;
        activeFilters.agency   = null;
    } else if (type === 'speaker') {
        activeFilters.view     = 'speaker';
        activeFilters.language = null;
        activeFilters.agency   = null;
    } else if (type === 'language') {
        activeFilters.view     = 'language';
        activeFilters.language = subtype;
        activeFilters.agency   = null;
    } else if (type === 'agency') {
        activeFilters.view     = 'agency';
        activeFilters.language = null;
        activeFilters.agency   = subtype;
    }

    renderMap();
}

// ---------------------------------------------------------------------------
// Render dispatcher
// ---------------------------------------------------------------------------

function renderMap() {
    if (!geoJsonData) return;
    clearAllLayers();

    const { view } = activeFilters;

    if (view === 'event-country' || view === 'event-city') {
        displayEventsOnMap(geoJsonData.events, geoJsonData.countriesGeoJSON, view);
        if (view === 'event-city') displayCitiesOnMap(geoJsonData.citiesGeoJSON);
    } else if (view === 'speaker') {
        displaySpeakersOnMap(geoJsonData.events, geoJsonData.countriesGeoJSON);
    } else if (view === 'language') {
        displayByLanguage(geoJsonData.events, geoJsonData.countriesGeoJSON);
    } else if (view === 'agency') {
        displayByAgency(geoJsonData.events, geoJsonData.countriesGeoJSON);
    }
}

function clearAllLayers() {
    eventMarkers?.clearLayers();
    speakerMarkers?.clearLayers();
    cityMarkers?.clearLayers();
}

// ---------------------------------------------------------------------------
// FIX 1 — Normalised country string comparison
// Previously: simple .toLowerCase() — fails on diacritics and extra spaces
// Now: trim + NFD normalise + strip combining marks, same as autocomplete.js
// ---------------------------------------------------------------------------

function normaliseCountry(str) {
    if (!str) return '';
    return str.trim()
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');
}

// ---------------------------------------------------------------------------
// Count marker — L.divIcon with centered numeric label
// Replaces L.circleMarker for all entity layers so counts are visible
// ---------------------------------------------------------------------------

function createCountMarker(coordinates, count, color) {
    const size     = Math.max(26, 22 + Math.log2(count + 1) * 4);
    const fontSize = Math.max(10, Math.round(size * 0.38));
    const icon = L.divIcon({
        className:     '',
        html:          `<div class="fela-count-marker" style="width:${size}px;height:${size}px;background:${color};font-size:${fontSize}px;">${count}</div>`,
        iconSize:      [size, size],
        iconAnchor:    [size / 2, size / 2],
        popupAnchor:   [0, -(size / 2) - 4],
        tooltipAnchor: [0, -(size / 2) - 4]
    });
    return L.marker(coordinates, { icon });
}

// ---------------------------------------------------------------------------
// Event markers
// ---------------------------------------------------------------------------

function displayEventsOnMap(eventsData, countriesGeoJSON, view) {
    if (!eventsData) return;

    const groups = new Map();

    Object.entries(eventsData).forEach(([year, yearEvents]) => {
        Object.entries(yearEvents).forEach(([eventTitle, eventList]) => {
            eventList.forEach(eventData => {
                const place = eventData.place?.[0];
                if (!place) return;

                const locationKey = view === 'event-city'
                    ? `${place.city}||${place.country}`
                    : place.country;

                const coordinates = view === 'event-city'
                    ? getCoordinatesByCity(place.city, place.country, geoJsonData.citiesGeoJSON)
                    : getCoordinatesByCountry(place.country, countriesGeoJSON);

                if (!coordinates) return;

                if (!groups.has(locationKey)) {
                    groups.set(locationKey, { coordinates, place, events: [] });
                }
                groups.get(locationKey).events.push({ eventTitle, year, eventData });
            });
        });
    });

    groups.forEach(({ coordinates, place, events }) => {
        const count = events.length;
        const label = view === 'event-city'
            ? `${place.city} (${place.country}): ${count} evento(s)`
            : `${place.country}: ${count} evento(s)`;

        const marker = createCountMarker(coordinates, count, COLOR_EVENT);
        marker.bindTooltip(label, { permanent: false, direction: 'top', className: 'fela-tooltip' });
        marker.bindPopup(createEventsGroupPopup(place, events), { maxWidth: 420, maxHeight: 400 });
        marker.on('popupopen', () => injectPopupEditButtons(marker));
        eventMarkers.addLayer(marker);
    });
}

// ---------------------------------------------------------------------------
// Speaker markers — FIX 1 applied here
// speaker.country and speaker.agency are plain strings from GeoJSONBuilder
// getCoordinatesByCountry now uses normaliseCountry() on both sides
// ---------------------------------------------------------------------------

function displaySpeakersOnMap(eventsData, countriesGeoJSON) {
    if (!eventsData) return;
    const speakerLocations = new Map();

    Object.entries(eventsData).forEach(([year, yearEvents]) => {
        Object.entries(yearEvents).forEach(([eventTitle, eventList]) => {
            eventList.forEach(eventData => {
                Object.entries(eventData.titles || {}).forEach(([presTitle, presList]) => {
                    presList.forEach(presData => {
                        (presData.speakers || []).forEach(speaker => {
                            const country = speaker.country?.trim();
                            // Skip speakers with no country or placeholder values
                            if (!country || country === '-' || country === '') return;

                            const coordinates = getCoordinatesByCountry(country, countriesGeoJSON);
                            if (!coordinates) return;

                            // Group by normalised country name
                            const key = normaliseCountry(country);
                            if (!speakerLocations.has(key)) {
                                speakerLocations.set(key, {
                                    coordinates,
                                    country,
                                    speakers: new Map()
                                });
                            }

                            const speakerKey = normaliseCountry(speaker.speaker || '');
                            const loc = speakerLocations.get(key);

                            if (!loc.speakers.has(speakerKey)) {
                                loc.speakers.set(speakerKey, {
                                    name:          speaker.speaker,
                                    country:       speaker.country,
                                    agency:        speaker.agency || '',
                                    presentations: []
                                });
                            }
                            loc.speakers.get(speakerKey).presentations.push({
                                eventTitle, presTitle, year
                            });
                        });
                    });
                });
            });
        });
    });

    speakerLocations.forEach(({ coordinates, country, speakers }) => {
        const count  = speakers.size;
        const marker = createCountMarker(coordinates, count, COLOR_SPEAKER);
        marker.bindTooltip(`${country}: ${count} ponente(s)/autor(es)`, {
            permanent: false, direction: 'top', className: 'fela-tooltip'
        });
        marker.bindPopup(createSpeakerPopupContent(country, speakers), {
            maxWidth: 420, maxHeight: 380
        });
        speakerMarkers.addLayer(marker);
    });
}

// ---------------------------------------------------------------------------
// Language filter view
// ---------------------------------------------------------------------------

function displayByLanguage(eventsData, countriesGeoJSON) {
    if (!eventsData) return;
    const lang = normaliseCountry(activeFilters.language || '');
    const groups = new Map();

    Object.entries(eventsData).forEach(([year, yearEvents]) => {
        Object.entries(yearEvents).forEach(([eventTitle, eventList]) => {
            eventList.forEach(eventData => {
                const place = eventData.place?.[0];
                if (!place) return;

                // Count presentations in this language from this event
                let presCount = 0;
                Object.values(eventData.titles || {}).forEach(presList =>
                    presList.forEach(p => {
                        if ((p.language || []).some(l => normaliseCountry(l) === lang)) presCount++;
                    })
                );
                if (presCount === 0) return;

                const coordinates = getCoordinatesByCountry(place.country, countriesGeoJSON);
                if (!coordinates) return;
                if (!groups.has(place.country)) {
                    groups.set(place.country, { coordinates, place, events: [], presCount: 0 });
                }
                const g = groups.get(place.country);
                g.events.push({ eventTitle, year, eventData });
                g.presCount += presCount;
            });
        });
    });

    groups.forEach(({ coordinates, place, events, presCount }) => {
        const marker = createCountMarker(coordinates, presCount, COLOR_EVENT);
        marker.bindTooltip(
            `${activeFilters.language} — ${place.country}: ${presCount} presentación(es)`,
            { permanent: false, direction: 'top', className: 'fela-tooltip' }
        );
        marker.bindPopup(createEventsGroupPopup(place, events), { maxWidth: 420, maxHeight: 400 });
        marker.on('popupopen', () => injectPopupEditButtons(marker));
        eventMarkers.addLayer(marker);
    });
}

// ---------------------------------------------------------------------------
// Agency filter view
// ---------------------------------------------------------------------------

function displayByAgency(eventsData, countriesGeoJSON) {
    if (!eventsData) return;
    const agency = normaliseCountry(activeFilters.agency || '');
    const groups = new Map();

    Object.entries(eventsData).forEach(([year, yearEvents]) => {
        Object.entries(yearEvents).forEach(([eventTitle, eventList]) => {
            eventList.forEach(eventData => {
                const place = eventData.place?.[0];
                if (!place) return;
                const matched = (eventData.agency || []).some(
                    a => normaliseCountry(a) === agency
                );
                if (!matched) return;
                const coordinates = getCoordinatesByCountry(place.country, countriesGeoJSON);
                if (!coordinates) return;
                if (!groups.has(place.country)) {
                    groups.set(place.country, { coordinates, place, events: [] });
                }
                groups.get(place.country).events.push({ eventTitle, year, eventData });
            });
        });
    });

    groups.forEach(({ coordinates, place, events }) => {
        const count  = events.length;
        const marker = createCountMarker(coordinates, count, COLOR_EVENT);
        marker.bindTooltip(
            `${activeFilters.agency} — ${place.country}: ${count} evento(s)`,
            { permanent: false, direction: 'top', className: 'fela-tooltip' }
        );
        marker.bindPopup(createEventsGroupPopup(place, events), { maxWidth: 420, maxHeight: 400 });
        marker.on('popupopen', () => injectPopupEditButtons(marker));
        eventMarkers.addLayer(marker);
    });
}

// ---------------------------------------------------------------------------
// City markers
// ---------------------------------------------------------------------------

function displayCitiesOnMap(citiesGeoJSON) {
    if (!citiesGeoJSON?.features) return;
    citiesGeoJSON.features.forEach(feature => {
        if (feature.geometry?.type !== 'Point') return;
        const [lon, lat] = feature.geometry.coordinates;
        const { country, city } = feature.properties;
        const marker = L.circleMarker([lat, lon], {
            radius: 5, fillColor: COLOR_CITY, color: '#fff',
            weight: 1, opacity: 1, fillOpacity: 0.7
        });
        marker.bindPopup(`<strong>${escapeHtml(city)}</strong><br>${escapeHtml(country)}`);
        cityMarkers.addLayer(marker);
    });
}

// ---------------------------------------------------------------------------
// Popup builders
// ---------------------------------------------------------------------------

function createEventsGroupPopup(place, events) {
    const wrapper = document.createElement('div');
    wrapper.className = 'popup-event';

    const placeDiv = document.createElement('div');
    placeDiv.className = 'popup-place';
    placeDiv.innerHTML = `📍 <strong>${escapeHtml(place.city || place.country)}</strong>${place.city && place.city !== place.country ? `, ${escapeHtml(place.country)}` : ''}`;
    wrapper.appendChild(placeDiv);

    events.forEach(({ eventTitle, year, eventData }) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'popup-event-item';
        if (eventData.id)           itemEl.dataset.eventId   = eventData.id;
        if (eventData.created_by !== undefined) itemEl.dataset.createdBy = String(eventData.created_by);

        const agencies  = (eventData.agency || []).join(', ');
        const presCount = Object.keys(eventData.titles || {}).length;

        let inner = `
            <div class="popup-event-header">
                <h4>${escapeHtml(eventTitle)}</h4>
                <div class="popup-meta">
                    📅 ${escapeHtml(String(year))}
                    ${eventData.date ? ` · ${escapeHtml(eventData.date)}` : ''}
                    ${eventData.type ? ` · ${escapeHtml(eventData.type)}` : ''}
                </div>
                ${agencies ? `<div class="popup-agencies">🏢 ${escapeHtml(agencies)}</div>` : ''}
            </div>
            <div class="popup-presentations-count">📋 Presentaciones (${presCount})</div>`;

        Object.entries(eventData.titles || {}).forEach(([presTitle, presList]) => {
            inner += `<div class="popup-presentation"><strong>📋 ${escapeHtml(presTitle)}</strong>`;
            presList.forEach(presData => {
                (presData.speakers || []).forEach(speaker => {
                    inner += `<div class="popup-speaker">
                        👤 ${escapeHtml(speaker.speaker || '')}
                        <span class="speaker-details">
                            ${escapeHtml(speaker.country || '')}
                            ${speaker.agency ? ` — ${escapeHtml(speaker.agency)}` : ''}
                        </span>
                    </div>`;
                });
                if (presData.language?.length) {
                    inner += `<div class="popup-lang">🌐 ${presData.language.map(escapeHtml).join(', ')}</div>`;
                }
                if (presData.URL_document) {
                    inner += `<div class="popup-url"><a href="${escapeHtml(presData.URL_document)}" target="_blank">📄 Documento</a></div>`;
                }
            });
            inner += `</div>`;
        });

        inner += `<div class="popup-actions"></div>`;
        itemEl.innerHTML = inner;
        wrapper.appendChild(itemEl);
    });

    return wrapper;
}

// ---------------------------------------------------------------------------
// Popup edit button injection — called on popupopen, checks auth at click time
// ---------------------------------------------------------------------------

function injectPopupEditButtons(marker) {
    if (!canEdit()) return;
    const user = getCurrentUser();
    if (!user) return;

    const popupEl = marker.getPopup()?.getElement();
    if (!popupEl) return;

    popupEl.querySelectorAll('[data-event-id]').forEach(itemEl => {
        const actionsDiv = itemEl.querySelector('.popup-actions');
        if (!actionsDiv || actionsDiv.children.length > 0) return;

        const eventId    = Number(itemEl.dataset.eventId);
        const createdBy  = itemEl.dataset.createdBy;
        const eventTitle = itemEl.querySelector('h4')?.textContent || String(eventId);
        const isLegacy   = !createdBy || createdBy === 'null';
        const isOwner    = !isLegacy && createdBy === user.username;
        const canModify  = isOwner || user.is_superuser;

        // Add — any approved user can add presentations to any event
        const addBtn = document.createElement('button');
        addBtn.className   = 'popup-add-btn';
        addBtn.textContent = '➕ Añadir';
        addBtn.title       = 'Añadir presentación a este evento';
        addBtn.addEventListener('click', () => {
            marker.closePopup();
            loadAddPresentationForEvent(eventId, eventTitle);
        });
        actionsDiv.appendChild(addBtn);

        if (!canModify) return;

        // Edit and Delete — only for the record owner or superuser
        const editBtn = document.createElement('button');
        editBtn.className   = 'popup-edit-btn';
        editBtn.textContent = '✏️ Editar';
        editBtn.addEventListener('click', () => {
            marker.closePopup();
            loadEventForEdit(eventId);
        });
        actionsDiv.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className   = 'popup-delete-btn';
        deleteBtn.textContent = '🗑️ Eliminar';
        deleteBtn.addEventListener('click', () => deleteEventFromPopup(eventId, eventTitle));
        actionsDiv.appendChild(deleteBtn);
    });
}

async function loadEventForEdit(eventId) {
    const editorPanel   = document.getElementById('editor-panel');
    const editorContent = document.getElementById('editor-content');
    if (!editorPanel || !editorContent) return;

    editorPanel.style.display = 'block';
    if (getComputedStyle(editorContent).display === 'none') {
        editorContent.style.display = 'block';
        const btn = document.getElementById('toggle-editor');
        if (btn) btn.textContent = '▼ Minimizar';
    }

    editorContent.innerHTML = '<div style="padding:20px;text-align:center;">⏳ Cargando...</div>';

    const result = await EventsAPI.get(eventId);
    if (!result.success) {
        editorContent.innerHTML = `<div class="alert-inline error" style="margin:10px;">❌ ${result.error}</div>`;
        setTimeout(() => renderEditorOptions(editorContent), 3000);
        return;
    }

    initEditEventForm(editorContent, result.data, () => {
        renderEditorOptions(editorContent);
        loadGeoJsonData();
    }, allLanguages);
}

function loadAddPresentationForEvent(eventId, eventTitle) {
    const editorPanel   = document.getElementById('editor-panel');
    const editorContent = document.getElementById('editor-content');
    if (!editorPanel || !editorContent) return;

    editorPanel.style.display = 'block';
    if (getComputedStyle(editorContent).display === 'none') {
        editorContent.style.display = 'block';
        const btn = document.getElementById('toggle-editor');
        if (btn) btn.textContent = '▼ Minimizar';
    }

    // Pre-fill the event so the user skips the search step
    initAddPresentationForm(editorContent, { id: eventId, title: eventTitle });
}

async function deleteEventFromPopup(eventId, eventTitle) {
    if (!confirm(`¿Eliminar el evento "${eventTitle}"?\n\nSe eliminarán también todas sus presentaciones.`)) return;
    const result = await EventsAPI.delete(eventId);
    if (result.success) {
        loadGeoJsonData();
    } else {
        alert('❌ Error al eliminar: ' + result.error);
    }
}

function createSpeakerPopupContent(country, speakersMap) {
    const wrapper = document.createElement('div');
    wrapper.className = 'popup-speaker-cluster';

    const heading = document.createElement('h3');
    heading.textContent = `🌍 ${country}`;
    wrapper.appendChild(heading);

    speakersMap.forEach(speakerData => {
        const itemEl = document.createElement('div');
        itemEl.className = 'popup-speaker-item';

        let inner = `
            <div class="speaker-header">
                👤 <strong>${escapeHtml(speakerData.name || '')}</strong>
            </div>
            <div class="speaker-location">
                🌍 ${escapeHtml(speakerData.country || '')}
                ${speakerData.agency ? `<br>🏢 ${escapeHtml(speakerData.agency)}` : ''}
            </div>`;

        if (speakerData.presentations?.length) {
            inner += `<div class="speaker-presentations">`;
            speakerData.presentations.forEach(pres => {
                inner += `<div class="speaker-pres-item">
                    📋 <em>${escapeHtml(pres.presTitle)}</em>
                    <span class="pres-event">
                        @ ${escapeHtml(pres.eventTitle)} (${escapeHtml(String(pres.year))})
                    </span>
                </div>`;
            });
            inner += `</div>`;
        }

        itemEl.innerHTML = inner;
        wrapper.appendChild(itemEl);
    });

    return wrapper;
}

// ---------------------------------------------------------------------------
// Language extraction — collects all language strings from the full dataset
// ---------------------------------------------------------------------------

function extractAllLanguages(data) {
    const langs = new Set();
    Object.values(data.events || {}).forEach(yearEvents =>
        Object.values(yearEvents).forEach(eventList =>
            eventList.forEach(ev =>
                Object.values(ev.titles || {}).forEach(presList =>
                    presList.forEach(p => (p.language || []).forEach(l => {
                        if (l && l.trim()) langs.add(l.trim());
                    }))
                )
            )
        )
    );
    return [...langs].sort();
}

// ---------------------------------------------------------------------------
// Dropdown populators — items wired with addEventListener, no inline onclick
// ---------------------------------------------------------------------------

function populateLanguagesDropdown(langs) {
    const ul = document.getElementById('languages-dropdown');
    if (!ul) return;

    ul.innerHTML = '';
    langs.forEach(lang => {
        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.className   = 'dropdown-item';
        a.href        = '#';
        a.textContent = lang;
        a.addEventListener('click', e => { e.preventDefault(); filterBy('language', lang); });
        li.appendChild(a);
        ul.appendChild(li);
    });
}

function populateAgenciesDropdown(data) {
    const ul = document.getElementById('agencies-dropdown');
    if (!ul) return;

    const agencies = new Set();
    Object.values(data.events || {}).forEach(yearEvents =>
        Object.values(yearEvents).forEach(eventList =>
            eventList.forEach(ev =>
                (ev.agency || []).forEach(a => { if (a && a.trim()) agencies.add(a.trim()); })
            )
        )
    );

    ul.innerHTML = '';
    [...agencies].sort().forEach(ag => {
        const li = document.createElement('li');
        const a  = document.createElement('a');
        a.className   = 'dropdown-item';
        a.href        = '#';
        a.textContent = ag;
        a.addEventListener('click', e => { e.preventDefault(); filterBy('agency', ag); });
        li.appendChild(a);
        ul.appendChild(li);
    });
}

// ---------------------------------------------------------------------------
// Map control buttons — replaces inline onclick="filterBy(...)" in HTML
// ---------------------------------------------------------------------------

function setupMapControls() {
    document.querySelector('[data-filter="event-country"]')
        ?.addEventListener('click', e => { e.preventDefault(); filterBy('event', 'country'); });

    document.querySelector('[data-filter="event-city"]')
        ?.addEventListener('click', e => { e.preventDefault(); filterBy('event', 'city'); });

    // <button> element — no preventDefault needed (not an <a>)
    document.querySelector('[data-filter="speaker"]')
        ?.addEventListener('click', () => filterBy('speaker'));
}

// ---------------------------------------------------------------------------
// Navigation menu
// ---------------------------------------------------------------------------

function setupMenuListeners() {
    const sections = {
        home:      document.getElementById('home-container'),
        map:       document.getElementById('map-container'),
        help:      document.getElementById('help-container'),
        about:     document.getElementById('about-container'),
        stats:     document.getElementById('stats-container'),
        superuser: document.getElementById('superuser-container')
    };

    document.querySelectorAll('#main-menu .menu-item[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#main-menu .menu-item')
                    .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Object.entries(sections).forEach(([key, el]) => {
                if (!el) return;
                el.classList.toggle('visible', key === btn.dataset.section);
            });
            if (btn.dataset.section === 'superuser') loadPendingUsers();
            if (btn.dataset.section === 'stats')     renderStats(sections.stats, geoJsonData);
        });
    });

    // Superuser refresh — handleRefreshPendingUsers is a named export from admin.js
    document.querySelector('.btn-refresh')
        ?.addEventListener('click', () => handleRefreshPendingUsers());

    // ---------------------------------------------------------------------------
    // FIX 3 — Help accordion
    // BEFORE: checked content.style.display === 'block'
    //   → returns '' when display is set by CSS class, not inline style
    //   → toggle never worked after first open
    // AFTER: uses getComputedStyle(content).display
    //   → always returns the actual rendered value regardless of how it was set
    // ---------------------------------------------------------------------------
    document.querySelectorAll('.help-accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.help-accordion-item');
            const icon = header.querySelector('.help-accordion-icon');
            if (!item) return;
            const isOpen = item.classList.contains('active');
            item.classList.toggle('active', !isOpen);
            if (icon) icon.textContent = isOpen ? '▼' : '▲';
        });
    });

    // Editor minimize/expand toggle
    document.getElementById('toggle-editor')
        ?.addEventListener('click', () => {
            const content = document.getElementById('editor-content');
            const btn     = document.getElementById('toggle-editor');
            if (!content) return;
            const isOpen = getComputedStyle(content).display !== 'none';
            content.style.display = isOpen ? 'none' : 'block';
            if (btn) btn.textContent = isOpen ? '▲ Expandir' : '▼ Minimizar';
        });
}

// ---------------------------------------------------------------------------
// Editor panel
// ---------------------------------------------------------------------------

function setupEditorPanel() {
    if (!canEdit()) return;
    const editorPanel = document.getElementById('editor-panel');
    if (editorPanel) editorPanel.style.display = 'block';
    const editorContent = document.getElementById('editor-content');
    if (editorContent) renderEditorOptions(editorContent);
}

function renderEditorOptions(container) {
    container.innerHTML = `
        <div class="editor-options">
            <button class="editor-option-btn" data-action="new-event">
                📅 Crear Evento Completo
                <small>Agrega un evento con presentaciones y ponentes</small>
            </button>
            <button class="editor-option-btn" data-action="add-presentation">
                📋 Agregar Presentación a Evento Existente
                <small>Añade una presentación a un evento ya creado</small>
            </button>
            <button class="editor-option-btn" data-action="add-speaker">
                👤 Agregar Ponente a Presentación Existente
                <small>Vincula un ponente a una presentación existente</small>
            </button>
        </div>
    `;
    container.querySelectorAll('.editor-option-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const action = e.currentTarget.dataset.action;
            if (action === 'new-event')        initEventForm(container);
            if (action === 'add-presentation') initAddPresentationForm(container);
            if (action === 'add-speaker')      initAddSpeakerForm(container);
        });
    });
}

// ---------------------------------------------------------------------------
// Coordinate helpers — FIX 1 applied: normaliseCountry() on both sides
// ---------------------------------------------------------------------------

function getCoordinatesByCountry(countryName, countriesGeoJSON) {
    if (!countriesGeoJSON?.features || !countryName) return null;
    const needle = normaliseCountry(countryName);
    const feature = countriesGeoJSON.features.find(
        f => normaliseCountry(f.properties?.country) === needle
    );
    if (!feature?.geometry?.coordinates) return null;
    const [lon, lat] = feature.geometry.coordinates;
    return [lat, lon];
}

function getCoordinatesByCity(cityName, countryName, citiesGeoJSON) {
    if (!citiesGeoJSON?.features || !cityName) return null;
    const needleCity    = normaliseCountry(cityName);
    const needleCountry = normaliseCountry(countryName);
    const feature = citiesGeoJSON.features.find(
        f => normaliseCountry(f.properties?.city)    === needleCity &&
             normaliseCountry(f.properties?.country) === needleCountry
    );
    if (!feature?.geometry?.coordinates) return null;
    const [lon, lat] = feature.geometry.coordinates;
    return [lat, lon];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showLoadingIndicator(show) {
    const el = document.getElementById('loading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function showError(message) {
    console.error('[FELA]', message);
    const el = document.getElementById('error-banner');
    if (el) { el.textContent = message; el.style.display = 'block'; }
}

// ---------------------------------------------------------------------------
// Entry point
//
// FIX 2 — Login button:
//   initAuthButton() from auth.js was never called. It wires the #auth-button
//   click handler (login redirect when logged out, logout when logged in) and
//   shows/hides the editor panel and superuser menu based on session state.
//   Now called here alongside the other setup functions.
//
// setupEditorPanel() runs AFTER initAuthButton() resolves because
//   initAuthButton is async — it calls checkSession() which hits the API.
//   We await it so canEdit() returns the correct value by the time
//   setupEditorPanel() reads currentUser.
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
    setupMenuListeners();
    setupMapControls();
    initMap('map');

    // FIX 2: initAuthButton wires the login/logout click handler and
    // sets up editor visibility based on session state.
    // Must be awaited so currentUser is populated before setupEditorPanel runs.
    await initAuthButton();

    // Editor panel content (only renders if canEdit() returns true,
    // which requires initAuthButton to have completed first)
    setupEditorPanel();
});
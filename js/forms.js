/**
 * forms.js
 *
 * Changes from previous version (backend API alignment):
 *
 *  FIELD RENAMES (backend model refactor):
 *   - Speaker response: 'country_s' → 'country' (plain string)
 *   - Speaker response: 'agency_s'  → 'agency'  (plain string)
 *   - Speaker create payload: 'country_s' → 'country', 'agency_s' → 'agency'
 *   - Presentation create payload: 'event_title' (string) → 'event' (integer ID)
 *
 *  FUNCTIONS MODIFIED:
 *   - handleGlobalSpeakerSelect()         reads .country / .agency
 *   - applySpeakerFieldsFromData()        reads .country / .agency
 *   - handleAddPresentationSubmit()       sends event ID not event_title string
 *                                         SpeakersAPI.create payload updated
 *   - handleLocalSpeakerSelect()          reads .country / .agency
 *   - handleAddSpeakerSubmit()            SpeakersAPI.create payload updated
 *
 *  NO LOGIC CHANGES — only field-name alignment with new serializers.
 */
import axios from 'axios'
import { EventsAPI, PresentationsAPI, SpeakersAPI, AgenciesAPI, CountriesAPI, CitiesAPI } from './api.js';
import { Autocomplete } from './autocomplete.js';
import { canEdit } from './auth.js';

const MAX_PRESENTATIONS = 10;

let formState = {
    country: null,
    city: null,
    agencies: [],
    presentations: []
};

let autocompleteInstances = [];
let currentAvailableEventTypes = [];
let currentAvailableLanguages  = [];

// ===========================================================================
// HELPERS
// ===========================================================================

function showFormAlert(message, type = 'info', containerId = 'form-alert') {
    const alertDiv = document.getElementById(containerId);
    if (!alertDiv) { console.warn(`Alert container ${containerId} not found`); return; }
    alertDiv.className = `alert-inline ${type}`;
    alertDiv.textContent = message;
    alertDiv.style.display = 'block';
    if (type === 'success') setTimeout(() => { alertDiv.style.display = 'none'; }, 5000);
}

function resetFormState() {
    formState = {
        country: null,
        city: null,
        agencies: [],
        presentations: [{
            title: '',
            languages: [],
            url: '',
            observations: '',
            speakers: [{ name: '', country: null, agency: '' }]
        }]
    };
    autocompleteInstances.forEach(instance => instance.destroy());
    autocompleteInstances = [];
}

// ---------------------------------------------------------------------------
// Lazy country validation — ensures coordinates exist before submit
// ---------------------------------------------------------------------------
async function ensureCountryDataComplete(speakerData, speakerIndex, formStateRef) {
    console.log(`🔍 [LAZY-VALIDATE] Validating country for speaker #${speakerIndex + 1}:`, speakerData);

    if (speakerData.countryData && speakerData.countryData.lat && speakerData.countryData.lon) {
        return { success: true, data: speakerData.countryData };
    }

    const countryName = speakerData.country;
    if (!countryName || !countryName.trim()) {
        return { success: false, error: `Speaker "${speakerData.name}" has no country specified.` };
    }

    try {
        // 1. Search local DB
        const searchResult = await CountriesAPI.list(countryName);
        if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
            const found = searchResult.data.results[0];
            const countryData = { name: found.country, lat: found.lat, lon: found.lon, isNew: false, createdNow: false };
            speakerData.countryData = countryData;
            if (formStateRef?.speakers?.[speakerIndex]) formStateRef.speakers[speakerIndex].countryData = countryData;
            return { success: true, data: countryData };
        }

        // 2. Nominatim fallback
        const nomResp = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: { country: countryName, format: 'json', addressdetails: 1, limit: 5 },
            headers: { 'Accept-Language': 'es,en' },
            timeout: 5000
        });
        if (!nomResp.data || nomResp.data.length === 0) {
            return { success: false, error: `No se encontraron coordenadas para «${countryName}». Selecciónalo desde el menú desplegable.` };
        }

        const coords = { lat: parseFloat(nomResp.data[0].lat), lon: parseFloat(nomResp.data[0].lon) };
        const createResult = await CountriesAPI.create({ country: countryName, lat: coords.lat, lon: coords.lon });

        if (!createResult.success) {
            // May already exist (race condition) — retry search
            const retry = await CountriesAPI.list(countryName);
            if (retry.success && retry.data.results && retry.data.results.length > 0) {
                const existing = retry.data.results[0];
                const countryData = { name: existing.country, lat: existing.lat, lon: existing.lon, isNew: false, createdNow: false };
                speakerData.countryData = countryData;
                if (formStateRef?.speakers?.[speakerIndex]) formStateRef.speakers[speakerIndex].countryData = countryData;
                return { success: true, data: countryData };
            }
            return { success: false, error: `Could not create country "${countryName}": ${createResult.error}` };
        }

        const countryData = { name: countryName, lat: coords.lat, lon: coords.lon, isNew: true, createdNow: true };
        speakerData.countryData = countryData;
        if (formStateRef?.speakers?.[speakerIndex]) formStateRef.speakers[speakerIndex].countryData = countryData;
        return { success: true, data: countryData };

    } catch (error) {
        return { success: false, error: `Error al validar el país «${countryName}»: ${error.message}` };
    }
}

// ===========================================================================
// GLOBAL AUTOCOMPLETE HANDLERS
// ===========================================================================

/**
 * Speaker selected from autocomplete suggestion list.
 *
 * CHANGED: reads .country (was .country_s?.country || .country_s)
 *          reads .agency  (was .agency_s)
 */
function handleGlobalSpeakerSelect(speakerData, type, presentationIndex, speakerIndex) {
    console.log('🔵 [GLOBAL] Speaker selected:', speakerData);

    if (!formState.presentations[presentationIndex]) formState.presentations[presentationIndex] = { speakers: [] };
    if (!formState.presentations[presentationIndex].speakers[speakerIndex]) {
        formState.presentations[presentationIndex].speakers[speakerIndex] = {};
    }

    // CHANGED: .country (string) and .agency (string) — no legacy _s suffixes
    formState.presentations[presentationIndex].speakers[speakerIndex] = {
        id: speakerData.id,
        name: speakerData.name,
        country: speakerData.country ?? '',
        countryData: null,          // plain string — no nested object
        agency: speakerData.agency ?? ''
    };

    const speakerRow = document.querySelector(
        `.speaker-row[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    if (!speakerRow) return;

    const hiddenIdInput  = speakerRow.querySelector('.speaker-id');
    const nameInput      = speakerRow.querySelector('.speaker-name');
    const countryInput   = speakerRow.querySelector('.speaker-country');
    const agencyInput    = speakerRow.querySelector('.speaker-agency');

    if (hiddenIdInput) hiddenIdInput.value = speakerData.id;
    if (nameInput)     nameInput.value     = speakerData.name;

    if (countryInput) {
        // CHANGED: .country is now a plain string
        countryInput.value = speakerData.country ?? '';
        countryInput.disabled = true;
        countryInput.style.backgroundColor = '#f0f0f0';
        countryInput.title = 'Bloqueado — ponente existente';
    }
    if (agencyInput) {
        // CHANGED: .agency is now a plain string
        agencyInput.value = speakerData.agency ?? '';
        agencyInput.disabled = true;
        agencyInput.style.backgroundColor = '#f0f0f0';
        agencyInput.title = 'Bloqueado — ponente existente';
    }

    let statusIndicator = speakerRow.querySelector('.speaker-status-indicator');
    if (!statusIndicator) {
        statusIndicator = document.createElement('small');
        statusIndicator.className = 'speaker-status-indicator';
        statusIndicator.style.cssText = 'display:block;color:#28a745;font-size:0.8rem;margin-top:4px;';
        statusIndicator.textContent = '✓ Ponente existente en la BD';
        if (nameInput?.parentNode) nameInput.parentNode.appendChild(statusIndicator);
    }
}

/**
 * Country selected from autocomplete for a speaker inside main create-event form.
 */
async function handleGlobalSpeakerCountrySelect(data, type, presentationIndex, speakerIndex) {
    const speakerRow = document.querySelector(
        `.speaker-row[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    if (!speakerRow) return;

    const countryInput = speakerRow.querySelector('.speaker-country');
    if (!countryInput) return;

    let statusIndicator = countryInput.parentNode.querySelector('.country-status-indicator');
    if (!statusIndicator) {
        statusIndicator = document.createElement('small');
        statusIndicator.className = 'country-status-indicator';
        statusIndicator.style.cssText = 'display:block;margin-top:4px;font-size:0.8rem;';
        countryInput.parentNode.appendChild(statusIndicator);
    }

    const updateState = (countryData) => {
        if (!formState.presentations[presentationIndex]) formState.presentations[presentationIndex] = { speakers: [] };
        if (!formState.presentations[presentationIndex].speakers[speakerIndex]) {
            formState.presentations[presentationIndex].speakers[speakerIndex] = {};
        }
        formState.presentations[presentationIndex].speakers[speakerIndex].country     = countryData.name;
        formState.presentations[presentationIndex].speakers[speakerIndex].countryData = countryData;
    };

    if (type === 'nominatim') {
        statusIndicator.style.color = '#ffc107';
        statusIndicator.innerHTML = '⏳ Creando país en la BD...';
        countryInput.disabled = true;

        try {
            const createResult = await CountriesAPI.create({
                country: data.name,
                lat: parseFloat(data.lat),
                lon: parseFloat(data.lon)
            });

            if (createResult.success) {
                const countryData = { name: data.name, lat: parseFloat(data.lat), lon: parseFloat(data.lon), isNew: true, createdNow: true };
                updateState(countryData);
                countryInput.value = data.name;
                statusIndicator.style.color = '#28a745';
                statusIndicator.innerHTML = `✅ Creado: ${data.name}`;
                countryInput.style.backgroundColor = '#e7f5e7';
            } else {
                // May already exist
                const retry = await CountriesAPI.list(data.name);
                if (retry.success && retry.data.results?.length > 0) {
                    const existing = retry.data.results[0];
                    const countryData = { name: existing.country, lat: existing.lat, lon: existing.lon, isNew: false, createdNow: false };
                    updateState(countryData);
                    countryInput.value = existing.country;
                    statusIndicator.style.color = '#17a2b8';
                    statusIndicator.innerHTML = `ℹ️ Existente: ${existing.country}`;
                    countryInput.disabled = true;
                    countryInput.style.backgroundColor = '#e7f5f5';
                } else {
                    throw new Error(createResult.error);
                }
            }
        } catch (error) {
            statusIndicator.style.color = '#dc3545';
            statusIndicator.innerHTML = `❌ ${error.message}`;
            countryInput.disabled = false;
            countryInput.style.backgroundColor = '#ffe7e7';
            updateState({ name: null, lat: null, lon: null });
        }

    } else {
        // type === 'local'
        const countryData = { name: data.country, lat: data.lat, lon: data.lon, isNew: false, createdNow: false };
        updateState(countryData);
        countryInput.value = data.country;
        statusIndicator.style.color = '#28a745';
        statusIndicator.innerHTML = `✅ ${data.country}`;
        countryInput.disabled = true;
        countryInput.style.backgroundColor = '#f0f0f0';
    }
}

function handleGlobalCountrySelect(data, type) {
    if (type === 'nominatim') {
        formState.country = { name: data.name, lat: data.lat, lon: data.lon, isNew: true };
    } else {
        formState.country = { name: data.country, lat: data.lat, lon: data.lon, isNew: false };
    }
    updateCoordsDisplay('country', formState.country.lat, formState.country.lon);
    initCityAutocomplete();
}

function handleGlobalCitySelect(data, type) {
    if (type === 'nominatim') {
        formState.city = { name: data.name, lat: data.lat, lon: data.lon, isNew: true };
    } else {
        formState.city = { name: data.city, lat: data.lat, lon: data.lon, isNew: false };
    }
    updateCoordsDisplay('city', formState.city.lat, formState.city.lon);
}

function handleGlobalAgencySelect(data, type) {
    // CHANGED: agency.name (was agency.nombre)
    const agencyName = data.name;
    addAgencyChip(agencyName);
    document.getElementById('event-agency-input').value = '';
}

// ---------------------------------------------------------------------------
// Helper: fill speaker fields from API response object
// CHANGED: reads .country and .agency (plain strings)
// ---------------------------------------------------------------------------
function applySpeakerFieldsFromData(fields, speakerData, options = {}) {
    const { lockFields = true, showIndicator = true, indicatorContainer = null } = options;
    const { nameInput, countryInput, agencyInput } = fields;

    if (nameInput) {
        nameInput.value = speakerData.name;
        if (lockFields) {
            nameInput.disabled = true;
            nameInput.style.backgroundColor = '#f0f0f0';
            nameInput.title = 'Bloqueado — ponente existente';
        }
    }

    if (countryInput) {
        // CHANGED: .country is a plain string (was .country_s?.country || .country_s)
        countryInput.value = speakerData.country ?? '';
        if (lockFields) {
            countryInput.disabled = true;
            countryInput.style.backgroundColor = '#e7f5e7';
            countryInput.title = 'Bloqueado — ponente existente';
        }
        const countryIndicator = countryInput.parentNode.querySelector('.country-validation-status');
        if (countryIndicator) {
            countryIndicator.style.color = '#28a745';
            countryIndicator.textContent = '✅ Country validated (DB)';
        }
    }

    if (agencyInput) {
        // CHANGED: .agency is a plain string (was .agency_s)
        agencyInput.value = speakerData.agency ?? '';
        if (lockFields) {
            agencyInput.disabled = true;
            agencyInput.style.backgroundColor = '#f0f0f0';
            agencyInput.title = 'Bloqueado — ponente existente';
        }
    }

    if (showIndicator) {
        const container = indicatorContainer || nameInput?.parentNode;
        if (container) {
            const existing = container.querySelector('.speaker-status-indicator');
            if (existing) existing.remove();
            const indicator = document.createElement('small');
            indicator.className = 'speaker-status-indicator';
            indicator.style.cssText = 'display:block;color:#28a745;font-size:0.85rem;margin-top:4px;font-weight:500;';
            indicator.innerHTML = '✓ Ponente existente en la BD';
            container.appendChild(indicator);
        }
    }
}

// ---------------------------------------------------------------------------
// Country validation indicator helper
// ---------------------------------------------------------------------------
function updateCountryValidationIndicator(countryInput, status, customMessage = null) {
    if (!countryInput) return;
    const indicator = countryInput.parentNode.querySelector('.country-validation-status');
    if (!indicator) return;

    const cfg = {
        validating: { color: '#ffc107', icon: '⏳', text: 'Validando...' },
        validated:  { color: '#28a745', icon: '✅', text: 'País validado' },
        error:      { color: '#dc3545', icon: '⚠️', text: 'Error de validación' },
        notfound:   { color: '#dc3545', icon: '⚠️', text: 'No encontrado — selecciona del menú' },
        typing:     { color: '#6c757d', icon: '⌨️', text: 'Escribiendo...' },
        unvalidated:{ color: '#6c757d', icon: '❓', text: 'Sin validar' }
    }[status] ?? { color: '#6c757d', icon: '❓', text: 'Sin validar' };

    indicator.style.color = cfg.color;
    indicator.textContent = customMessage ?? `${cfg.icon} ${cfg.text}`;

    const bgColors = { validated: '#e7f5e7', notfound: '#fff3cd', error: '#ffe7e7' };
    countryInput.style.backgroundColor = bgColors[status] ?? '';
}

// Helper: create speaker-name autocomplete
function createSpeakerNameAutocomplete(inputElement, onSelectCallback) {
    return new Autocomplete(inputElement, {
        type: 'speaker',
        searchLocal: true,
        allowCreate: false,
        onSelect: onSelectCallback
    });
}

// ===========================================================================
// MAIN EVENT FORM
// ===========================================================================

export function initEventForm(container, availableLanguages = [], availableEventTypes = [], onCancel = null) {
    if (!canEdit()) {
        container.innerHTML = `<div class="alert-inline error"><p>⛔ Sin permisos para crear o editar eventos.</p></div>`;
        return;
    }
    resetFormState();
    currentAvailableLanguages  = availableLanguages;
    currentAvailableEventTypes = availableEventTypes;
    container.innerHTML = generateFormHTML();
    initAutocompletes();
    attachEventListeners(onCancel);
}

function generateFormHTML() {
    return `
        <form id="event-complete-form" class="event-form">
            <div class="form-section">
                <h4 class="form-section-title">📅 Información del Evento</h4>
                <div class="form-grid">
                    <div class="form-group">
                        <label for="event-country">País del evento *</label>
                        <input type="text" id="event-country" class="form-control autocomplete-input" placeholder="Escribe para buscar..." required>
                        <div id="country-coords" class="coords-display" style="display:none;">
                            <span class="coord-value" id="country-lat">Lat: -</span>
                            <span class="coord-value" id="country-lon">Lon: -</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="event-city">Ciudad del evento *</label>
                        <input type="text" id="event-city" class="form-control autocomplete-input" placeholder="Selecciona primero un país" disabled required>
                        <div id="city-coords" class="coords-display" style="display:none;">
                            <span class="coord-value" id="city-lat">Lat: -</span>
                            <span class="coord-value" id="city-lon">Lon: -</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="event-date">Fecha</label>
                        <input type="text" id="event-date" class="form-control" placeholder="ej. 15-20 Marzo 2025">
                    </div>
                    <div class="form-group">
                        <label for="event-year">Año *</label>
                        <input type="number" id="event-year" class="form-control" placeholder="2025" min="2000" max="2100" required>
                    </div>
                    <div class="form-group">
                        <label for="event-type">Tipo de evento</label>
                        <input type="text" id="event-type" class="form-control" list="event-type-list" placeholder="ej. Conferencia, Taller, Webinar">
                        <datalist id="event-type-list">
                            ${[...new Set(currentAvailableEventTypes)].sort().map(t => `<option value="${escapeVal(t)}"></option>`).join('')}
                        </datalist>
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label for="event-title">Título del evento *</label>
                        <input type="text" id="event-title" class="form-control" placeholder="Nombre completo del evento" required>
                    </div>
                </div>
                <div class="form-group">
                    <label for="event-agency-input">Organismos organizadores</label>
                    <div style="display:flex;gap:10px;">
                        <input type="text" id="event-agency-input" class="form-control autocomplete-input" placeholder="Escribe y pulsa Enter">
                        <button type="button" id="add-agency-btn" class="btn btn-outline-secondary">➕ Agregar</button>
                    </div>
                    <div id="agencies-chips" class="chips-container"></div>
                </div>
            </div>

            <div class="form-section">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                    <h4 class="form-section-title" style="margin:0;">📋 Presentaciones</h4>
                    <button type="button" id="add-presentation-btn" class="add-button">➕ Agregar Presentación</button>
                </div>
                <datalist id="presentation-language-list">
                    ${[...new Set(currentAvailableLanguages)].sort().map(l => `<option value="${escapeVal(l)}"></option>`).join('')}
                </datalist>
                <div id="presentations-container" class="presentations-list"></div>
            </div>

            <div class="form-buttons">
                <button type="button" id="cancel-form-btn" class="btn-cancel">❌ Cancelar</button>
                <button type="submit" id="submit-form-btn" class="btn-save">💾 Guardar Evento</button>
            </div>
            <div id="form-alert" class="alert-inline" style="display:none;margin-top:20px;"></div>
        </form>
    `;
}

function generatePresentationHTML(index) {
    return `
        <div class="presentation-card" data-presentation-index="${index}">
            <div class="presentation-header">
                <span class="presentation-number">Presentación #${index + 1}</span>
            </div>
            <div class="form-grid">
                <div class="form-group" style="grid-column:1/-1;">
                    <label>Título de la presentación *</label>
                    <input type="text" class="form-control presentation-title" data-presentation-index="${index}" placeholder="Título de la ponencia" required>
                </div>
                <div class="form-group">
                    <label>Idiomas</label>
                    <div style="display:flex;gap:10px;">
                        <input type="text" class="form-control language-input" data-presentation-index="${index}" list="presentation-language-list" placeholder="ej. Español, Inglés">
                        <button type="button" class="btn btn-outline-secondary add-language-btn" data-index="${index}">➕</button>
                    </div>
                    <div class="chips-container languages-chips" data-presentation-index="${index}"></div>
                </div>
                <div class="form-group">
                    <label>URL del documento</label>
                    <input type="url" class="form-control presentation-url" data-presentation-index="${index}" placeholder="https://...">
                </div>
                <div class="form-group" style="grid-column:1/-1;">
                    <label>Observaciones</label>
                    <textarea class="form-control presentation-observations" data-presentation-index="${index}" rows="2" placeholder="Notas adicionales"></textarea>
                </div>
            </div>
            <div style="margin-top:15px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <label style="margin:0;font-weight:600;">👥 Ponentes</label>
                    <button type="button" class="btn btn-outline-secondary add-speaker-btn" data-presentation-index="${index}">➕ Agregar Ponente</button>
                </div>
                <div class="speakers-list" data-presentation-index="${index}">
                    ${generateSpeakerRowHTML(index, 0)}
                </div>
            </div>
        </div>
    `;
}

function generateSpeakerRowHTML(presentationIndex, speakerIndex) {
    return `
        <div class="speaker-row" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}">
            <input type="hidden" class="speaker-id" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}" value="">
            <div class="form-group">
                <input type="text" class="form-control speaker-name" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}" placeholder="Nombre del ponente *" required>
            </div>
            <div class="form-group">
                <input type="text" class="form-control speaker-country autocomplete-input" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}" placeholder="País *" required>
            </div>
            <div class="form-group">
                <input type="text" class="form-control speaker-agency autocomplete-input" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}" placeholder="Organismo">
            </div>
            <button type="button" class="remove-speaker" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}">🗑️</button>
        </div>
    `;
}

// ===========================================================================
// AUTOCOMPLETE INITIALISATION
// ===========================================================================

function initAutocompletes() {
    const countryAC = new Autocomplete(document.getElementById('event-country'), {
        type: 'country', searchLocal: true, searchNominatim: true, allowCreate: true,
        onSelect: handleGlobalCountrySelect
    });
    autocompleteInstances.push(countryAC);

    const agencyAC = new Autocomplete(document.getElementById('event-agency-input'), {
        type: 'agency', searchLocal: true, allowCreate: true,
        onSelect: handleGlobalAgencySelect,
        onCreate: (name) => { addAgencyChip(name); document.getElementById('event-agency-input').value = ''; }
    });
    autocompleteInstances.push(agencyAC);

    renderPresentations();
}

function initCityAutocomplete() {
    const cityInput = document.getElementById('event-city');
    const existingIndex = autocompleteInstances.findIndex(ac => ac.input.id === 'event-city');
    if (existingIndex >= 0) {
        autocompleteInstances[existingIndex].destroy();
        autocompleteInstances.splice(existingIndex, 1);
    }
    const cityAC = new Autocomplete(cityInput, {
        type: 'city', searchLocal: true, searchNominatim: true, allowCreate: true,
        dependsOn: () => formState.country?.name || '',
        onSelect: handleGlobalCitySelect
    });
    autocompleteInstances.push(cityAC);
    cityInput.disabled = false;
}

function initSpeakerAutocompletes(presentationIndex, speakerIndex) {
    const nameInput = document.querySelector(
        `.speaker-name[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    if (nameInput && !nameInput.dataset.autocompleteInit) {
        const nameAC = new Autocomplete(nameInput, {
            type: 'speaker', searchLocal: true, allowCreate: false,
            onSelect: (data, type) => handleGlobalSpeakerSelect(data, type, presentationIndex, speakerIndex)
        });
        autocompleteInstances.push(nameAC);
        nameInput.dataset.autocompleteInit = 'true';

        // Unlock fields when user types manually after selecting an existing speaker
        nameInput.addEventListener('input', (e) => {
            const speakerRow = e.target.closest('.speaker-row');
            if (!speakerRow) return;
            const hiddenId = speakerRow.querySelector('.speaker-id');
            if (hiddenId && hiddenId.value) {
                hiddenId.value = '';
                const countryInput = speakerRow.querySelector('.speaker-country');
                const agencyInput  = speakerRow.querySelector('.speaker-agency');
                const statusInd    = speakerRow.querySelector('.speaker-status-indicator');
                if (countryInput) { countryInput.disabled = false; countryInput.style.backgroundColor = ''; }
                if (agencyInput)  { agencyInput.disabled  = false; agencyInput.style.backgroundColor  = ''; }
                if (statusInd)    statusInd.style.display = 'none';
            }
        });
    }

    const countryInput = document.querySelector(
        `.speaker-country[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    if (countryInput && !countryInput.dataset.autocompleteInit) {
        const countryAC = new Autocomplete(countryInput, {
            type: 'country', searchLocal: true, searchNominatim: true, allowCreate: false,
            onSelect: (data, type) => handleGlobalSpeakerCountrySelect(data, type, presentationIndex, speakerIndex)
        });
        autocompleteInstances.push(countryAC);
        countryInput.dataset.autocompleteInit = 'true';

        // Auto-validate on blur
        countryInput.addEventListener('blur', async (e) => {
            const value = e.target.value.trim();
            if (!value) return;
            if (formState.presentations[presentationIndex]?.speakers[speakerIndex]?.countryData) return;

            try {
                const result = await CountriesAPI.list(value);
                if (result.success && result.data.results?.length > 0) {
                    const found = result.data.results[0];
                    if (!formState.presentations[presentationIndex]) formState.presentations[presentationIndex] = { speakers: [] };
                    if (!formState.presentations[presentationIndex].speakers[speakerIndex]) {
                        formState.presentations[presentationIndex].speakers[speakerIndex] = {};
                    }
                    formState.presentations[presentationIndex].speakers[speakerIndex].country     = found.country;
                    formState.presentations[presentationIndex].speakers[speakerIndex].countryData = {
                        name: found.country, lat: found.lat, lon: found.lon, isNew: false, createdNow: false
                    };
                    e.target.value = found.country;
                    e.target.style.backgroundColor = '#e7f5e7';
                }
            } catch (_) { /* silent */ }
        });

        countryInput.addEventListener('input', (e) => {
            if (!e.target.value.trim()) {
                const sp = formState.presentations[presentationIndex]?.speakers[speakerIndex];
                if (sp) { sp.country = null; sp.countryData = null; }
                e.target.disabled = false;
                e.target.style.backgroundColor = '';
                const ind = e.target.parentNode.querySelector('.country-status-indicator');
                if (ind) ind.remove();
            }
        });
    }

    const agencyInput = document.querySelector(
        `.speaker-agency[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    if (agencyInput && !agencyInput.dataset.autocompleteInit) {
        const agencyAC = new Autocomplete(agencyInput, { type: 'agency', searchLocal: true, allowCreate: true });
        autocompleteInstances.push(agencyAC);
        agencyInput.dataset.autocompleteInit = 'true';
    }
}

// ===========================================================================
// DOM RENDERING HELPERS
// ===========================================================================

function renderPresentations() {
    const container = document.getElementById('presentations-container');
    container.innerHTML = '';
    formState.presentations.forEach((presentation, index) => {
        const div = document.createElement('div');
        div.innerHTML = generatePresentationHTML(index);
        container.appendChild(div.firstElementChild);
        presentation.speakers.forEach((_, sIndex) => {
            if (sIndex > 0) {
                const speakersContainer = container.querySelector(`.speakers-list[data-presentation-index="${index}"]`);
                const speakerDiv = document.createElement('div');
                speakerDiv.innerHTML = generateSpeakerRowHTML(index, sIndex);
                speakersContainer.appendChild(speakerDiv.firstElementChild);
            }
            initSpeakerAutocompletes(index, sIndex);
        });
    });
}

function addAgencyChip(agencyName) {
    if (formState.agencies.includes(agencyName)) return;
    formState.agencies.push(agencyName);
    const container = document.getElementById('agencies-chips');
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `${agencyName}<button type="button" class="chip-remove" data-agency="${agencyName}">×</button>`;
    container.appendChild(chip);
    chip.querySelector('.chip-remove').addEventListener('click', (e) => {
        formState.agencies = formState.agencies.filter(a => a !== e.target.dataset.agency);
        chip.remove();
    });
}

function addLanguageChip(presentationIndex, language) {
    if (!formState.presentations[presentationIndex].languages) formState.presentations[presentationIndex].languages = [];
    if (formState.presentations[presentationIndex].languages.includes(language)) return;
    formState.presentations[presentationIndex].languages.push(language);
    const container = document.querySelector(`.languages-chips[data-presentation-index="${presentationIndex}"]`);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `${language}<button type="button" class="chip-remove" data-language="${language}">×</button>`;
    container.appendChild(chip);
    chip.querySelector('.chip-remove').addEventListener('click', (e) => {
        formState.presentations[presentationIndex].languages =
            formState.presentations[presentationIndex].languages.filter(l => l !== e.target.dataset.language);
        chip.remove();
    });
}

function updateCoordsDisplay(type, lat, lon) {
    lat = Number(lat); lon = Number(lon);
    const coordsDiv = document.getElementById(`${type}-coords`);
    const latSpan   = document.getElementById(`${type}-lat`);
    const lonSpan   = document.getElementById(`${type}-lon`);
    if (lat && lon) {
        latSpan.textContent = `Lat: ${lat.toFixed(4)}`;
        lonSpan.textContent = `Lon: ${lon.toFixed(4)}`;
        coordsDiv.style.display = 'flex';
    } else {
        coordsDiv.style.display = 'none';
    }
}

// ===========================================================================
// EVENT LISTENERS
// ===========================================================================

function attachEventListeners(onCancel = null) {
    const form = document.getElementById('event-complete-form');
    form.addEventListener('submit', handleFormSubmit);

    document.getElementById('cancel-form-btn').addEventListener('click', () => {
        if (confirm('¿Cancelar? Los cambios se perderán.')) {
            resetFormState();
            if (onCancel) {
                onCancel();
            } else {
                initEventForm(document.getElementById('editor-content'), currentAvailableLanguages, currentAvailableEventTypes);
            }
        }
    });

    document.getElementById('add-agency-btn').addEventListener('click', () => {
        const input = document.getElementById('event-agency-input');
        const value = input.value.trim();
        if (value) { addAgencyChip(value); input.value = ''; }
    });

    document.getElementById('event-agency-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-agency-btn').click(); }
    });

    document.getElementById('add-presentation-btn').addEventListener('click', () => {
        if (formState.presentations.length >= MAX_PRESENTATIONS) {
            showFormAlert(`Máximo ${MAX_PRESENTATIONS} presentaciones permitidas`, 'warning');
            return;
        }
        formState.presentations.push({ title: '', languages: [], url: '', observations: '', speakers: [{ name: '', country: null, agency: '' }] });
        renderPresentations();
    });

    const container = document.getElementById('presentations-container');

    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-presentation')) {
            const index = parseInt(e.target.dataset.index);
            if (formState.presentations.length === 1) { showFormAlert('Se requiere al menos una presentación', 'warning'); return; }
            if (confirm('¿Eliminar esta presentación?')) { formState.presentations.splice(index, 1); renderPresentations(); }
        }
        if (e.target.classList.contains('add-speaker-btn')) {
            const presIndex = parseInt(e.target.dataset.presentationIndex);
            formState.presentations[presIndex].speakers.push({ name: '', country: null, agency: '' });
            const speakersContainer = container.querySelector(`.speakers-list[data-presentation-index="${presIndex}"]`);
            const speakerIndex = formState.presentations[presIndex].speakers.length - 1;
            const div = document.createElement('div');
            div.innerHTML = generateSpeakerRowHTML(presIndex, speakerIndex);
            speakersContainer.appendChild(div.firstElementChild);
            initSpeakerAutocompletes(presIndex, speakerIndex);
        }
        if (e.target.classList.contains('remove-speaker')) {
            const presIndex    = parseInt(e.target.dataset.presentationIndex);
            const speakerIndex = parseInt(e.target.dataset.speakerIndex);
            if (formState.presentations[presIndex].speakers.length === 1) {
                showFormAlert('Se requiere al menos un ponente por presentación', 'warning'); return;
            }
            formState.presentations[presIndex].speakers.splice(speakerIndex, 1);
            renderPresentations();
        }
        if (e.target.classList.contains('add-language-btn')) {
            const presIndex = parseInt(e.target.dataset.index);
            const input = container.querySelector(`.language-input[data-presentation-index="${presIndex}"]`);
            const value = input.value.trim();
            if (value) { addLanguageChip(presIndex, value); input.value = ''; }
        }
    });

    container.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('language-input')) {
            e.preventDefault();
            const presIndex = parseInt(e.target.dataset.presentationIndex);
            container.querySelector(`.add-language-btn[data-index="${presIndex}"]`).click();
        }
    });
}

// ===========================================================================
// DATA COLLECTION & VALIDATION
// ===========================================================================

function collectFormData() {
    const eventData = {
        country:     formState.country?.name || document.getElementById('event-country').value,
        city:        formState.city?.name    || document.getElementById('event-city').value,
        country_lat: formState.country?.lat  || 0,
        country_lon: formState.country?.lon  || 0,
        city_lat:    formState.city?.lat     || 0,
        city_lon:    formState.city?.lon     || 0,
        date:        document.getElementById('event-date').value.trim(),
        year:        parseInt(document.getElementById('event-year').value),
        type:        document.getElementById('event-type').value.trim(),
        event_title: document.getElementById('event-title').value.trim(),
        agencies:    formState.agencies
    };

    eventData.presentations = formState.presentations.map((pres, presIndex) => {
        const titleInput = document.querySelector(`.presentation-title[data-presentation-index="${presIndex}"]`);
        const urlInput   = document.querySelector(`.presentation-url[data-presentation-index="${presIndex}"]`);
        const obsInput   = document.querySelector(`.presentation-observations[data-presentation-index="${presIndex}"]`);

        const speakers = pres.speakers.map((speaker, sIndex) => {
            if (!speaker.name || !speaker.country) {
                // DOM fallback
                const nameInput    = document.querySelector(`.speaker-name[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`);
                const countryInput = document.querySelector(`.speaker-country[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`);
                const agencyInput  = document.querySelector(`.speaker-agency[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`);
                const hiddenId     = document.querySelector(`.speaker-id[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`);
                return {
                    id:      hiddenId?.value?.trim()    || null,
                    name:    nameInput?.value?.trim()   || '',
                    country: countryInput?.value?.trim()|| '',
                    agency:  agencyInput?.value?.trim() || ''
                };
            }
            return { id: speaker.id || null, name: speaker.name, country: speaker.country, agency: speaker.agency || '' };
        }).filter(s => s.name && s.country);

        return {
            title:        titleInput?.value?.trim() || '',
            language:     pres.languages || [],
            url:          urlInput?.value?.trim()   || '',
            observations: obsInput?.value?.trim()   || '',
            speakers
        };
    });

    return eventData;
}

function validateEventData(data) {
    if (!data.country)     return { valid: false, error: 'El país es obligatorio' };
    if (!data.city)        return { valid: false, error: 'La ciudad es obligatoria' };
    if (!data.year || data.year < 2000) return { valid: false, error: 'Se requiere un año válido' };
    if (!data.event_title) return { valid: false, error: 'El título del evento es obligatorio' };
    if (!data.country_lat || !data.country_lon) return { valid: false, error: 'Coordenadas del país no disponibles' };
    if (!data.city_lat    || !data.city_lon)    return { valid: false, error: 'Coordenadas de la ciudad no disponibles' };
    if (!data.presentations?.length)            return { valid: false, error: 'Se requiere al menos una presentación' };

    for (let i = 0; i < data.presentations.length; i++) {
        const pres = data.presentations[i];
        if (!pres.title) return { valid: false, error: `La presentación #${i + 1} requiere un título` };
        if (!pres.speakers?.length) return { valid: false, error: `La presentación #${i + 1} requiere al menos un ponente` };
        for (let j = 0; j < pres.speakers.length; j++) {
            if (!pres.speakers[j].name)    return { valid: false, error: `El ponente #${j + 1} de la presentación #${i + 1} requiere un nombre` };
            if (!pres.speakers[j].country) return { valid: false, error: `El ponente #${j + 1} de la presentación #${i + 1} requiere un país` };
        }
    }
    return { valid: true };
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-form-btn');
    const eventData = collectFormData();
    const validation = validateEventData(eventData);
    if (!validation.valid) { showFormAlert(validation.error, 'error'); return; }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

    try {
        const result = await EventsAPI.createComplete(eventData);
        if (result.success) {
            showFormAlert('✅ Evento creado correctamente', 'success');
            setTimeout(() => window.location.reload(), 2000);
        } else {
            showFormAlert('❌ Error: ' + result.error, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Guardar Evento';
        }
    } catch (error) {
        showFormAlert('❌ Error inesperado: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Guardar Evento';
    }
}

// ===========================================================================
// ADD PRESENTATION TO EXISTING EVENT
// ===========================================================================

export function initAddPresentationForm(container, prefilledEvent = null, availableLanguages = []) {
    let selectedEvent = prefilledEvent;
    let localFormState = { languages: [], speakers: [{ name: '', country: null, countryData: null, agency: '' }] };
    let localAutocompleteInstances = [];

    container.innerHTML = `
        <form id="add-presentation-form" class="event-form">
            <button type="button" class="btn btn-outline-secondary" id="back-to-add-options" style="margin-bottom:20px;">← Volver</button>

            <div class="form-section">
                <h4 class="form-section-title">📅 Seleccionar Evento</h4>
                <div class="form-group">
                    <label for="add-pres-event">Evento *</label>
                    <input type="text" id="add-pres-event" class="form-control autocomplete-input"
                        placeholder="Buscar evento..."
                        ${prefilledEvent ? 'disabled' : ''} required>
                    <small class="form-text">${prefilledEvent ? '✓ Prellenado desde el mapa' : 'Escribe para buscar eventos'}</small>
                </div>
            </div>

            <div class="form-section">
                <h4 class="form-section-title">📋 Datos de la Presentación</h4>
                <div class="form-grid">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label for="add-pres-title">Título de la presentación *</label>
                        <input type="text" id="add-pres-title" class="form-control" placeholder="Título de la ponencia" required>
                    </div>
                    <div class="form-group">
                        <label>Idiomas</label>
                        <div style="display:flex;gap:10px;">
                            <input type="text" id="add-pres-language-input" class="form-control" list="add-pres-language-list" placeholder="ej. Español, Inglés">
                            <datalist id="add-pres-language-list">
                                ${[...new Set(availableLanguages)].sort().map(l => `<option value="${escapeVal(l)}"></option>`).join('')}
                            </datalist>
                            <button type="button" id="add-pres-language-btn" class="btn btn-outline-secondary">➕</button>
                        </div>
                        <div id="add-pres-languages-chips" class="chips-container"></div>
                    </div>
                    <div class="form-group">
                        <label>URL del documento</label>
                        <input type="url" id="add-pres-url" class="form-control" placeholder="https://...">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Observaciones</label>
                        <textarea id="add-pres-observations" class="form-control" rows="2"></textarea>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
                    <h4 class="form-section-title" style="margin:0;">👥 Ponentes</h4>
                    <button type="button" id="add-pres-add-speaker-btn" class="btn btn-outline-secondary">➕ Agregar Ponente</button>
                </div>
                <div id="add-pres-speakers-list" class="speakers-list"></div>
            </div>

            <div class="form-buttons">
                <button type="button" id="add-pres-cancel-btn" class="btn-cancel">❌ Cancelar</button>
                <button type="submit" id="add-pres-submit-btn" class="btn-save">💾 Guardar Presentación</button>
            </div>
            <div id="add-pres-alert" class="alert-inline" style="display:none;margin-top:20px;"></div>
        </form>
    `;

    // Event autocomplete
    if (!prefilledEvent) {
        const eventAC = new Autocomplete(document.getElementById('add-pres-event'), {
            type: 'text', minChars: 2, searchLocal: false,
            onSelect: (data) => {
                selectedEvent = { id: data.id, title: data.event_title };
                document.getElementById('add-pres-event').value = data.event_title;
            }
        });
        eventAC.handleInput = async function(e) {
            const query = e.target.value.trim();
            if (query.length < 2) { this.hideResults(); return; }
            this.isLoading = true; this.showLoading();
            const result = await EventsAPI.list({ search: query });
            const events = result.success ? (result.data.results || result.data || []) : [];
            this.results = events.map(ev => ({
                type: 'local', data: ev,
                display: `${ev.event_title} (${ev.year ?? 'N/A'}) — ${ev.country ?? 'N/A'}`
            }));
            this.isLoading = false; this.renderResults();
        };
        localAutocompleteInstances.push(eventAC);
    } else {
        document.getElementById('add-pres-event').value = prefilledEvent.title;
    }

    renderLocalSpeakers();

    // -----------------------------------------------------------------------
    // Local speaker list renderer
    // -----------------------------------------------------------------------
    function renderLocalSpeakers() {
        const listEl = document.getElementById('add-pres-speakers-list');
        listEl.innerHTML = '';
        localFormState.speakers.forEach((speaker, index) => {
            const row = document.createElement('div');
            row.className = 'speaker-row';
            row.setAttribute('data-speaker-index', index);
            row.innerHTML = `
                <div class="form-group">
                    <input type="hidden" class="speaker-id" data-index="${index}" value="${speaker.id || ''}">
                    <input type="text" class="form-control speaker-name" data-index="${index}"
                        placeholder="Nombre del ponente *" value="${speaker.name}" required>
                    ${speaker.id ? '<small style="color:#28a745">✓ Ponente existente en la BD</small>' : ''}
                </div>
                <div class="form-group">
                    <input type="text" class="form-control speaker-country autocomplete-input"
                        data-index="${index}" placeholder="País *" value="${speaker.country || ''}" required>
                </div>
                <div class="form-group">
                    <input type="text" class="form-control speaker-agency autocomplete-input"
                        data-index="${index}" placeholder="Organismo" value="${speaker.agency || ''}">
                </div>
                <button type="button" class="remove-speaker" data-index="${index}">🗑️</button>
            `;
            listEl.appendChild(row);

            const nameInput    = row.querySelector('.speaker-name');
            const countryInput = row.querySelector('.speaker-country');
            const agencyInput  = row.querySelector('.speaker-agency');

            // Speaker name autocomplete
            const nameAC = new Autocomplete(nameInput, {
                type: 'speaker', searchLocal: true, allowCreate: false,
                onSelect: (data) => handleLocalSpeakerSelect(data, index)
            });
            localAutocompleteInstances.push(nameAC);

            // Country autocomplete
            const countryAC = new Autocomplete(countryInput, {
                type: 'country', searchLocal: true, searchNominatim: true, allowCreate: false,
                onSelect: (data, type) => handleLocalCountrySelect(data, type, index)
            });
            localAutocompleteInstances.push(countryAC);

            // Auto-validate country on blur
            countryInput.addEventListener('blur', async (e) => {
                const value = e.target.value.trim();
                if (!value || localFormState.speakers[index]?.countryData) return;
                try {
                    const result = await CountriesAPI.list(value);
                    if (result.success && result.data.results?.length > 0) {
                        const found = result.data.results[0];
                        localFormState.speakers[index].country     = found.country;
                        localFormState.speakers[index].countryData = { name: found.country, lat: found.lat, lon: found.lon, isNew: false, createdNow: false };
                        e.target.value = found.country;
                        e.target.style.backgroundColor = '#e7f5e7';
                    }
                } catch (_) { /* silent */ }
            });

            const agencyAC = new Autocomplete(agencyInput, { type: 'agency', searchLocal: true, allowCreate: true });
            localAutocompleteInstances.push(agencyAC);
        });
    }

    // -----------------------------------------------------------------------
    // handleLocalSpeakerSelect
    // CHANGED: reads .country and .agency (plain strings)
    // -----------------------------------------------------------------------
    function handleLocalSpeakerSelect(speakerData, index) {
        localFormState.speakers[index] = {
            id: speakerData.id,
            name: speakerData.name,
            // CHANGED: .country (was .country_s?.country || .country_s)
            country: speakerData.country ?? '',
            // CHANGED: .agency (was .agency_s)
            agency:  speakerData.agency  ?? ''
        };

        const speakerRow = document.querySelector(`.speaker-row[data-speaker-index="${index}"]`);
        if (!speakerRow) return;

        const hiddenId     = speakerRow.querySelector('.speaker-id');
        const nameInput    = speakerRow.querySelector('.speaker-name');
        const countryInput = speakerRow.querySelector('.speaker-country');
        const agencyInput  = speakerRow.querySelector('.speaker-agency');

        if (hiddenId)     hiddenId.value     = speakerData.id;
        if (nameInput)    nameInput.value     = speakerData.name;
        if (countryInput) {
            countryInput.value = speakerData.country ?? '';
            countryInput.disabled = true;
            countryInput.style.backgroundColor = '#f0f0f0';
        }
        if (agencyInput) {
            agencyInput.value = speakerData.agency ?? '';
            agencyInput.disabled = true;
            agencyInput.style.backgroundColor = '#f0f0f0';
        }

        let statusInd = speakerRow.querySelector('.speaker-status-indicator');
        if (!statusInd) {
            statusInd = document.createElement('small');
            statusInd.className = 'speaker-status-indicator';
            statusInd.style.cssText = 'display:block;color:#28a745;font-size:0.85rem;margin-top:4px;';
            statusInd.textContent = '✓ Ponente existente en la BD';
            if (nameInput?.parentNode) nameInput.parentNode.appendChild(statusInd);
        }
    }

    // -----------------------------------------------------------------------
    // handleLocalCountrySelect
    // -----------------------------------------------------------------------
    async function handleLocalCountrySelect(data, type, speakerIndex) {
        const speakerRow = document.querySelector(`.speaker-row[data-speaker-index="${speakerIndex}"]`);
        if (!speakerRow) return;
        const countryInput = speakerRow.querySelector('.speaker-country');
        if (!countryInput) return;

        let statusInd = countryInput.parentNode.querySelector('.country-status-indicator');
        if (!statusInd) {
            statusInd = document.createElement('small');
            statusInd.className = 'country-status-indicator';
            statusInd.style.cssText = 'display:block;margin-top:4px;font-size:0.8rem;';
            countryInput.parentNode.appendChild(statusInd);
        }

        if (type === 'nominatim') {
            statusInd.style.color = '#ffc107';
            statusInd.innerHTML = '⏳ Creando país...';
            countryInput.disabled = true;
            try {
                const createResult = await CountriesAPI.create({ country: data.name, lat: parseFloat(data.lat), lon: parseFloat(data.lon) });
                if (createResult.success) {
                    localFormState.speakers[speakerIndex].country     = data.name;
                    localFormState.speakers[speakerIndex].countryData = { name: data.name, lat: parseFloat(data.lat), lon: parseFloat(data.lon), isNew: true, createdNow: true };
                    countryInput.value = data.name;
                    statusInd.style.color = '#28a745';
                    statusInd.innerHTML = `✅ Creado: ${data.name}`;
                    countryInput.style.backgroundColor = '#e7f5e7';
                } else {
                    const retry = await CountriesAPI.list(data.name);
                    if (retry.success && retry.data.results?.length > 0) {
                        const existing = retry.data.results[0];
                        localFormState.speakers[speakerIndex].country     = existing.country;
                        localFormState.speakers[speakerIndex].countryData = { name: existing.country, lat: existing.lat, lon: existing.lon, isNew: false, createdNow: false };
                        countryInput.value = existing.country;
                        statusInd.style.color = '#17a2b8';
                        statusInd.innerHTML = `ℹ️ Existente: ${existing.country}`;
                        countryInput.disabled = true;
                    } else {
                        throw new Error(createResult.error);
                    }
                }
            } catch (error) {
                statusInd.style.color = '#dc3545';
                statusInd.innerHTML = `❌ ${error.message}`;
                countryInput.disabled = false;
                countryInput.style.backgroundColor = '#ffe7e7';
            }
        } else {
            localFormState.speakers[speakerIndex].country     = data.country;
            localFormState.speakers[speakerIndex].countryData = { name: data.country, lat: data.lat, lon: data.lon, isNew: false, createdNow: false };
            countryInput.value = data.country;
            statusInd.style.color = '#28a745';
            statusInd.innerHTML = `✅ ${data.country}`;
            countryInput.disabled = true;
            countryInput.style.backgroundColor = '#f0f0f0';
        }
    }

    // -----------------------------------------------------------------------
    // Language chips (local)
    // -----------------------------------------------------------------------
    function addLocalLanguageChip(language) {
        if (localFormState.languages.includes(language)) return;
        localFormState.languages.push(language);
        const container = document.getElementById('add-pres-languages-chips');
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `${language}<button type="button" class="chip-remove" data-language="${language}">×</button>`;
        container.appendChild(chip);
        chip.querySelector('.chip-remove').addEventListener('click', (e) => {
            localFormState.languages = localFormState.languages.filter(l => l !== e.target.dataset.language);
            chip.remove();
        });
    }

    // -----------------------------------------------------------------------
    // Listeners
    // -----------------------------------------------------------------------
    document.getElementById('back-to-add-options')?.addEventListener('click', () => initAddOptionsView(container, availableLanguages));
    document.getElementById('add-pres-language-btn').addEventListener('click', () => {
        const input = document.getElementById('add-pres-language-input');
        const value = input.value.trim();
        if (value) { addLocalLanguageChip(value); input.value = ''; }
    });
    document.getElementById('add-pres-language-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-pres-language-btn').click(); }
    });
    document.getElementById('add-pres-add-speaker-btn').addEventListener('click', () => {
        localFormState.speakers.push({ name: '', country: null, countryData: null, agency: '' });
        renderLocalSpeakers();
    });
    document.getElementById('add-pres-speakers-list').addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-speaker')) {
            const index = parseInt(e.target.dataset.index);
            if (localFormState.speakers.length === 1) { showFormAlert('Se requiere al menos un ponente', 'warning', 'add-pres-alert'); return; }
            localFormState.speakers.splice(index, 1);
            renderLocalSpeakers();
        }
    });
    document.getElementById('add-pres-cancel-btn').addEventListener('click', () => {
        if (confirm('¿Cancelar? Los cambios se perderán.')) initAddOptionsView(container, availableLanguages);
    });
    document.getElementById('add-presentation-form').addEventListener('submit', handleAddPresentationSubmit);

    // -----------------------------------------------------------------------
    // handleAddPresentationSubmit
    // CHANGED: sends event: selectedEvent.id  (integer) instead of event_title: string
    // CHANGED: SpeakersAPI.create sends country/agency (not country_s/agency_s)
    // -----------------------------------------------------------------------
    async function handleAddPresentationSubmit(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('add-pres-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

        try {
            if (!selectedEvent?.id) {
                showFormAlert('❌ Selecciona un evento', 'error', 'add-pres-alert');
                return;
            }

            const title        = document.getElementById('add-pres-title').value.trim();
            const url          = document.getElementById('add-pres-url').value.trim();
            const observations = document.getElementById('add-pres-observations').value.trim();

            if (!title) { showFormAlert('❌ El título es obligatorio', 'error', 'add-pres-alert'); return; }

            // Check for duplicate title within the same event
            const existingPres = await PresentationsAPI.list({ event_id: selectedEvent.id });
            if (existingPres.success) {
                const pList = existingPres.data.results || existingPres.data || [];
                if (pList.find(p => p.title.toLowerCase() === title.toLowerCase())) {
                    showFormAlert(`❌ Ya existe una presentación con el título "${title}" en este evento.`, 'error', 'add-pres-alert');
                    return;
                }
            }

            // Validate and collect speakers
            const speakerRows = document.querySelectorAll('.speaker-row');
            const speakers = [];
            for (let i = 0; i < speakerRows.length; i++) {
                const row   = speakerRows[i];
                const index = parseInt(row.dataset.speakerIndex);
                const id      = row.querySelector('.speaker-id')?.value?.trim()      || null;
                const name    = row.querySelector('.speaker-name')?.value?.trim()    || '';
                const country = row.querySelector('.speaker-country')?.value?.trim() || '';
                const agency  = row.querySelector('.speaker-agency')?.value?.trim()  || '';

                if (!name || !country) {
                    showFormAlert(`❌ El ponente #${i + 1} requiere nombre y país`, 'error', 'add-pres-alert');
                    return;
                }

                const speakerData = { id: id || null, name, country, countryData: localFormState.speakers[index]?.countryData || null, agency };

                // Lazy country validation
                if (!speakerData.countryData?.lat) {
                    showFormAlert(`🔍 Validando país "${country}"...`, 'info', 'add-pres-alert');
                    const validation = await ensureCountryDataComplete(speakerData, index, localFormState);
                    if (!validation.success) {
                        showFormAlert(validation.error, 'error', 'add-pres-alert');
                        return;
                    }
                }
                speakers.push(speakerData);
            }

            if (!speakers.length) { showFormAlert('❌ Se requiere al menos un ponente', 'error', 'add-pres-alert'); return; }

            // Create presentation
            // CHANGED: 'event' is the integer ID (was 'event_title' as string)
            const presResult = await PresentationsAPI.create({
                title,
                event: selectedEvent.id,   // ← INTEGER ID
                language:     localFormState.languages,
                url_document: url,
                observations
            });

            if (!presResult.success) {
                showFormAlert('❌ Error al crear la presentación: ' + presResult.error, 'error', 'add-pres-alert');
                return;
            }

            const presentationId = presResult.data.id;

            // Process speakers
            for (const speakerData of speakers) {
                let speaker;
                if (speakerData.id) {
                    speaker = { id: speakerData.id };
                } else {
                    const existing = await SpeakersAPI.list(speakerData.name, speakerData.country);
                    if (existing.success && existing.data.results?.length > 0) {
                        speaker = existing.data.results[0];
                    } else {
                        // CHANGED: payload uses 'country' and 'agency' (was 'country_s' and 'agency_s')
                        const newSpeaker = await SpeakersAPI.create({
                            name:    speakerData.name,
                            country: speakerData.country,   // ← was country_s
                            agency:  speakerData.agency     // ← was agency_s
                        });
                        if (!newSpeaker.success) {
                            showFormAlert(`⚠️ No se pudo crear el ponente "${speakerData.name}": ${newSpeaker.error}`, 'warning', 'add-pres-alert');
                            continue;
                        }
                        speaker = newSpeaker.data;
                    }
                }
                await PresentationsAPI.addSpeaker(presentationId, speaker.id);
            }

            showFormAlert('✅ Presentación añadida correctamente', 'success', 'add-pres-alert');
            setTimeout(() => window.location.reload(), 2000);

        } catch (error) {
            showFormAlert('❌ Error inesperado: ' + error.message, 'error', 'add-pres-alert');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Guardar Presentación';
        }
    }
}

// ===========================================================================
// ADD SPEAKER TO EXISTING PRESENTATION
// ===========================================================================

export function initAddSpeakerForm(container, prefilledPresentation = null, availableLanguages = []) {
    let selectedPresentation = prefilledPresentation;
    let localAutocompleteInstances = [];
    let speakerData = { id: null, name: '', country: null, countryData: null, agency: '' };

    container.innerHTML = `
        <form id="add-speaker-form" class="event-form">
            <button type="button" class="btn btn-outline-secondary" id="back-to-add-options-2" style="margin-bottom:20px;">← Volver</button>

            <div class="form-section">
                <h4 class="form-section-title">📋 Seleccionar Presentación</h4>
                <div class="form-group">
                    <label for="add-speaker-pres">Presentación *</label>
                    <input type="text" id="add-speaker-pres" class="form-control autocomplete-input"
                        placeholder="Buscar presentación..."
                        ${prefilledPresentation ? 'disabled' : ''} required>
                    <small class="form-text">${prefilledPresentation ? '✓ Prellenado' : 'Escribe para buscar'}</small>
                </div>
            </div>

            <div class="form-section">
                <h4 class="form-section-title">👤 Datos del Ponente</h4>
                <div class="form-grid">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label for="add-speaker-name">Nombre del ponente *</label>
                        <input type="text" id="add-speaker-name" class="form-control autocomplete-input"
                            placeholder="Busca o escribe el nombre completo" required>
                        <small class="form-text" style="color:#6c757d;">💡 Los ponentes existentes rellenan los campos</small>
                    </div>
                    <div class="form-group">
                        <label for="add-speaker-country">País *</label>
                        <input type="text" id="add-speaker-country" class="form-control autocomplete-input"
                            placeholder="País del ponente" required>
                        <small class="country-validation-status" style="display:block;margin-top:4px;font-size:0.8rem;color:#6c757d;">❓ Sin validar</small>
                    </div>
                    <div class="form-group">
                        <label for="add-speaker-agency">Organismo</label>
                        <input type="text" id="add-speaker-agency" class="form-control autocomplete-input"
                            placeholder="Institución u organismo">
                    </div>
                </div>
            </div>

            <div class="form-buttons">
                <button type="button" id="add-speaker-cancel-btn" class="btn-cancel">❌ Cancelar</button>
                <button type="submit" id="add-speaker-submit-btn" class="btn-save">💾 Agregar Ponente</button>
            </div>
            <div id="add-speaker-alert" class="alert-inline" style="display:none;margin-top:20px;"></div>
        </form>
    `;

    const nameInput    = document.getElementById('add-speaker-name');
    const countryInput = document.getElementById('add-speaker-country');
    const agencyInput  = document.getElementById('add-speaker-agency');

    // Presentation autocomplete
    if (!prefilledPresentation) {
        const presAC = new Autocomplete(document.getElementById('add-speaker-pres'), {
            type: 'text', minChars: 2, searchLocal: false,
            onSelect: (data) => {
                selectedPresentation = { id: data.id, title: data.title };
                document.getElementById('add-speaker-pres').value = data.title;
            }
        });
        presAC.handleInput = async function(e) {
            const query = e.target.value.trim();
            if (query.length < 2) { this.hideResults(); return; }
            this.isLoading = true; this.showLoading();
            const result = await PresentationsAPI.search(query);
            const pList = result.success ? (result.data || []) : [];
            this.results = pList.map(pres => {
                const speakersNames = pres.speakers?.map(s => s.name).join(', ') || 'Sin ponentes';
                return {
                    type: 'local', data: pres,
                    display: `📋 ${pres.title} | Evento: ${pres.event_title} (${pres.event_country}) | Ponentes: ${speakersNames}`
                };
            });
            this.isLoading = false; this.renderResults();
        };
        localAutocompleteInstances.push(presAC);
    } else {
        document.getElementById('add-speaker-pres').value = prefilledPresentation.title;
    }

    // Speaker name autocomplete
    // CHANGED: handler reads .country and .agency (plain strings)
    const nameAC = createSpeakerNameAutocomplete(nameInput, (data) => {
        speakerData = {
            id:          data.id,
            name:        data.name,
            country:     data.country  ?? '',   // CHANGED: was data.country_s?.country || data.country_s
            countryData: null,
            agency:      data.agency   ?? ''    // CHANGED: was data.agency_s
        };
        applySpeakerFieldsFromData({ nameInput, countryInput, agencyInput }, data, { lockFields: true, showIndicator: true });
    });
    localAutocompleteInstances.push(nameAC);

    // Country autocomplete
    const countryAC = new Autocomplete(countryInput, {
        type: 'country', searchLocal: true, searchNominatim: true, allowCreate: false,
        onSelect: async (data, type) => {
            updateCountryValidationIndicator(countryInput, 'validating');
            if (type === 'nominatim') {
                try {
                    const cr = await CountriesAPI.create({ country: data.name, lat: parseFloat(data.lat), lon: parseFloat(data.lon) });
                    if (cr.success) {
                        speakerData.country     = data.name;
                        speakerData.countryData = { name: data.name, lat: parseFloat(data.lat), lon: parseFloat(data.lon), isNew: true, createdNow: true };
                        countryInput.value = data.name;
                        updateCountryValidationIndicator(countryInput, 'validated', `✅ Creado: ${data.name}`);
                        countryInput.disabled = true;
                        countryInput.style.backgroundColor = '#e7f5e7';
                    } else {
                        const retry = await CountriesAPI.list(data.name);
                        if (retry.success && retry.data.results?.length > 0) {
                            const ex = retry.data.results[0];
                            speakerData.country     = ex.country;
                            speakerData.countryData = { name: ex.country, lat: ex.lat, lon: ex.lon, isNew: false, createdNow: false };
                            countryInput.value = ex.country;
                            updateCountryValidationIndicator(countryInput, 'validated', `ℹ️ Existente: ${ex.country}`);
                            countryInput.disabled = true;
                        } else {
                            updateCountryValidationIndicator(countryInput, 'error', cr.error);
                        }
                    }
                } catch (err) {
                    updateCountryValidationIndicator(countryInput, 'error', err.message);
                }
            } else {
                speakerData.country     = data.country;
                speakerData.countryData = { name: data.country, lat: data.lat, lon: data.lon, isNew: false, createdNow: false };
                countryInput.value = data.country;
                updateCountryValidationIndicator(countryInput, 'validated');
                countryInput.disabled = true;
            }
        }
    });
    localAutocompleteInstances.push(countryAC);

    // Auto-validate on blur
    countryInput.addEventListener('blur', async (e) => {
        const value = e.target.value.trim();
        if (!value) { updateCountryValidationIndicator(countryInput, 'unvalidated'); return; }
        if (speakerData.countryData) { updateCountryValidationIndicator(countryInput, 'validated'); e.target.style.backgroundColor = '#e7f5e7'; return; }
        updateCountryValidationIndicator(countryInput, 'validating');
        try {
            const result = await CountriesAPI.list(value);
            if (result.success && result.data.results?.length > 0) {
                const found = result.data.results[0];
                speakerData.country     = found.country;
                speakerData.countryData = { name: found.country, lat: found.lat, lon: found.lon, isNew: false, createdNow: false };
                e.target.value = found.country;
                updateCountryValidationIndicator(countryInput, 'validated');
                e.target.style.backgroundColor = '#e7f5e7';
            } else {
                updateCountryValidationIndicator(countryInput, 'notfound');
                e.target.style.backgroundColor = '#fff3cd';
            }
        } catch (_) { updateCountryValidationIndicator(countryInput, 'error'); }
    });

    countryInput.addEventListener('input', (e) => {
        updateCountryValidationIndicator(countryInput, e.target.value.trim() ? 'typing' : 'unvalidated');
    });

    nameInput.addEventListener('input', (e) => {
        if (speakerData.id && e.target.value !== speakerData.name) {
            speakerData.id = null;
            if (countryInput.disabled) { countryInput.disabled = false; countryInput.style.backgroundColor = ''; }
            if (agencyInput.disabled)  { agencyInput.disabled  = false; agencyInput.style.backgroundColor  = ''; }
            const ind = nameInput.parentNode.querySelector('.speaker-status-indicator');
            if (ind) ind.remove();
        }
    });

    const agencyAC = new Autocomplete(agencyInput, { type: 'agency', searchLocal: true, allowCreate: true });
    localAutocompleteInstances.push(agencyAC);

    // Listeners
    document.getElementById('back-to-add-options-2')?.addEventListener('click', () => initAddOptionsView(container, availableLanguages));
    document.getElementById('add-speaker-cancel-btn').addEventListener('click', () => {
        if (confirm('¿Cancelar?')) initAddOptionsView(container, availableLanguages);
    });

    // -----------------------------------------------------------------------
    // handleAddSpeakerSubmit
    // CHANGED: SpeakersAPI.create sends 'country' and 'agency' (was country_s / agency_s)
    // -----------------------------------------------------------------------
    document.getElementById('add-speaker-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('add-speaker-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

        try {
            if (!selectedPresentation?.id) { showFormAlert('❌ Selecciona una presentación', 'error', 'add-speaker-alert'); return; }

            const name    = nameInput.value.trim();
            const country = countryInput.value.trim();
            const agency  = agencyInput.value.trim();

            if (!name || !country) { showFormAlert('❌ Se requieren nombre y país', 'error', 'add-speaker-alert'); return; }

            // Lazy country validation
            if (!speakerData.countryData?.lat) {
                showFormAlert(`🔍 Validando país "${country}"...`, 'info', 'add-speaker-alert');
                const tempData = { name, country, countryData: speakerData.countryData, agency };
                const validation = await ensureCountryDataComplete(tempData, 0, { speakers: [tempData] });
                if (!validation.success) {
                    showFormAlert(validation.error, 'error', 'add-speaker-alert');
                    countryInput.style.border = '2px solid #dc3545';
                    setTimeout(() => { countryInput.style.border = ''; }, 3000);
                    return;
                }
                speakerData.countryData = tempData.countryData;
            }

            // Find or create speaker
            let speaker;
            if (speakerData.id) {
                speaker = { id: speakerData.id };
            } else {
                const existing = await SpeakersAPI.list(name, country);
                if (existing.success && existing.data.results?.length > 0) {
                    speaker = existing.data.results[0];
                } else {
                    // CHANGED: payload uses 'country' and 'agency' (was 'country_s' / 'agency_s')
                    const newSpeaker = await SpeakersAPI.create({
                        name,
                        country,   // ← was country_s
                        agency     // ← was agency_s
                    });
                    if (!newSpeaker.success) { showFormAlert('❌ Error al crear el ponente: ' + newSpeaker.error, 'error', 'add-speaker-alert'); return; }
                    speaker = newSpeaker.data;
                }
            }

            const assocResult = await PresentationsAPI.addSpeaker(selectedPresentation.id, speaker.id);
            if (!assocResult.success) { showFormAlert('❌ Error al vincular el ponente: ' + assocResult.error, 'error', 'add-speaker-alert'); return; }

            showFormAlert('✅ Ponente añadido correctamente', 'success', 'add-speaker-alert');
            setTimeout(() => window.location.reload(), 2000);

        } catch (error) {
            showFormAlert('❌ Error inesperado: ' + error.message, 'error', 'add-speaker-alert');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Agregar Ponente';
        }
    });
}

// ===========================================================================
// EDIT EVENT FORM
// ===========================================================================

export function initEditEventForm(container, eventData, onSave, availableLanguages = [], availableEventTypes = []) {
    if (!canEdit()) {
        container.innerHTML = `<div class="alert-inline error"><p>⛔ Sin permisos para editar eventos.</p></div>`;
        return;
    }

    let editAgencies  = (eventData.agencies || []).map(a => ({ id: a.id, name: a.name }));
    let agencyAC      = null;
    let countryEditAC = null;
    let cityEditAC    = null;
    let editCountry   = eventData.country || '';
    let editCity      = eventData.city    || '';

    container.innerHTML = `
        <form id="edit-event-form" class="event-form">
            <div class="form-section">
                <h4 class="form-section-title">✏️ Editar Evento</h4>
                <small style="color:#888;">ID: ${eventData.id} · Creado por: ${eventData.created_by || 'legado'}</small>
                <div class="form-grid" style="margin-top:12px;">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label for="edit-ev-title">Título del evento *</label>
                        <input type="text" id="edit-ev-title" class="form-control" value="${escapeVal(eventData.event_title)}" required>
                    </div>
                    <div class="form-group">
                        <label for="edit-ev-year">Año</label>
                        <input type="number" id="edit-ev-year" class="form-control" value="${eventData.year || ''}" min="2000" max="2100">
                    </div>
                    <div class="form-group">
                        <label for="edit-ev-date">Fecha</label>
                        <input type="text" id="edit-ev-date" class="form-control" value="${escapeVal(eventData.date)}" placeholder="ej. 15-17 Nov">
                    </div>
                    <div class="form-group">
                        <label for="edit-ev-type">Tipo</label>
                        <input type="text" id="edit-ev-type" class="form-control" list="edit-ev-type-list" value="${escapeVal(eventData.type)}" placeholder="ej. Presencial">
                        <datalist id="edit-ev-type-list">
                            ${[...new Set(availableEventTypes)].sort().map(t => `<option value="${escapeVal(t)}"></option>`).join('')}
                        </datalist>
                    </div>
                    <div class="form-group">
                        <label for="edit-ev-country">País</label>
                        <input type="text" id="edit-ev-country" class="form-control autocomplete-input" value="${escapeVal(eventData.country)}" placeholder="Buscar país...">
                    </div>
                    <div class="form-group">
                        <label for="edit-ev-city">Ciudad</label>
                        <input type="text" id="edit-ev-city" class="form-control autocomplete-input" value="${escapeVal(eventData.city)}" placeholder="Buscar ciudad...">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label>Organismos</label>
                        <div style="display:flex;gap:10px;">
                            <input type="text" id="edit-ev-agency-input" class="form-control autocomplete-input" placeholder="Buscar organismo...">
                            <button type="button" id="edit-ev-agency-add" class="btn btn-outline-secondary">➕</button>
                        </div>
                        <div id="edit-ev-agencies-chips" class="chips-container"></div>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h4 class="form-section-title">📋 Presentaciones</h4>
                <div id="edit-ev-pres-list"></div>
            </div>

            <div class="form-buttons">
                <button type="button" id="edit-ev-delete" class="btn btn-outline-danger" style="margin-right:auto;">🗑️ Eliminar Evento</button>
                <button type="button" id="edit-ev-cancel" class="btn-cancel">❌ Cancelar</button>
                <button type="submit" id="edit-ev-submit" class="btn-save">💾 Guardar Evento</button>
            </div>
            <div id="edit-ev-alert" class="alert-inline" style="display:none;margin-top:15px;"></div>
        </form>
    `;

    // Pre-populate agency chips
    editAgencies.forEach(ag => addEditAgencyChip(ag.name, ag.id));

    // Render presentations list
    renderEditPresentationsList(eventData.presentations || []);

    // Agency autocomplete
    agencyAC = new Autocomplete(document.getElementById('edit-ev-agency-input'), {
        type: 'agency', searchLocal: true, allowCreate: true,
        onSelect: (data) => {
            addEditAgencyChip(data.name, data.id);
            document.getElementById('edit-ev-agency-input').value = '';
        },
        onCreate: async (name) => {
            const r = await AgenciesAPI.create({ name });
            const id = r.success ? r.data.id : null;
            addEditAgencyChip(name, id);
            document.getElementById('edit-ev-agency-input').value = '';
        }
    });

    document.getElementById('edit-ev-agency-add').addEventListener('click', () => {
        const val = document.getElementById('edit-ev-agency-input').value.trim();
        if (val && !editAgencies.find(a => a.name.toLowerCase() === val.toLowerCase())) {
            addEditAgencyChip(val, null);
        }
        document.getElementById('edit-ev-agency-input').value = '';
    });

    // Country autocomplete (local DB + Nominatim)
    countryEditAC = new Autocomplete(document.getElementById('edit-ev-country'), {
        type: 'country', searchLocal: true, searchNominatim: true, allowCreate: false,
        onSelect: async (data, type) => {
            if (type === 'nominatim') {
                await CountriesAPI.create({
                    country: data.name,
                    lat: parseFloat(data.lat),
                    lon: parseFloat(data.lon)
                });
                editCountry = data.name;
            } else {
                editCountry = data.country;
            }
            document.getElementById('edit-ev-country').value = editCountry;
            // Reset city when country changes
            document.getElementById('edit-ev-city').value = '';
            editCity = '';
            if (cityEditAC) cityEditAC.destroy();
            cityEditAC = buildCityAC();
        }
    });

    // City autocomplete (local DB + Nominatim, depends on selected country)
    cityEditAC = buildCityAC();

    function buildCityAC() {
        return new Autocomplete(document.getElementById('edit-ev-city'), {
            type: 'city', searchLocal: true, searchNominatim: true, allowCreate: false,
            dependsOn: () => editCountry,
            onSelect: async (data, type) => {
                if (type === 'nominatim') {
                    await CitiesAPI.create({
                        country: editCountry,
                        city: data.name,
                        lat: parseFloat(data.lat),
                        lon: parseFloat(data.lon)
                    });
                    editCity = data.name;
                } else {
                    editCity = data.city;
                }
                document.getElementById('edit-ev-city').value = editCity;
            }
        });
    }

    function destroyAllACs() {
        if (countryEditAC) { countryEditAC.destroy(); countryEditAC = null; }
        if (cityEditAC)    { cityEditAC.destroy();    cityEditAC    = null; }
        if (agencyAC)      { agencyAC.destroy();      agencyAC      = null; }
    }

    // Delete entire event
    document.getElementById('edit-ev-delete').addEventListener('click', async () => {
        if (!confirm(`¿Eliminar el evento "${eventData.event_title}"?\n\nSe eliminarán todas sus presentaciones y los vínculos con ponentes.`)) return;
        const r = await EventsAPI.delete(eventData.id);
        if (r.success) {
            destroyAllACs();
            onSave();
        } else {
            alert('❌ Error al eliminar: ' + r.error);
        }
    });

    document.getElementById('edit-ev-cancel').addEventListener('click', () => {
        destroyAllACs();
        onSave();
    });

    container.querySelector('#edit-event-form').addEventListener('submit', handleEditEventSubmit);

    // ---------------------------------------------------------------------------
    // Helpers (closures over editAgencies)
    // ---------------------------------------------------------------------------

    function addEditAgencyChip(name, id) {
        if (editAgencies.find(a => a.name.toLowerCase() === name.toLowerCase())) return;
        editAgencies.push({ id, name });
        const chipsEl = document.getElementById('edit-ev-agencies-chips');
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `${name}<button type="button" class="chip-remove" data-name="${name}">×</button>`;
        chipsEl.appendChild(chip);
        chip.querySelector('.chip-remove').addEventListener('click', () => {
            editAgencies = editAgencies.filter(a => a.name !== name);
            chip.remove();
        });
    }

    function renderEditPresentationsList(presentations) {
        const listEl = document.getElementById('edit-ev-pres-list');
        if (!presentations.length) {
            listEl.innerHTML = '<p style="color:#888;font-size:0.9rem;">Sin presentaciones.</p>';
            return;
        }
        listEl.innerHTML = '';
        presentations.forEach(pres => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid #e1e4e8;border-radius:6px;margin-bottom:8px;';
            row.innerHTML = `
                <span style="font-size:0.9rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeVal(pres.title)}">📋 ${escapeVal(pres.title)}</span>
                <div style="display:flex;gap:6px;flex-shrink:0;margin-left:8px;">
                    <button type="button" class="popup-edit-btn" data-pres-id="${pres.id}">✏️</button>
                    <button type="button" class="popup-delete-btn" data-pres-id="${pres.id}" data-pres-title="${escapeVal(pres.title)}">🗑️</button>
                </div>
            `;
            row.querySelector('[data-pres-id].popup-edit-btn').addEventListener('click', async () => {
                const r = await PresentationsAPI.get(pres.id);
                if (!r.success) { alert('Error cargando presentación: ' + r.error); return; }
                destroyAllACs();
                initEditPresentationForm(container, r.data,
                    () => initEditEventForm(container, eventData, onSave, availableLanguages, availableEventTypes),
                    onSave,
                    availableLanguages
                );
            });
            row.querySelector('[data-pres-id].popup-delete-btn').addEventListener('click', async () => {
                if (!confirm(`¿Eliminar la presentación "${pres.title}"?`)) return;
                const r = await PresentationsAPI.delete(pres.id);
                if (r.success) {
                    row.remove();
                    eventData.presentations = eventData.presentations.filter(p => p.id !== pres.id);
                } else {
                    alert('Error al eliminar: ' + r.error);
                }
            });
            listEl.appendChild(row);
        });
    }

    async function handleEditEventSubmit(e) {
        e.preventDefault();
        const submitBtn = container.querySelector('#edit-ev-submit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

        const title   = document.getElementById('edit-ev-title').value.trim();
        const year    = parseInt(document.getElementById('edit-ev-year').value) || null;
        const date    = document.getElementById('edit-ev-date').value.trim();
        const type    = document.getElementById('edit-ev-type').value.trim();
        const country = editCountry || document.getElementById('edit-ev-country').value.trim();
        const city    = editCity    || document.getElementById('edit-ev-city').value.trim();

        if (!title)   { showEditAlert('El título es obligatorio', 'error'); submitBtn.disabled = false; submitBtn.innerHTML = '💾 Guardar Evento'; return; }
        if (!country) { showEditAlert('El país es obligatorio',   'error'); submitBtn.disabled = false; submitBtn.innerHTML = '💾 Guardar Evento'; return; }
        if (!city)    { showEditAlert('La ciudad es obligatoria', 'error'); submitBtn.disabled = false; submitBtn.innerHTML = '💾 Guardar Evento'; return; }

        // Resolve missing agency IDs (for agencies added by name without an id)
        const agencyIds = [];
        for (const ag of editAgencies) {
            if (ag.id) { agencyIds.push(ag.id); continue; }
            const r = await AgenciesAPI.create({ name: ag.name });
            if (r.success) agencyIds.push(r.data.id);
        }

        const result = await EventsAPI.patch(eventData.id, {
            event_title: title, year, date, type, country, city, agency: agencyIds
        });

        if (result.success) {
            showEditAlert('✅ Evento actualizado correctamente', 'success');
            destroyAllACs();
            setTimeout(() => onSave(), 1500);
        } else {
            showEditAlert('❌ Error: ' + result.error, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Guardar Evento';
        }
    }

    function showEditAlert(msg, type) {
        const el = document.getElementById('edit-ev-alert');
        if (!el) return;
        el.className = `alert-inline ${type}`;
        el.textContent = msg;
        el.style.display = 'block';
        if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
    }

}

// Helper for HTML attribute value escaping
function escapeVal(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ===========================================================================
// EDIT PRESENTATION FORM
// ===========================================================================

export function initEditPresentationForm(container, presentationData, onBack, onSave, availableLanguages = []) {
    // Track languages locally; speaker add/remove calls API immediately
    let editLanguages = [];
    let speakerACInstance = null;

    container.innerHTML = `
        <form id="edit-pres-form" class="event-form">
            <button type="button" id="edit-pres-back" class="btn btn-outline-secondary" style="margin-bottom:16px;">← Volver al evento</button>

            <div class="form-section">
                <h4 class="form-section-title">✏️ Editar Presentación</h4>
                <small style="color:#888;">ID: ${presentationData.id} · Evento: ${escapeVal(presentationData.event_title)}</small>
                <div class="form-grid" style="margin-top:12px;">
                    <div class="form-group" style="grid-column:1/-1;">
                        <label for="edit-pres-title">Título *</label>
                        <input type="text" id="edit-pres-title" class="form-control" value="${escapeVal(presentationData.title)}" required>
                    </div>
                    <div class="form-group">
                        <label>Idiomas</label>
                        <div style="display:flex;gap:10px;">
                            <input type="text" id="edit-pres-lang-input" class="form-control" list="edit-pres-lang-list" placeholder="ej. Español, Inglés...">
                            <datalist id="edit-pres-lang-list">
                                ${[...new Set(availableLanguages)].sort().map(l => `<option value="${escapeVal(l)}"></option>`).join('')}
                            </datalist>
                            <button type="button" id="edit-pres-lang-add" class="btn btn-outline-secondary">➕</button>
                        </div>
                        <div id="edit-pres-lang-chips" class="chips-container"></div>
                    </div>
                    <div class="form-group">
                        <label for="edit-pres-url">URL Documento</label>
                        <input type="url" id="edit-pres-url" class="form-control" value="${escapeVal(presentationData.url_document)}" placeholder="https://...">
                    </div>
                    <div class="form-group" style="grid-column:1/-1;">
                        <label for="edit-pres-obs">Observaciones</label>
                        <textarea id="edit-pres-obs" class="form-control" rows="2">${escapeVal(presentationData.observations)}</textarea>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <h4 class="form-section-title">👥 Ponentes</h4>
                <div id="edit-pres-speakers-list"></div>
                <div style="margin-top:12px;">
                    <label style="font-weight:600;">Añadir ponente</label>
                    <div style="display:flex;gap:10px;margin-top:6px;">
                        <input type="text" id="edit-pres-speaker-input" class="form-control autocomplete-input" placeholder="Buscar o crear ponente...">
                        <input type="text" id="edit-pres-speaker-country" class="form-control" placeholder="País *" style="max-width:150px;">
                        <input type="text" id="edit-pres-speaker-agency" class="form-control" placeholder="Organismo" style="max-width:150px;">
                        <button type="button" id="edit-pres-speaker-add" class="btn btn-outline-secondary">➕</button>
                    </div>
                    <div id="edit-pres-add-speaker-alert" style="font-size:0.85rem;margin-top:4px;"></div>
                    <small style="display:block;margin-top:8px;padding:6px 10px;background:#fff3cd;color:#664d03;border-radius:4px;">
                        ⚠️ Haz clic en <strong>➕</strong> para vincular al ponente <strong>antes</strong> de guardar.
                        Si guardas sin pulsar ➕, el ponente no quedará vinculado a esta presentación.
                    </small>
                </div>
            </div>

            <div class="form-buttons">
                <button type="button" id="edit-pres-cancel" class="btn-cancel">❌ Cancelar</button>
                <button type="submit" id="edit-pres-submit" class="btn-save">💾 Guardar Presentación</button>
            </div>
            <div id="edit-pres-alert" class="alert-inline" style="display:none;margin-top:15px;"></div>
        </form>
    `;

    // Pre-populate language chips
    (presentationData.language || []).forEach(l => addEditLangChip(l));

    // Render current speakers
    renderEditSpeakerList(presentationData.speakers || []);

    // Speaker name autocomplete (for the add-speaker row)
    speakerACInstance = new Autocomplete(document.getElementById('edit-pres-speaker-input'), {
        type: 'speaker', searchLocal: true, allowCreate: false,
        onSelect: (data) => {
            document.getElementById('edit-pres-speaker-input').value  = data.name;
            document.getElementById('edit-pres-speaker-country').value = data.country || '';
            document.getElementById('edit-pres-speaker-agency').value  = data.agency  || '';
            document.getElementById('edit-pres-speaker-input').dataset.speakerId = data.id;
        }
    });

    // Language add
    document.getElementById('edit-pres-lang-add').addEventListener('click', () => {
        const val = document.getElementById('edit-pres-lang-input').value.trim();
        if (val) { addEditLangChip(val); document.getElementById('edit-pres-lang-input').value = ''; }
    });
    document.getElementById('edit-pres-lang-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('edit-pres-lang-add').click(); }
    });

    // Add speaker button
    document.getElementById('edit-pres-speaker-add').addEventListener('click', handleAddSpeaker);

    // Back
    document.getElementById('edit-pres-back').addEventListener('click', () => {
        if (speakerACInstance) speakerACInstance.destroy();
        onBack();
    });

    document.getElementById('edit-pres-cancel').addEventListener('click', () => {
        if (speakerACInstance) speakerACInstance.destroy();
        onBack();
    });

    document.getElementById('edit-pres-form').addEventListener('submit', handleEditPresSubmit);

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function addEditLangChip(lang) {
        if (editLanguages.includes(lang)) return;
        editLanguages.push(lang);
        const el = document.getElementById('edit-pres-lang-chips');
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `${lang}<button type="button" class="chip-remove" data-lang="${lang}">×</button>`;
        el.appendChild(chip);
        chip.querySelector('.chip-remove').addEventListener('click', () => {
            editLanguages = editLanguages.filter(l => l !== lang);
            chip.remove();
        });
    }

    function renderEditSpeakerList(speakers) {
        const listEl = document.getElementById('edit-pres-speakers-list');
        listEl.innerHTML = '';
        if (!speakers.length) {
            listEl.innerHTML = '<p style="color:#888;font-size:0.85rem;">Sin ponentes vinculados.</p>';
            return;
        }
        speakers.forEach(spk => {
            const row = document.createElement('div');
            row.dataset.speakerId = spk.id;
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:1px solid #e1e4e8;border-radius:6px;margin-bottom:6px;';
            row.innerHTML = `
                <span style="font-size:0.9rem;">
                    👤 <strong>${escapeVal(spk.name)}</strong>
                    <span style="color:#666;"> — ${escapeVal(spk.country || '')}${spk.agency ? ` (${escapeVal(spk.agency)})` : ''}</span>
                </span>
                <button type="button" class="popup-delete-btn" style="flex-shrink:0;margin-left:8px;">× Desvincular</button>
            `;
            row.querySelector('.popup-delete-btn').addEventListener('click', async () => {
                if (!confirm(`¿Desvincular a "${spk.name}" de esta presentación?`)) return;
                const r = await PresentationsAPI.removeSpeaker(presentationData.id, spk.id);
                if (r.success) {
                    row.remove();
                    presentationData.speakers = presentationData.speakers.filter(s => s.id !== spk.id);
                    if (!document.querySelectorAll('#edit-pres-speakers-list [data-speaker-id]').length) {
                        document.getElementById('edit-pres-speakers-list').innerHTML =
                            '<p style="color:#888;font-size:0.85rem;">Sin ponentes vinculados.</p>';
                    }
                } else {
                    alert('Error al desvincular: ' + r.error);
                }
            });
            listEl.appendChild(row);
        });
    }

    async function handleAddSpeaker() {
        const nameInput    = document.getElementById('edit-pres-speaker-input');
        const countryInput = document.getElementById('edit-pres-speaker-country');
        const agencyInput  = document.getElementById('edit-pres-speaker-agency');
        const alertEl      = document.getElementById('edit-pres-add-speaker-alert');

        const name    = nameInput.value.trim();
        const country = countryInput.value.trim();
        const agency  = agencyInput.value.trim();
        const existingId = nameInput.dataset.speakerId ? Number(nameInput.dataset.speakerId) : null;

        if (!name || !country) {
            alertEl.style.color = '#dc3545';
            alertEl.textContent = '⚠️ Nombre y país son obligatorios.';
            return;
        }

        alertEl.style.color = '#ffc107';
        alertEl.textContent = '⏳ Vinculando ponente...';

        let speakerId = existingId;
        if (!speakerId) {
            const existing = await SpeakersAPI.list(name, country);
            const found = existing.success
                ? (existing.data.results || existing.data || []).find(s =>
                    s.name.toLowerCase() === name.toLowerCase())
                : null;
            if (found) {
                speakerId = found.id;
            } else {
                const created = await SpeakersAPI.create({ name, country, agency });
                if (!created.success) {
                    alertEl.style.color = '#dc3545';
                    alertEl.textContent = '❌ Error al crear ponente: ' + created.error;
                    return;
                }
                speakerId = created.data.id;
            }
        }

        const linkResult = await PresentationsAPI.addSpeaker(presentationData.id, speakerId);
        if (!linkResult.success) {
            alertEl.style.color = '#dc3545';
            alertEl.textContent = '❌ Error al vincular: ' + linkResult.error;
            return;
        }

        // Add the new speaker to the live list
        const newSpeaker = { id: speakerId, name, country, agency };
        presentationData.speakers.push(newSpeaker);
        const listEl = document.getElementById('edit-pres-speakers-list');
        const placeholder = listEl.querySelector('p');
        if (placeholder) placeholder.remove();
        renderEditSpeakerList(presentationData.speakers);

        nameInput.value = '';
        countryInput.value = '';
        agencyInput.value = '';
        delete nameInput.dataset.speakerId;
        alertEl.style.color = '#28a745';
        alertEl.textContent = `✅ ${name} vinculado correctamente.`;
        setTimeout(() => { alertEl.textContent = ''; }, 3000);
    }

    async function handleEditPresSubmit(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('edit-pres-submit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

        const title = document.getElementById('edit-pres-title').value.trim();
        const url   = document.getElementById('edit-pres-url').value.trim();
        const obs   = document.getElementById('edit-pres-obs').value.trim();

        if (!title) {
            showPresAlert('El título es obligatorio', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Guardar Presentación';
            return;
        }

        const result = await PresentationsAPI.patch(presentationData.id, {
            title, language: editLanguages, url_document: url, observations: obs
        });

        if (result.success) {
            showPresAlert('✅ Presentación actualizada', 'success');
            if (speakerACInstance) speakerACInstance.destroy();
            setTimeout(() => onSave(), 1500);
        } else {
            showPresAlert('❌ Error: ' + result.error, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Guardar Presentación';
        }
    }

    function showPresAlert(msg, type) {
        const el = document.getElementById('edit-pres-alert');
        if (!el) return;
        el.className = `alert-inline ${type}`;
        el.textContent = msg;
        el.style.display = 'block';
        if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
    }
}

// ===========================================================================
// ADD OPTIONS VIEW (tab reset)
// ===========================================================================

function initAddOptionsView(container, availableLanguages = []) {
    container.innerHTML = `
        <div class="add-options">
            <button class="add-option-btn" data-action="add-presentation">
                📋 Agregar Presentación a Evento Existente
                <small>Añade una nueva presentación con ponentes a un evento ya creado</small>
            </button>
            <button class="add-option-btn" data-action="add-speaker">
                👤 Agregar Ponente a Presentación Existente
                <small>Añade un nuevo ponente a una presentación existente</small>
            </button>
        </div>
    `;
    document.querySelectorAll('.add-option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.currentTarget.dataset.action;
            if (action === 'add-presentation') initAddPresentationForm(container, null, availableLanguages);
            else if (action === 'add-speaker')  initAddSpeakerForm(container, null, availableLanguages);
        });
    });
}

/**
 * Forms Module - Generación y manejo de formularios de edición
 */

import { EventsAPI } from './api.js';
import { Autocomplete } from './autocomplete.js';
import { canEdit } from './auth.js';

const MAX_PRESENTATIONS = 10;

// Estado del formulario
let formState = {
    country: null,
    city: null,
    agencies: [],
    presentations: []
};

// Instancias de autocompletado
let autocompleteInstances = [];

/**
 * ====================================
 * INICIALIZACIÓN DEL FORMULARIO
 * ====================================
 */

export function initEventForm(container) {
    if (!canEdit()) {
        container.innerHTML = `
            <div class="alert-inline error">
                <p>⛔ No tienes permisos para crear o editar eventos.</p>
            </div>
        `;
        return;
    }

    // Limpiar estado
    resetFormState();

    // Generar HTML del formulario
    container.innerHTML = generateFormHTML();

    // Inicializar autocompletados
    initAutocompletes();

    // Event listeners
    attachEventListeners();
}

/**
 * Resetear estado del formulario
 */
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

    // Destruir instancias anteriores de autocomplete
    autocompleteInstances.forEach(instance => instance.destroy());
    autocompleteInstances = [];
}

/**
 * ====================================
 * GENERACIÓN DE HTML
 * ====================================
 */

function generateFormHTML() {
    return `
        <form id="event-complete-form" class="event-form">
            <!-- Sección: Información del Evento -->
            <div class="form-section">
                <h4 class="form-section-title">📅 Información del Evento</h4>
                
                <div class="form-grid">
                    <!-- País -->
                    <div class="form-group">
                        <label for="event-country">País del evento *</label>
                        <input 
                            type="text" 
                            id="event-country" 
                            class="form-control autocomplete-input"
                            placeholder="Escribe para buscar..."
                            required
                        >
                        <div id="country-coords" class="coords-display" style="display: none;">
                            <span class="coord-value" id="country-lat">Lat: -</span>
                            <span class="coord-value" id="country-lon">Lon: -</span>
                        </div>
                    </div>

                    <!-- Ciudad -->
                    <div class="form-group">
                        <label for="event-city">Ciudad del evento *</label>
                        <input 
                            type="text" 
                            id="event-city" 
                            class="form-control autocomplete-input"
                            placeholder="Primero selecciona un país"
                            disabled
                            required
                        >
                        <div id="city-coords" class="coords-display" style="display: none;">
                            <span class="coord-value" id="city-lat">Lat: -</span>
                            <span class="coord-value" id="city-lon">Lon: -</span>
                        </div>
                    </div>

                    <!-- Fecha -->
                    <div class="form-group">
                        <label for="event-date">Fecha</label>
                        <input 
                            type="text" 
                            id="event-date" 
                            class="form-control"
                            placeholder="ej: 15-20 Marzo 2025"
                        >
                    </div>

                    <!-- Año -->
                    <div class="form-group">
                        <label for="event-year">Año *</label>
                        <input 
                            type="number" 
                            id="event-year" 
                            class="form-control"
                            placeholder="2025"
                            min="2000"
                            max="2100"
                            required
                        >
                    </div>

                    <!-- Tipo -->
                    <div class="form-group">
                        <label for="event-type">Tipo de evento</label>
                        <input 
                            type="text" 
                            id="event-type" 
                            class="form-control"
                            placeholder="ej: Conferencia, Workshop, Webinar"
                        >
                    </div>

                    <!-- Título del evento -->
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label for="event-title">Título del evento *</label>
                        <input 
                            type="text" 
                            id="event-title" 
                            class="form-control"
                            placeholder="Nombre completo del evento"
                            required
                        >
                    </div>
                </div>

                <!-- Agencias -->
                <div class="form-group">
                    <label for="event-agency-input">Organismos organizadores</label>
                    <div style="display: flex; gap: 10px;">
                        <input 
                            type="text" 
                            id="event-agency-input" 
                            class="form-control autocomplete-input"
                            placeholder="Escribe y presiona Enter"
                        >
                        <button type="button" id="add-agency-btn" class="btn btn-outline-secondary">
                            ➕ Agregar
                        </button>
                    </div>
                    <div id="agencies-chips" class="chips-container"></div>
                </div>
            </div>

            <!-- Sección: Presentaciones -->
            <div class="form-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 class="form-section-title" style="margin: 0;">📋 Presentaciones</h4>
                    <button type="button" id="add-presentation-btn" class="add-button">
                        ➕ Agregar Presentación
                    </button>
                </div>
                
                <div id="presentations-container" class="presentations-list">
                    <!-- Las presentaciones se generan dinámicamente -->
                </div>
            </div>

            <!-- Botones de acción -->
            <div class="form-buttons">
                <button type="button" id="cancel-form-btn" class="btn-cancel">
                    ❌ Cancelar
                </button>
                <button type="submit" id="submit-form-btn" class="btn-save">
                    💾 Guardar Evento
                </button>
            </div>

            <!-- Alert para mensajes -->
            <div id="form-alert" class="alert-inline" style="display: none; margin-top: 20px;"></div>
        </form>
    `;
}

/**
 * Generar HTML de una presentación
 */
function generatePresentationHTML(index) {
    return `
        <div class="presentation-card" data-presentation-index="${index}">
            <div class="presentation-header">
                <span class="presentation-number">Presentación #${index + 1}</span>
                <button type="button" class="remove-presentation" data-index="${index}">
                    🗑️ Eliminar
                </button>
            </div>

            <div class="form-grid">
                <!-- Título de la presentación -->
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Título de la presentación *</label>
                    <input 
                        type="text" 
                        class="form-control presentation-title"
                        data-presentation-index="${index}"
                        placeholder="Título de la charla o ponencia"
                        required
                    >
                </div>

                <!-- Idiomas -->
                <div class="form-group">
                    <label>Idiomas</label>
                    <div style="display: flex; gap: 10px;">
                        <input 
                            type="text" 
                            class="form-control language-input"
                            data-presentation-index="${index}"
                            placeholder="ej: Español, English"
                        >
                        <button type="button" class="btn btn-outline-secondary add-language-btn" data-index="${index}">
                            ➕
                        </button>
                    </div>
                    <div class="chips-container languages-chips" data-presentation-index="${index}"></div>
                </div>

                <!-- URL -->
                <div class="form-group">
                    <label>URL del documento</label>
                    <input 
                        type="url" 
                        class="form-control presentation-url"
                        data-presentation-index="${index}"
                        placeholder="https://..."
                    >
                </div>

                <!-- Observaciones -->
                <div class="form-group" style="grid-column: 1 / -1;">
                    <label>Observaciones</label>
                    <textarea 
                        class="form-control presentation-observations"
                        data-presentation-index="${index}"
                        rows="2"
                        placeholder="Notas adicionales sobre la presentación"
                    ></textarea>
                </div>
            </div>

            <!-- Ponentes -->
            <div style="margin-top: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <label style="margin: 0; font-weight: 600;">👥 Ponentes</label>
                    <button type="button" class="btn btn-outline-secondary add-speaker-btn" data-presentation-index="${index}">
                        ➕ Agregar Ponente
                    </button>
                </div>
                <div class="speakers-list" data-presentation-index="${index}">
                    ${generateSpeakerRowHTML(index, 0)}
                </div>
            </div>
        </div>
    `;
}

/**
 * Generar HTML de un ponente
 */
function generateSpeakerRowHTML(presentationIndex, speakerIndex) {
    return `
        <div class="speaker-row" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}">
            <div class="form-group">
                <input 
                    type="text" 
                    class="form-control speaker-name"
                    data-presentation-index="${presentationIndex}"
                    data-speaker-index="${speakerIndex}"
                    placeholder="Nombre del ponente *"
                    required
                >
            </div>
            <div class="form-group">
                <input 
                    type="text" 
                    class="form-control speaker-country autocomplete-input"
                    data-presentation-index="${presentationIndex}"
                    data-speaker-index="${speakerIndex}"
                    placeholder="País *"
                    required
                >
            </div>
            <div class="form-group">
                <input 
                    type="text" 
                    class="form-control speaker-agency autocomplete-input"
                    data-presentation-index="${presentationIndex}"
                    data-speaker-index="${speakerIndex}"
                    placeholder="Organismo"
                >
            </div>
            <button type="button" class="remove-speaker" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}">
                🗑️
            </button>
        </div>
    `;
}

/**
 * ====================================
 * INICIALIZACIÓN DE AUTOCOMPLETADOS
 * ====================================
 */

function initAutocompletes() {
    // Autocompletado de país (con Nominatim)
    const countryAutocomplete = new Autocomplete(document.getElementById('event-country'), {
        type: 'country',
        searchLocal: true,
        searchNominatim: true,
        allowCreate: true,
        onSelect: handleCountrySelect,
        onCreate: handleCountryCreate
    });
    autocompleteInstances.push(countryAutocomplete);

    // Autocompletado de agencia
    const agencyAutocomplete = new Autocomplete(document.getElementById('event-agency-input'), {
        type: 'agency',
        searchLocal: true,
        allowCreate: true,
        onSelect: handleAgencySelect,
        onCreate: handleAgencyAdd
    });
    autocompleteInstances.push(agencyAutocomplete);

    // Renderizar primera presentación
    renderPresentations();
}

/**
 * Inicializar autocompletado de ciudad (después de seleccionar país)
 */
function initCityAutocomplete() {
    const cityInput = document.getElementById('event-city');
    
    // Destruir instancia anterior si existe
    const existingIndex = autocompleteInstances.findIndex(
        ac => ac.input.id === 'event-city'
    );
    if (existingIndex >= 0) {
        autocompleteInstances[existingIndex].destroy();
        autocompleteInstances.splice(existingIndex, 1);
    }

    // Crear nueva instancia
    const cityAutocomplete = new Autocomplete(cityInput, {
        type: 'city',
        searchLocal: true,
        searchNominatim: true,
        allowCreate: true,
        dependsOn: () => formState.country?.name || '',
        onSelect: handleCitySelect,
        onCreate: handleCityCreate
    });
    autocompleteInstances.push(cityAutocomplete);

    cityInput.disabled = false;
}

/**
 * Inicializar autocompletados de ponentes
 */
function initSpeakerAutocompletes(presentationIndex, speakerIndex) {
    // País del ponente
    const countryInput = document.querySelector(
        `.speaker-country[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    
    if (countryInput && !countryInput.dataset.autocompleteInit) {
        const ac = new Autocomplete(countryInput, {
            type: 'country',
            searchLocal: true,
            searchNominatim: true,
            allowCreate: true,
            onSelect: (data, type) => {
                handleSpeakerCountrySelect(data, type, presentationIndex, speakerIndex);
            }
        });
        autocompleteInstances.push(ac);
        countryInput.dataset.autocompleteInit = 'true';
    }

    // Agencia del ponente
    const agencyInput = document.querySelector(
        `.speaker-agency[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    
    if (agencyInput && !agencyInput.dataset.autocompleteInit) {
        const ac = new Autocomplete(agencyInput, {
            type: 'agency',
            searchLocal: true,
            allowCreate: true
        });
        autocompleteInstances.push(ac);
        agencyInput.dataset.autocompleteInit = 'true';
    }
}

/**
 * ====================================
 * HANDLERS DE AUTOCOMPLETADO
 * ====================================
 */

function handleCountrySelect(data, type) {
    if (type === 'nominatim') {
        formState.country = {
            name: data.name,
            lat: data.lat,
            lon: data.lon,
            isNew: true
        };
    } else {
        formState.country = {
            name: data.country,
            lat: data.lat,
            lon: data.lon,
            isNew: false
        };
    }

    updateCoordsDisplay('country', formState.country.lat, formState.country.lon);
    
    // Habilitar ciudad
    initCityAutocomplete();
}

function handleCountryCreate(countryName) {
    // Buscar en Nominatim automáticamente
    showFormAlert('Buscando coordenadas de ' + countryName + '...', 'info');
    
    import('./autocomplete.js').then(module => {
        const { NominatimAPI } = module;
        // Nota: necesitarías exportar NominatimAPI en autocomplete.js
        // Por ahora, simulamos búsqueda
        setTimeout(() => {
            const confirmed = confirm(
                `No se encontraron coordenadas automáticas para "${countryName}".\n` +
                `¿Deseas crearlo manualmente?\n\n` +
                `Necesitarás ingresar las coordenadas.`
            );
            
            if (confirmed) {
                const lat = prompt('Latitud (decimal):');
                const lon = prompt('Longitud (decimal):');
                
                if (lat && lon) {
                    formState.country = {
                        name: countryName,
                        lat: parseFloat(lat),
                        lon: parseFloat(lon),
                        isNew: true
                    };
                    
                    document.getElementById('event-country').value = countryName;
                    updateCoordsDisplay('country', formState.country.lat, formState.country.lon);
                    initCityAutocomplete();
                }
            }
        }, 1000);
    });
}

function handleCitySelect(data, type) {
    if (type === 'nominatim') {
        formState.city = {
            name: data.name,
            lat: data.lat,
            lon: data.lon,
            isNew: true
        };
    } else {
        formState.city = {
            name: data.city,
            lat: data.lat,
            lon: data.lon,
            isNew: false
        };
    }

    updateCoordsDisplay('city', formState.city.lat, formState.city.lon);
}

function handleCityCreate(cityName) {
    showFormAlert('Buscando coordenadas de ' + cityName + '...', 'info');
    
    setTimeout(() => {
        const confirmed = confirm(
            `No se encontraron coordenadas automáticas para "${cityName}".\n` +
            `¿Deseas crearla manualmente?`
        );
        
        if (confirmed) {
            const lat = prompt('Latitud (decimal):');
            const lon = prompt('Longitud (decimal):');
            
            if (lat && lon) {
                formState.city = {
                    name: cityName,
                    lat: parseFloat(lat),
                    lon: parseFloat(lon),
                    isNew: true
                };
                
                document.getElementById('event-city').value = cityName;
                updateCoordsDisplay('city', formState.city.lat, formState.city.lon);
            }
        }
    }, 1000);
}

function handleAgencySelect(data, type) {
    const agencyName = data.nombre || data.name;
    addAgencyChip(agencyName);
    document.getElementById('event-agency-input').value = '';
}

function handleAgencyAdd(agencyName) {
    addAgencyChip(agencyName);
    document.getElementById('event-agency-input').value = '';
}

function handleSpeakerCountrySelect(data, type, presIndex, speakerIndex) {
    const speakerCountryName = type === 'nominatim' ? data.name : data.country;
    
    // Actualizar en formState
    if (!formState.presentations[presIndex].speakers[speakerIndex]) {
        formState.presentations[presIndex].speakers[speakerIndex] = {};
    }
    formState.presentations[presIndex].speakers[speakerIndex].country = speakerCountryName;
}

/**
 * ====================================
 * RENDERIZADO DINÁMICO
 * ====================================
 */

function renderPresentations() {
    const container = document.getElementById('presentations-container');
    container.innerHTML = '';

    formState.presentations.forEach((presentation, index) => {
        const div = document.createElement('div');
        div.innerHTML = generatePresentationHTML(index);
        container.appendChild(div.firstElementChild);

        // Inicializar autocompletados de ponentes
        presentation.speakers.forEach((speaker, sIndex) => {
            if (sIndex > 0) {
                // Agregar filas adicionales de ponentes
                const speakersContainer = container.querySelector(
                    `.speakers-list[data-presentation-index="${index}"]`
                );
                const speakerDiv = document.createElement('div');
                speakerDiv.innerHTML = generateSpeakerRowHTML(index, sIndex);
                speakersContainer.appendChild(speakerDiv.firstElementChild);
            }
            initSpeakerAutocompletes(index, sIndex);
        });
    });
}

function addAgencyChip(agencyName) {
    if (formState.agencies.includes(agencyName)) {
        return; // Ya existe
    }

    formState.agencies.push(agencyName);

    const container = document.getElementById('agencies-chips');
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `
        ${agencyName}
        <button type="button" class="chip-remove" data-agency="${agencyName}">×</button>
    `;
    container.appendChild(chip);

    // Event listener para eliminar
    chip.querySelector('.chip-remove').addEventListener('click', (e) => {
        const agency = e.target.dataset.agency;
        formState.agencies = formState.agencies.filter(a => a !== agency);
        chip.remove();
    });
}

function addLanguageChip(presentationIndex, language) {
    if (!formState.presentations[presentationIndex].languages) {
        formState.presentations[presentationIndex].languages = [];
    }

    if (formState.presentations[presentationIndex].languages.includes(language)) {
        return; // Ya existe
    }

    formState.presentations[presentationIndex].languages.push(language);

    const container = document.querySelector(
        `.languages-chips[data-presentation-index="${presentationIndex}"]`
    );
    
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `
        ${language}
        <button type="button" class="chip-remove" data-language="${language}">×</button>
    `;
    container.appendChild(chip);

    chip.querySelector('.chip-remove').addEventListener('click', (e) => {
        const lang = e.target.dataset.language;
        formState.presentations[presentationIndex].languages = 
            formState.presentations[presentationIndex].languages.filter(l => l !== lang);
        chip.remove();
    });
}

function updateCoordsDisplay(type, lat, lon) {
    lat = Number(lat);
    lon = Number(lon);
    const coordsDiv = document.getElementById(`${type}-coords`);
    const latSpan = document.getElementById(`${type}-lat`);
    const lonSpan = document.getElementById(`${type}-lon`);

    if (lat && lon) {
        latSpan.textContent = `Lat: ${lat.toFixed(4)}`;
        lonSpan.textContent = `Lon: ${lon.toFixed(4)}`;
        coordsDiv.style.display = 'flex';
    } else {
        coordsDiv.style.display = 'none';
    }
}

/**
 * ====================================
 * EVENT LISTENERS
 * ====================================
 */

function attachEventListeners() {
    const form = document.getElementById('event-complete-form');

    // Submit del formulario
    form.addEventListener('submit', handleFormSubmit);

    // Cancelar
    document.getElementById('cancel-form-btn').addEventListener('click', () => {
        if (confirm('¿Seguro que deseas cancelar? Se perderán los cambios.')) {
            resetFormState();
            initEventForm(document.getElementById('editor-content'));
        }
    });

    // Agregar agencia
    document.getElementById('add-agency-btn').addEventListener('click', () => {
        const input = document.getElementById('event-agency-input');
        const value = input.value.trim();
        if (value) {
            addAgencyChip(value);
            input.value = '';
        }
    });

    // Enter en input de agencia
    document.getElementById('event-agency-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('add-agency-btn').click();
        }
    });

    // Agregar presentación
    document.getElementById('add-presentation-btn').addEventListener('click', () => {
        if (formState.presentations.length >= MAX_PRESENTATIONS) {
            showFormAlert(`Máximo ${MAX_PRESENTATIONS} presentaciones permitidas`, 'warning');
            return;
        }

        formState.presentations.push({
            title: '',
            languages: [],
            url: '',
            observations: '',
            speakers: [{ name: '', country: null, agency: '' }]
        });

        renderPresentations();
    });

    // Delegación de eventos para elementos dinámicos
    const container = document.getElementById('presentations-container');

    container.addEventListener('click', (e) => {
        // Eliminar presentación
        if (e.target.classList.contains('remove-presentation')) {
            const index = parseInt(e.target.dataset.index);
            if (formState.presentations.length === 1) {
                showFormAlert('Debe haber al menos una presentación', 'warning');
                return;
            }
            if (confirm('¿Eliminar esta presentación?')) {
                formState.presentations.splice(index, 1);
                renderPresentations();
            }
        }

        // Agregar ponente
        if (e.target.classList.contains('add-speaker-btn')) {
            const presIndex = parseInt(e.target.dataset.presentationIndex);
            formState.presentations[presIndex].speakers.push({
                name: '', country: null, agency: ''
            });
            
            const speakersContainer = container.querySelector(
                `.speakers-list[data-presentation-index="${presIndex}"]`
            );
            const speakerIndex = formState.presentations[presIndex].speakers.length - 1;
            const div = document.createElement('div');
            div.innerHTML = generateSpeakerRowHTML(presIndex, speakerIndex);
            speakersContainer.appendChild(div.firstElementChild);
            
            initSpeakerAutocompletes(presIndex, speakerIndex);
        }

        // Eliminar ponente
        if (e.target.classList.contains('remove-speaker')) {
            const presIndex = parseInt(e.target.dataset.presentationIndex);
            const speakerIndex = parseInt(e.target.dataset.speakerIndex);
            
            if (formState.presentations[presIndex].speakers.length === 1) {
                showFormAlert('Debe haber al menos un ponente por presentación', 'warning');
                return;
            }
            
            formState.presentations[presIndex].speakers.splice(speakerIndex, 1);
            renderPresentations();
        }

        // Agregar idioma
        if (e.target.classList.contains('add-language-btn')) {
            const presIndex = parseInt(e.target.dataset.index);
            const input = container.querySelector(
                `.language-input[data-presentation-index="${presIndex}"]`
            );
            const value = input.value.trim();
            if (value) {
                addLanguageChip(presIndex, value);
                input.value = '';
            }
        }
    });

    // Enter en inputs de idioma
    container.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('language-input')) {
            e.preventDefault();
            const presIndex = parseInt(e.target.dataset.presentationIndex);
            const btn = container.querySelector(
                `.add-language-btn[data-index="${presIndex}"]`
            );
            btn.click();
        }
    });
}

/**
 * ====================================
 * SUBMIT DEL FORMULARIO
 * ====================================
 */

async function handleFormSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submit-form-btn');
    const alertDiv = document.getElementById('form-alert');

    // Recopilar datos del formulario
    const eventData = collectFormData();

    // Validar
    const validation = validateEventData(eventData);
    if (!validation.valid) {
        showFormAlert(validation.error, 'error');
        return;
    }

    // Deshabilitar botón
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

    // Enviar al backend
    const result = await EventsAPI.createComplete(eventData);

    if (result.success) {
        showFormAlert('✅ Evento creado exitosamente', 'success');
        
        // Recargar datos del mapa después de 2 segundos
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    } else {
        showFormAlert('❌ Error: ' + result.error, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Guardar Evento';
    }
}

function collectFormData() {
    return {
        // Datos del evento
        country: formState.country?.name || document.getElementById('event-country').value,
        city: formState.city?.name || document.getElementById('event-city').value,
        country_lat: formState.country?.lat || 0,
        country_lon: formState.country?.lon || 0,
        city_lat: formState.city?.lat || 0,
        city_lon: formState.city?.lon || 0,
        date: document.getElementById('event-date').value.trim(),
        year: parseInt(document.getElementById('event-year').value),
        type: document.getElementById('event-type').value.trim(),
        event_title: document.getElementById('event-title').value.trim(),
        agencies: formState.agencies,

        // Presentaciones
        presentations: formState.presentations.map((pres, index) => {
            const titleInput = document.querySelector(
                `.presentation-title[data-presentation-index="${index}"]`
            );
            const urlInput = document.querySelector(
                `.presentation-url[data-presentation-index="${index}"]`
            );
            const obsInput = document.querySelector(
                `.presentation-observations[data-presentation-index="${index}"]`
            );

            return {
                title: titleInput.value.trim(),
                language: pres.languages,
                url: urlInput.value.trim(),
                observations: obsInput.value.trim(),
                speakers: pres.speakers.map((speaker, sIndex) => {
                    const nameInput = document.querySelector(
                        `.speaker-name[data-presentation-index="${index}"][data-speaker-index="${sIndex}"]`
                    );
                    const countryInput = document.querySelector(
                        `.speaker-country[data-presentation-index="${index}"][data-speaker-index="${sIndex}"]`
                    );
                    const agencyInput = document.querySelector(
                        `.speaker-agency[data-presentation-index="${index}"][data-speaker-index="${sIndex}"]`
                    );

                    return {
                        name: nameInput.value.trim(),
                        country: countryInput.value.trim(),
                        agency: agencyInput.value.trim()
                    };
                })
            };
        })
    };
}

function validateEventData(data) {
    // Validaciones básicas
    if (!data.country) {
        return { valid: false, error: 'El país es obligatorio' };
    }
    if (!data.city) {
        return { valid: false, error: 'La ciudad es obligatoria' };
    }
    if (!data.year || data.year < 2000) {
        return { valid: false, error: 'El año es obligatorio y debe ser válido' };
    }
    if (!data.event_title) {
        return { valid: false, error: 'El título del evento es obligatorio' };
    }

    // Validar coordenadas
    if (!data.country_lat || !data.country_lon) {
        return { valid: false, error: 'Faltan coordenadas del país' };
    }
    if (!data.city_lat || !data.city_lon) {
        return { valid: false, error: 'Faltan coordenadas de la ciudad' };
    }

    // Validar presentaciones
    if (!data.presentations || data.presentations.length === 0) {
        return { valid: false, error: 'Debe haber al menos una presentación' };
    }

    for (let i = 0; i < data.presentations.length; i++) {
        const pres = data.presentations[i];
        
        if (!pres.title) {
            return { valid: false, error: `La presentación #${i + 1} necesita un título` };
        }

        if (!pres.speakers || pres.speakers.length === 0) {
            return { valid: false, error: `La presentación #${i + 1} necesita al menos un ponente` };
        }

        for (let j = 0; j < pres.speakers.length; j++) {
            const speaker = pres.speakers[j];
            
            if (!speaker.name) {
                return { 
                    valid: false, 
                    error: `Ponente #${j + 1} de presentación #${i + 1} necesita un nombre` 
                };
            }
            if (!speaker.country) {
                return { 
                    valid: false, 
                    error: `Ponente #${j + 1} de presentación #${i + 1} necesita un país` 
                };
            }
        }
    }

    return { valid: true };
}

/**
 * ====================================
 * UTILIDADES
 * ====================================
 */

function showFormAlert(message, type = 'info') {
    const alertDiv = document.getElementById('form-alert');
    alertDiv.className = `alert-inline ${type}`;
    alertDiv.textContent = message;
    alertDiv.style.display = 'block';

    // Auto-ocultar después de 10 segundos (excepto éxito)
    if (type !== 'success') {
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, 10000);
    }
}
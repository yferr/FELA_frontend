/**
 * Forms Module - Generación y manejo de formularios de edición
 * REFACTORIZADO: Funciones globales reutilizables, sin código duplicado
 */

import { EventsAPI, PresentationsAPI, SpeakersAPI, CountriesAPI, CitiesAPI } from './api.js';
import { Autocomplete } from './autocomplete.js';
import { canEdit } from './auth.js';

const MAX_PRESENTATIONS = 10;

// Estado del formulario global
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
 * FUNCIONES GLOBALES REUTILIZABLES
 * ====================================
 */

/**
 * Mostrar alerta en formulario
 */
function showFormAlert(message, type = 'info', containerId = 'form-alert') {
    const alertDiv = document.getElementById(containerId);
    if (!alertDiv) {
        console.warn(`Alert container ${containerId} not found`);
        return;
    }
    
    alertDiv.className = `alert-inline ${type}`;
    alertDiv.textContent = message;
    alertDiv.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, 5000);
    }
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
 * * VALIDACIÓN Y CREACIÓN LAZY DE PAÍSES
 * Valida y completa countryData para un speaker
 * Si el país no tiene coordenadas, lo busca/crea automáticamente
 */
async function ensureCountryDataComplete(speakerData, speakerIndex, formStateRef) {
    console.log(`🔍 [LAZY-VALIDATE] Validando país para speaker #${speakerIndex + 1}:`, speakerData);

    // Si ya tiene countryData completo, no hacer nada
    if (speakerData.countryData && speakerData.countryData.lat && speakerData.countryData.lon) {
        console.log(`✅ [LAZY-VALIDATE] País ya tiene coordenadas completas`);
        return { success: true, data: speakerData.countryData };
    }

    // Si no tiene countryData, intentar obtenerlo
    const countryName = speakerData.country;
    
    if (!countryName || countryName.trim() === '') {
        return { 
            success: false, 
            error: `El speaker "${speakerData.name}" no tiene país especificado` 
        };
    }

    console.log(`🔍 [LAZY-VALIDATE] Buscando país "${countryName}" en BD...`);

    // 1. Buscar en BD local
    try {
        const searchResult = await CountriesAPI.list(countryName);
        
        if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
            const foundCountry = searchResult.data.results[0];
            
            console.log(`✅ [LAZY-VALIDATE] País encontrado en BD:`, foundCountry);
            
            // Actualizar countryData en formState
            const countryData = {
                name: foundCountry.country,
                lat: foundCountry.lat,
                lon: foundCountry.lon,
                isNew: false,
                createdNow: false
            };

            if (formStateRef && formStateRef.speakers && formStateRef.speakers[speakerIndex]) {
                formStateRef.speakers[speakerIndex].countryData = countryData;
            }

            speakerData.countryData = countryData;

            return { success: true, data: countryData };
        }

        // 2. Si no existe en BD, buscar en Nominatim
        console.log(`🌍 [LAZY-VALIDATE] País no encontrado en BD, buscando en Nominatim...`);

        const nominatimResponse = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                country: countryName,
                format: 'json',
                addressdetails: 1,
                limit: 5
            },
            headers: {
                'Accept-Language': 'es,en'
            },
            timeout: 5000
        });

        if (!nominatimResponse.data || nominatimResponse.data.length === 0) {
            return {
                success: false,
                error: `No se encontraron coordenadas para el país "${countryName}". Por favor, selecciónalo del menú desplegable.`
            };
        }

        // Tomar primer resultado
        const nominatimResult = nominatimResponse.data[0];
        const coordinates = {
            lat: parseFloat(nominatimResult.lat),
            lon: parseFloat(nominatimResult.lon)
        };

        console.log(`🌍 [LAZY-VALIDATE] Coordenadas encontradas en Nominatim:`, coordinates);

        // 3. Crear país en BD
        console.log(`🆕 [LAZY-VALIDATE] Creando país en BD...`);

        const createResult = await CountriesAPI.create({
            country: countryName,
            lat: coordinates.lat,
            lon: coordinates.lon
        });

        if (!createResult.success) {
            // Puede ser que ya exista (race condition)
            console.warn(`⚠️ [LAZY-VALIDATE] Error al crear (puede ya existir):`, createResult.error);
            
            // Reintentar búsqueda
            const retrySearch = await CountriesAPI.list(countryName);
            if (retrySearch.success && retrySearch.data.results && retrySearch.data.results.length > 0) {
                const existingCountry = retrySearch.data.results[0];
                
                const countryData = {
                    name: existingCountry.country,
                    lat: existingCountry.lat,
                    lon: existingCountry.lon,
                    isNew: false,
                    createdNow: false
                };

                if (formStateRef && formStateRef.speakers && formStateRef.speakers[speakerIndex]) {
                    formStateRef.speakers[speakerIndex].countryData = countryData;
                }

                speakerData.countryData = countryData;

                return { success: true, data: countryData };
            }

            return {
                success: false,
                error: `No se pudo crear el país "${countryName}": ${createResult.error}`
            };
        }

        console.log(`✅ [LAZY-VALIDATE] País creado exitosamente en BD`);

        const countryData = {
            name: countryName,
            lat: coordinates.lat,
            lon: coordinates.lon,
            isNew: true,
            createdNow: true
        };

        if (formStateRef && formStateRef.speakers && formStateRef.speakers[speakerIndex]) {
            formStateRef.speakers[speakerIndex].countryData = countryData;
        }

        speakerData.countryData = countryData;

        return { success: true, data: countryData };

    } catch (error) {
        console.error(`❌ [LAZY-VALIDATE] Error inesperado:`, error);
        return {
            success: false,
            error: `Error al validar país "${countryName}": ${error.message}`
        };
    }
}

/**
 * ====================================
 * HANDLERS GLOBALES DE AUTOCOMPLETE
 * ====================================
 */

/**
 * Handler global: Selección de speaker existente
 */
function handleGlobalSpeakerSelect(speakerData, type, presentationIndex, speakerIndex) {
    console.log('🔵 [GLOBAL] Speaker seleccionado:', {
        speaker: speakerData,
        type,
        presIndex: presentationIndex,
        speakerIndex
    });

    // Actualizar formState
    if (!formState.presentations[presentationIndex]) {
        formState.presentations[presentationIndex] = { speakers: [] };
    }
    if (!formState.presentations[presentationIndex].speakers[speakerIndex]) {
        formState.presentations[presentationIndex].speakers[speakerIndex] = {};
    }

    formState.presentations[presentationIndex].speakers[speakerIndex] = {
        id: speakerData.id,
        name: speakerData.name,
        country: speakerData.country_s?.country || speakerData.country_s,
        countryData: speakerData.country_s,
        agency: speakerData.agency_s || ''
    };

    // Actualizar DOM
    const speakerRow = document.querySelector(
        `.speaker-row[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );

    if (speakerRow) {
        const hiddenIdInput = speakerRow.querySelector('.speaker-id');
        const nameInput = speakerRow.querySelector('.speaker-name');
        const countryInput = speakerRow.querySelector('.speaker-country');
        const agencyInput = speakerRow.querySelector('.speaker-agency');

        if (hiddenIdInput) hiddenIdInput.value = speakerData.id;
        if (nameInput) nameInput.value = speakerData.name;

        if (countryInput) {
            const countryName = speakerData.country_s?.country || speakerData.country_s;
            countryInput.value = countryName;
            countryInput.disabled = true;
            countryInput.style.backgroundColor = '#f0f0f0';
            countryInput.title = 'Campo bloqueado - Speaker existente en BD';
        }

        if (agencyInput) {
            agencyInput.value = speakerData.agency_s || '';
            agencyInput.disabled = true;
            agencyInput.style.backgroundColor = '#f0f0f0';
            agencyInput.title = 'Campo bloqueado - Speaker existente en BD';
        }

        // Mostrar indicador visual
        let statusIndicator = speakerRow.querySelector('.speaker-status-indicator');
        if (!statusIndicator) {
            statusIndicator = document.createElement('small');
            statusIndicator.className = 'speaker-status-indicator';
            statusIndicator.style.cssText = 'display: block; color: #28a745; font-size: 0.8rem; margin-top: 4px;';
            statusIndicator.textContent = '✓ Ponente existente en BD';
            if (nameInput && nameInput.parentNode) {
                nameInput.parentNode.appendChild(statusIndicator);
            }
        }
    }

    console.log('✅ [GLOBAL] Speaker actualizado en formState y DOM');
}

/**
 * Handler global: Selección de país para speaker
 * ✅ CON PUNTOS DE VERIFICACIÓN PARA DEBUGGING
 */
async function handleGlobalSpeakerCountrySelect(data, type, presentationIndex, speakerIndex) {
    console.log('🌍 [GLOBAL] País seleccionado para speaker:', {
        data,
        type,
        presIndex: presentationIndex,
        speakerIndex
    });

    // 🔍 PUNTO DE VERIFICACIÓN 1: Datos recibidos
    console.log('📍 [VERIFICACIÓN 1] Coordenadas recibidas:', {
        lat: data.lat,
        lon: data.lon,
        nombre: data.name || data.country
    });

    const speakerRow = document.querySelector(
        `.speaker-row[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );

    if (!speakerRow) {
        console.error('❌ No se encontró speaker row para índices:', { presentationIndex, speakerIndex });
        return;
    }

    const countryInput = speakerRow.querySelector('.speaker-country');
    if (!countryInput) {
        console.error('❌ No se encontró input de país');
        return;
    }

    // Crear indicador de estado
    let statusIndicator = countryInput.parentNode.querySelector('.country-status-indicator');
    if (!statusIndicator) {
        statusIndicator = document.createElement('small');
        statusIndicator.className = 'country-status-indicator';
        statusIndicator.style.cssText = 'display: block; margin-top: 4px; font-size: 0.8rem;';
        countryInput.parentNode.appendChild(statusIndicator);
    }

    if (type === 'nominatim') {
        // País de Nominatim - necesita crearse en BD
        console.log('🆕 [NOMINATIM] País nuevo desde Nominatim, creando en BD...');

        // 🔍 PUNTO DE VERIFICACIÓN 2: Antes de crear
        console.log('📍 [VERIFICACIÓN 2] Intentando crear país con coordenadas:', {
            nombre: data.name,
            lat: parseFloat(data.lat),
            lon: parseFloat(data.lon)
        });

        statusIndicator.style.color = '#ffc107';
        statusIndicator.innerHTML = '⏳ Creando país en base de datos...';
        countryInput.disabled = true;

        try {
            const createResult = await CountriesAPI.create({
                country: data.name,
                lat: parseFloat(data.lat),
                lon: parseFloat(data.lon)
            });

            // 🔍 PUNTO DE VERIFICACIÓN 3: Después de crear
            console.log('📍 [VERIFICACIÓN 3] Resultado de creación:', createResult);

            if (createResult.success) {
                console.log('✅ País creado exitosamente:', createResult.data);

                // Actualizar formState
                if (!formState.presentations[presentationIndex]) {
                    formState.presentations[presentationIndex] = { speakers: [] };
                }
                if (!formState.presentations[presentationIndex].speakers[speakerIndex]) {
                    formState.presentations[presentationIndex].speakers[speakerIndex] = {};
                }

                formState.presentations[presentationIndex].speakers[speakerIndex].country = data.name;
                formState.presentations[presentationIndex].speakers[speakerIndex].countryData = {
                    name: data.name,
                    lat: parseFloat(data.lat),
                    lon: parseFloat(data.lon),
                    isNew: true,
                    createdNow: true
                };

                // 🔍 PUNTO DE VERIFICACIÓN 4: FormState actualizado
                console.log('📍 [VERIFICACIÓN 4] FormState actualizado:', 
                    formState.presentations[presentationIndex].speakers[speakerIndex]
                );

                // Actualizar UI
                countryInput.value = data.name;
                statusIndicator.style.color = '#28a745';
                statusIndicator.innerHTML = `✅ País creado: ${data.name} (${data.lat}, ${data.lon})`;
                countryInput.disabled = true;
                countryInput.style.backgroundColor = '#e7f5e7';
                countryInput.title = `País creado desde Nominatim - Coordenadas: ${data.lat}, ${data.lon}`;

            } else {
                console.warn('⚠️ Error al crear país:', createResult.error);

                // Verificar si ya existe
                if (createResult.error.includes('unique') || createResult.error.includes('already exists')) {
                    console.log('ℹ️ País ya existe, buscando en BD...');

                    const searchResult = await CountriesAPI.list(data.name);
                    
                    // 🔍 PUNTO DE VERIFICACIÓN 5: Búsqueda de país existente
                    console.log('📍 [VERIFICACIÓN 5] Búsqueda de país existente:', searchResult);

                    if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
                        const existingCountry = searchResult.data.results[0];

                        formState.presentations[presentationIndex].speakers[speakerIndex].country = existingCountry.country;
                        formState.presentations[presentationIndex].speakers[speakerIndex].countryData = {
                            name: existingCountry.country,
                            lat: existingCountry.lat,
                            lon: existingCountry.lon,
                            isNew: false,
                            createdNow: false
                        };

                        countryInput.value = existingCountry.country;
                        statusIndicator.style.color = '#17a2b8';
                        statusIndicator.innerHTML = `ℹ️ País existente: ${existingCountry.country}`;
                        countryInput.disabled = true;
                        countryInput.style.backgroundColor = '#e7f5f5';
                    } else {
                        throw new Error('No se pudo verificar el país');
                    }
                } else {
                    throw new Error(createResult.error);
                }
            }
            // ACTUALIZAR INDICADOR VISUAL
            const statusIndicatorNominatim = document.querySelector(
                `.country-validation-status[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
            );
            if (statusIndicatorNominatim) {
                statusIndicatorNominatim.style.color = '#28a745';
                statusIndicatorNominatim.textContent = '✅ País validado';
            }

        } catch (error) {
            console.error('❌ Error inesperado al procesar país:', error);

            statusIndicator.style.color = '#dc3545';
            statusIndicator.innerHTML = `❌ Error: ${error.message}`;
            countryInput.disabled = false;
            countryInput.style.backgroundColor = '#ffe7e7';

            formState.presentations[presentationIndex].speakers[speakerIndex].country = null;
            formState.presentations[presentationIndex].speakers[speakerIndex].countryData = null;
        }

    } else if (type === 'local') {
        // País de BD local
        console.log('✅ [LOCAL] País existente en BD:', data);

        // 🔍 PUNTO DE VERIFICACIÓN 6: País local
        console.log('📍 [VERIFICACIÓN 6] País local con coordenadas:', {
            nombre: data.country,
            lat: data.lat,
            lon: data.lon
        });

        if (!formState.presentations[presentationIndex]) {
            formState.presentations[presentationIndex] = { speakers: [] };
        }
        if (!formState.presentations[presentationIndex].speakers[speakerIndex]) {
            formState.presentations[presentationIndex].speakers[speakerIndex] = {};
        }

        formState.presentations[presentationIndex].speakers[speakerIndex].country = data.country;
        formState.presentations[presentationIndex].speakers[speakerIndex].countryData = {
            name: data.country,
            lat: data.lat,
            lon: data.lon,
            isNew: false,
            createdNow: false
        };

        countryInput.value = data.country;
        statusIndicator.style.color = '#28a745';
        statusIndicator.innerHTML = `✅ País: ${data.country} (${data.lat}, ${data.lon})`;
        countryInput.disabled = true;
        countryInput.style.backgroundColor = '#f0f0f0';
        countryInput.title = `País existente - Coordenadas: ${data.lat}, ${data.lon}`;

        // ACTUALIZAR INDICADOR VISUAL
        const statusIndicatorNominatim = document.querySelector(
            `.country-validation-status[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
        );
        if (statusIndicatorNominatim) {
            statusIndicatorNominatim.style.color = '#28a745';
            statusIndicatorNominatim.textContent = '✅ País validado';
        }
    }

    // 🔍 PUNTO DE VERIFICACIÓN 7: Estado final
    console.log('📍 [VERIFICACIÓN 7] Estado final del formState:', {
        presentationIndex,
        speakerIndex,
        speaker: formState.presentations[presentationIndex]?.speakers[speakerIndex]
    });
}

/**
 * Handler global: Selección de país para evento
 */
function handleGlobalCountrySelect(data, type) {
    console.log('🌍 [GLOBAL] País seleccionado para evento:', { data, type });

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
    initCityAutocomplete();
}

/**
 * Handler global: Selección de ciudad
 */
function handleGlobalCitySelect(data, type) {
    console.log('🏙️ [GLOBAL] Ciudad seleccionada:', { data, type });

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

/**
 * Helper 1: Crear autocomplete de speaker con configuración estándar
 * @param {HTMLElement} inputElement - Input donde se aplicará el autocomplete
 * @param {Function} onSelectCallback - Callback cuando se selecciona un speaker
 * @returns {Autocomplete} Instancia del autocomplete creado
 */
function createSpeakerNameAutocomplete(inputElement, onSelectCallback) {
    const ac = new Autocomplete(inputElement, {
        type: 'speaker',
        searchLocal: true,
        allowCreate: false,
        onSelect: onSelectCallback
    });
    
    console.log('🔧 [HELPER] Autocomplete de speaker creado para:', inputElement.id || inputElement.className);
    return ac;
}

/**
 * Helper 2: Llenar campos de speaker desde datos de BD
 * @param {Object} fields - Referencias a los inputs { nameInput, countryInput, agencyInput }
 * @param {Object} speakerData - Datos del speaker desde BD
 * @param {Object} options - Opciones { lockFields, showIndicator, indicatorContainer }
 */
function applySpeakerFieldsFromData(fields, speakerData, options = {}) {
    const {
        lockFields = true,
        showIndicator = true,
        indicatorContainer = null
    } = options;

    console.log('📝 [HELPER] Llenando campos de speaker:', speakerData);

    const { nameInput, countryInput, agencyInput } = fields;

    // Llenar campo de nombre
    if (nameInput) {
        nameInput.value = speakerData.name;
        
        if (lockFields) {
            nameInput.disabled = true;
            nameInput.style.backgroundColor = '#f0f0f0';
            nameInput.title = 'Campo bloqueado - Speaker existente en BD';
        }
    }

    // Llenar campo de país
    if (countryInput) {
        const countryName = speakerData.country_s?.country || speakerData.country_s;
        countryInput.value = countryName;
        
        if (lockFields) {
            countryInput.disabled = true;
            countryInput.style.backgroundColor = '#e7f5e7';
            countryInput.title = 'Campo bloqueado - Speaker existente en BD';
        }

        // Actualizar indicador de validación si existe
        const countryIndicator = countryInput.parentNode.querySelector('.country-validation-status');
        if (countryIndicator) {
            countryIndicator.style.color = '#28a745';
            countryIndicator.textContent = '✅ País validado (BD)';
        }
    }

    // Llenar campo de agencia
    if (agencyInput) {
        agencyInput.value = speakerData.agency_s || '';
        
        if (lockFields) {
            agencyInput.disabled = true;
            agencyInput.style.backgroundColor = '#f0f0f0';
            agencyInput.title = 'Campo bloqueado - Speaker existente en BD';
        }
    }

    // Mostrar indicador de speaker existente
    if (showIndicator) {
        const container = indicatorContainer || nameInput?.parentNode;
        
        if (container) {
            // Eliminar indicador anterior si existe
            const existingIndicator = container.querySelector('.speaker-status-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }

            // Crear nuevo indicador
            const indicator = document.createElement('small');
            indicator.className = 'speaker-status-indicator';
            indicator.style.cssText = 'display: block; color: #28a745; font-size: 0.85rem; margin-top: 4px; font-weight: 500;';
            indicator.innerHTML = '✓ Ponente existente en BD';
            container.appendChild(indicator);
        }
    }

    console.log('✅ [HELPER] Campos llenados exitosamente');
}

/**
 * Helper 3: Validar y actualizar indicador visual de país
 * @param {HTMLElement} countryInput - Input del país
 * @param {Object} countryData - Datos del país { name, lat, lon }
 * @param {string} status - Estado: 'validating', 'validated', 'error', 'notfound'
 * @param {string} customMessage - Mensaje personalizado (opcional)
 */
function updateCountryValidationIndicator(countryInput, status, customMessage = null) {
    if (!countryInput) return;

    const indicator = countryInput.parentNode.querySelector('.country-validation-status');
    if (!indicator) return;

    const statusConfig = {
        validating: { color: '#ffc107', icon: '⏳', text: 'Validando...' },
        validated: { color: '#28a745', icon: '✅', text: 'País validado' },
        error: { color: '#dc3545', icon: '⚠️', text: 'Error al validar' },
        notfound: { color: '#dc3545', icon: '⚠️', text: 'No encontrado - selecciona del menú' },
        typing: { color: '#6c757d', icon: '⌨️', text: 'Escribiendo...' },
        unvalidated: { color: '#6c757d', icon: '❓', text: 'Sin validar' }
    };

    const config = statusConfig[status] || statusConfig.unvalidated;

    indicator.style.color = config.color;
    indicator.textContent = customMessage || `${config.icon} ${config.text}`;

    // Actualizar color de fondo del input
    const bgColors = {
        validated: '#e7f5e7',
        notfound: '#fff3cd',
        error: '#ffe7e7',
        typing: '',
        validating: '',
        unvalidated: ''
    };

    countryInput.style.backgroundColor = bgColors[status] || '';
}


/**
 * Handler global: Selección de agencia
 */
function handleGlobalAgencySelect(data, type) {
    const agencyName = data.nombre || data.name;
    addAgencyChip(agencyName);
    document.getElementById('event-agency-input').value = '';
}

/**
 * ====================================
 * INICIALIZACIÓN DEL FORMULARIO PRINCIPAL
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

    resetFormState();
    container.innerHTML = generateFormHTML();
    initAutocompletes();
    attachEventListeners();
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

function generatePresentationHTML(index) {
    return `
        <div class="presentation-card" data-presentation-index="${index}">
            <div class="presentation-header">
                <span class="presentation-number">Presentación #${index + 1}</span>
                <!--<button type="button" class="remove-presentation" data-index="${index}">
                    🗑️ Eliminar
                </button>-->
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

function generateSpeakerRowHTML(presentationIndex, speakerIndex) {
    return `
        <div class="speaker-row" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}">
            <input type="hidden" class="speaker-id" data-presentation-index="${presentationIndex}" data-speaker-index="${speakerIndex}" value="">
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
                <!-- Indicador de validación 
                <small class="country-validation-status" 
                       data-presentation-index="${presentationIndex}" 
                       data-speaker-index="${speakerIndex}" 
                       style="display: block; margin-top: 4px; font-size: 0.8rem; color: #6c757d;">
                    ❓ Sin validar
                </small>-->
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
    // País del evento
    const countryAutocomplete = new Autocomplete(document.getElementById('event-country'), {
        type: 'country',
        searchLocal: true,
        searchNominatim: true,
        allowCreate: true,
        onSelect: handleGlobalCountrySelect
    });
    autocompleteInstances.push(countryAutocomplete);

    // Agencia
    const agencyAutocomplete = new Autocomplete(document.getElementById('event-agency-input'), {
        type: 'agency',
        searchLocal: true,
        allowCreate: true,
        onSelect: handleGlobalAgencySelect,
        onCreate: (agencyName) => {
            addAgencyChip(agencyName);
            document.getElementById('event-agency-input').value = '';
        }
    });
    autocompleteInstances.push(agencyAutocomplete);

    // Renderizar primera presentación
    renderPresentations();
}

function initCityAutocomplete() {
    const cityInput = document.getElementById('event-city');
    
    // Destruir instancia anterior
    const existingIndex = autocompleteInstances.findIndex(ac => ac.input.id === 'event-city');
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
        onSelect: handleGlobalCitySelect
    });
    autocompleteInstances.push(cityAutocomplete);

    cityInput.disabled = false;
}

/**
 * Inicializar autocompletados de un ponente
 * REFACTORIZADO: Usa handlers globales
 */
function initSpeakerAutocompletes(presentationIndex, speakerIndex) {
    console.log('🔧 Inicializando autocompletados para speaker P' + presentationIndex + '-S' + speakerIndex);

    // Nombre del speaker
    const nameInput = document.querySelector(
        `.speaker-name[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    
    if (nameInput && !nameInput.dataset.autocompleteInit) {
        const nameAC = new Autocomplete(nameInput, {
            type: 'speaker',
            searchLocal: true,
            allowCreate: false,
            onSelect: (data, type) => handleGlobalSpeakerSelect(data, type, presentationIndex, speakerIndex)
        });
        autocompleteInstances.push(nameAC);
        nameInput.dataset.autocompleteInit = 'true';

        // Limpiar campos cuando se escribe manualmente
        nameInput.addEventListener('input', (e) => {
            const speakerRow = e.target.closest('.speaker-row');
            if (speakerRow) {
                const hiddenId = speakerRow.querySelector('.speaker-id');
                const countryInput = speakerRow.querySelector('.speaker-country');
                const agencyInput = speakerRow.querySelector('.speaker-agency');
                const statusIndicator = speakerRow.querySelector('.speaker-status-indicator');
                
                if (hiddenId && hiddenId.value) {
                    hiddenId.value = '';
                    
                    if (countryInput) {
                        countryInput.disabled = false;
                        countryInput.style.backgroundColor = '';
                    }
                    if (agencyInput) {
                        agencyInput.disabled = false;
                        agencyInput.style.backgroundColor = '';
                    }
                    if (statusIndicator) {
                        statusIndicator.style.display = 'none';
                    }
                }
            }
        });
    }

    // País del speaker
    const countryInput = document.querySelector(
        `.speaker-country[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    
    if (countryInput && !countryInput.dataset.autocompleteInit) {
        const countryAC = new Autocomplete(countryInput, {
            type: 'country',
            searchLocal: true,
            searchNominatim: true,
            allowCreate: false,
            onSelect: (data, type) => {
                console.log('🔵 [AC] onSelect disparado para país:', { data, type, presentationIndex, speakerIndex });
                handleGlobalSpeakerCountrySelect(data, type, presentationIndex, speakerIndex);
            }
        });
        autocompleteInstances.push(countryAC);
        countryInput.dataset.autocompleteInit = 'true';

        // ✅ NUEVO: Event listener para validación en tiempo real (blur)
        countryInput.addEventListener('blur', async (e) => {
            const countryValue = e.target.value.trim();
            const statusIndicator = document.querySelector(
                `.country-validation-status[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
            );
            
            if (!statusIndicator) return;
            
            if (!countryValue) {
                statusIndicator.style.color = '#6c757d';
                statusIndicator.textContent = '❓ Sin validar';
                return;
            }

            // Verificar si ya tiene countryData
            if (formState.presentations[presentationIndex]?.speakers[speakerIndex]?.countryData) {
                statusIndicator.style.color = '#28a745';
                statusIndicator.textContent = '✅ País validado';
                e.target.style.backgroundColor = '#e7f5e7';
                return;
            }

            // Intentar validar automáticamente
            statusIndicator.style.color = '#ffc107';
            statusIndicator.textContent = '⏳ Validando...';

            try {
                const searchResult = await CountriesAPI.list(countryValue);
                
                if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
                    const foundCountry = searchResult.data.results[0];
                    
                    // Actualizar formState
                    if (!formState.presentations[presentationIndex]) {
                        formState.presentations[presentationIndex] = { speakers: [] };
                    }
                    if (!formState.presentations[presentationIndex].speakers[speakerIndex]) {
                        formState.presentations[presentationIndex].speakers[speakerIndex] = {};
                    }
                    
                    formState.presentations[presentationIndex].speakers[speakerIndex].country = foundCountry.country;
                    formState.presentations[presentationIndex].speakers[speakerIndex].countryData = {
                        name: foundCountry.country,
                        lat: foundCountry.lat,
                        lon: foundCountry.lon,
                        isNew: false,
                        createdNow: false
                    };

                    e.target.value = foundCountry.country;
                    statusIndicator.style.color = '#28a745';
                    statusIndicator.textContent = '✅ País validado';
                    e.target.style.backgroundColor = '#e7f5e7';
                    
                    console.log(`✅ [AUTO-VALIDATE] País auto-validado P${presentationIndex}-S${speakerIndex}`);
                } else {
                    statusIndicator.style.color = '#dc3545';
                    statusIndicator.textContent = '⚠️ No encontrado - selecciona del menú';
                    e.target.style.backgroundColor = '#fff3cd';
                }
            } catch (error) {
                console.error('Error en validación automática:', error);
                statusIndicator.style.color = '#dc3545';
                statusIndicator.textContent = '⚠️ Error al validar';
            }
        });

        // Event listener para cuando el usuario escribe
        countryInput.addEventListener('input', (e) => {
            const statusIndicator = document.querySelector(
                `.country-validation-status[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
            );
            if (statusIndicator && e.target.value.trim()) {
                statusIndicator.style.color = '#6c757d';
                statusIndicator.textContent = '⌨️ Escribiendo...';
                e.target.style.backgroundColor = '';
            }
        });

        // Limpiar estado al borrar valor
        countryInput.addEventListener('input', (e) => {
            if (!e.target.value.trim()) {
                if (formState.presentations[presentationIndex] && 
                    formState.presentations[presentationIndex].speakers[speakerIndex]) {
                    formState.presentations[presentationIndex].speakers[speakerIndex].country = null;
                    formState.presentations[presentationIndex].speakers[speakerIndex].countryData = null;
                }
                e.target.disabled = false;
                e.target.style.backgroundColor = '';
                
                const statusIndicator = e.target.parentNode.querySelector('.country-status-indicator');
                if (statusIndicator) {
                    statusIndicator.remove();
                }
            }
        });
    }

    // Agencia del speaker
    const agencyInput = document.querySelector(
        `.speaker-agency[data-presentation-index="${presentationIndex}"][data-speaker-index="${speakerIndex}"]`
    );
    
    if (agencyInput && !agencyInput.dataset.autocompleteInit) {
        const agencyAC = new Autocomplete(agencyInput, {
            type: 'agency',
            searchLocal: true,
            allowCreate: true
        });
        autocompleteInstances.push(agencyAC);
        agencyInput.dataset.autocompleteInit = 'true';
    }
}

/**
*====================================
*RENDERIZADO Y MANIPULACIÓN DEL DOM
*====================================
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
        return;
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
        return;
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
*====================================
*EVENT LISTENERS
*====================================
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
*====================================
*RECOPILACIÓN Y VALIDACIÓN DE DATOS
*====================================
*/

/**
*✅ REFACTORIZADO: Lee desde formState en lugar del DOM
*/
function collectFormData() {
    console.log('📋 [COLLECT] Recopilando datos del formulario...');
    console.log('📋 [COLLECT] FormState actual:', JSON.parse(JSON.stringify(formState)));
    // Datos del evento desde inputs (estos no están en formState)
    const eventData = {
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
        agencies: formState.agencies
    };
    // Presentaciones desde formState + inputs
    eventData.presentations = formState.presentations.map((pres, presIndex) => {
        const titleInput = document.querySelector(
            `.presentation-title[data-presentation-index="${presIndex}"]`
        );
        const urlInput = document.querySelector(
            `.presentation-url[data-presentation-index="${presIndex}"]`
        );
        const obsInput = document.querySelector(
            `.presentation-observations[data-presentation-index="${presIndex}"]`
        );

        // ✅ SPEAKERS: Usar formState como fuente primaria
        const speakers = pres.speakers.map((speaker, sIndex) => {
            console.log(`📋 [COLLECT] Speaker P${presIndex}-S${sIndex}:`, speaker);
            // Validar que tengamos datos completos
            if (!speaker.name || !speaker.country) {
                // Si no hay datos en formState, intentar leer del DOM como fallback
                const nameInput = document.querySelector(
                    `.speaker-name[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`
                );
                const countryInput = document.querySelector(
                    `.speaker-country[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`
                );
                const agencyInput = document.querySelector(
                    `.speaker-agency[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`
                );
                const hiddenId = document.querySelector(
                    `.speaker-id[data-presentation-index="${presIndex}"][data-speaker-index="${sIndex}"]`
                );
                console.log(`⚠️ [COLLECT] FormState incompleto para P${presIndex}-S${sIndex}, leyendo del DOM`);
                return {
                    id: hiddenId?.value?.trim() || null,
                    name: nameInput?.value?.trim() || '',
                    country: countryInput?.value?.trim() || '',
                    agency: agencyInput?.value?.trim() || ''
                };
            }
            // Usar datos de formState
            return {
                id: speaker.id || null,
                name: speaker.name,
                country: speaker.country,
                agency: speaker.agency || ''
            };
        }).filter(s => s.name && s.country); // Filtrar speakers incompletos
        return {
            title: titleInput?.value?.trim() || '',
            language: pres.languages || [],
            url: urlInput?.value?.trim() || '',
            observations: obsInput?.value?.trim() || '',
            speakers: speakers
        };
    });

    console.log('📋 [COLLECT] Datos recopilados:', eventData);
    return eventData;
}

function validateEventData(data) {
    console.log('✅ [VALIDATE] Validando datos del evento...');
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

            console.log(`✅ [VALIDATE] Validando speaker P${i + 1}-S${j + 1}:`, speaker);

            if (!speaker.name) {
                return { 
                    valid: false, 
                    error: `El speaker #${j + 1} de la presentación #${i + 1} debe tener nombre` 
                };
            }
            if (!speaker.country) {
                return { 
                    valid: false, 
                    error: `El speaker #${j + 1} de la presentación #${i + 1} debe tener país` 
                };
            }
        }
    }

    console.log('✅ [VALIDATE] Validación completada exitosamente');
    return { valid: true };
}

/**
*====================================
*SUBMIT DEL FORMULARIO
*====================================
*/

async function handleFormSubmit(e) {
    e.preventDefault();
    console.log('🚀 [SUBMIT] Iniciando proceso de guardado...');

    const submitBtn = document.getElementById('submit-form-btn');

    // Recopilar datos
    const eventData = collectFormData();

    // Validar
    const validation = validateEventData(eventData);
    if (!validation.valid) {
        console.error('❌ [VALIDATE] Error de validación:', validation.error);
        showFormAlert(validation.error, 'error');
        return;
    }

    // Deshabilitar botón
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

    try {
        // Enviar al backend
        console.log('📡 [SUBMIT] Enviando datos al backend:', eventData);
        const result = await EventsAPI.createComplete(eventData);

        if (result.success) {
            console.log('✅ [SUBMIT] Evento creado exitosamente');
            showFormAlert('✅ Evento creado exitosamente', 'success');

            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            console.error('❌ [SUBMIT] Error del backend:', result.error);
            showFormAlert('❌ Error: ' + result.error, 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Guardar Evento';
        }
    } catch (error) {
        console.error('❌ [SUBMIT] Error inesperado:', error);
        showFormAlert('❌ Error inesperado: ' + error.message, 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '💾 Guardar Evento';
    }
}

/**
*====================================
*FORMULARIOS ADICIONALES
*(Agregar Presentación y Agregar Speaker)
*====================================
*/

export function initAddPresentationForm(container, prefilledEvent = null) {
    // Estado local del formulario
    let selectedEvent = prefilledEvent;
    let localFormState = {
        languages: [],
        speakers: [{ name: '', country: null, countryData: null, agency: '' }]
    };

    let localAutocompleteInstances = [];
    // Generar HTML
    container.innerHTML = `
        <form id="add-presentation-form" class="event-form">
            <button type="button" class="btn btn-outline-secondary" id="back-to-add-options" style="margin-bottom: 20px;">
                ← Volver a opciones
            </button>

            <div class="form-section">
                <h4 class="form-section-title">📅 Seleccionar Evento</h4>

                <div class="form-group">
                    <label for="add-pres-event">Evento *</label>
                    <input 
                        type="text" 
                        id="add-pres-event" 
                        class="form-control autocomplete-input"
                        placeholder="Busca el evento..."
                        ${prefilledEvent ? 'disabled' : ''}
                        required
                    >
                    ${prefilledEvent ? `<input type="hidden" id="add-pres-event-id" value="${prefilledEvent.id}">` : ''}
                    <small class="form-text">
                        ${prefilledEvent ? '✓ Evento prellenado desde el mapa' : 'Escribe para buscar eventos existentes'}
                    </small>
                </div>
            </div>

            <div class="form-section">
                <h4 class="form-section-title">📋 Datos de la Presentación</h4>

                <div class="form-grid">
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label for="add-pres-title">Título de la presentación *</label>
                        <input 
                            type="text" 
                            id="add-pres-title" 
                            class="form-control"
                            placeholder="Título de la charla o ponencia"
                            required
                        >
                    </div>

                    <div class="form-group">
                        <label>Idiomas</label>
                        <div style="display: flex; gap: 10px;">
                            <input 
                                type="text" 
                                id="add-pres-language-input" 
                                class="form-control"
                                placeholder="ej: Español, English"
                            >
                            <button type="button" id="add-pres-language-btn" class="btn btn-outline-secondary">
                                ➕
                            </button>
                        </div>
                        <div id="add-pres-languages-chips" class="chips-container"></div>
                    </div>

                    <div class="form-group">
                        <label>URL del documento</label>
                        <input 
                            type="url" 
                            id="add-pres-url" 
                            class="form-control"
                            placeholder="https://..."
                        >
                    </div>

                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label>Observaciones</label>
                        <textarea 
                            id="add-pres-observations" 
                            class="form-control"
                            rows="2"
                            placeholder="Notas adicionales"
                        ></textarea>
                    </div>
                </div>
            </div>

            <div class="form-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 class="form-section-title" style="margin: 0;">👥 Ponentes</h4>
                    <button type="button" id="add-pres-add-speaker-btn" class="btn btn-outline-secondary">
                        ➕ Agregar Ponente
                    </button>
                </div>
                <div id="add-pres-speakers-list" class="speakers-list">
                    <!-- Speakers dinámicos -->
                </div>
            </div>

            <div class="form-buttons">
                <button type="button" id="add-pres-cancel-btn" class="btn-cancel">
                    ❌ Cancelar
                </button>
                <button type="submit" id="add-pres-submit-btn" class="btn-save">
                    💾 Guardar Presentación
                </button>
            </div>

            <div id="add-pres-alert" class="alert-inline" style="display: none; margin-top: 20px;"></div>
        </form>
    `;

    // Inicializar autocomplete de evento si no viene prellenado
    if (!prefilledEvent) {
        const eventAutocomplete = new Autocomplete(document.getElementById('add-pres-event'), {
            type: 'text',
            minChars: 2,
            searchLocal: false,
            onSelect: (data) => {
                selectedEvent = {
                    id: data.id,
                    title: data.event_title
                };
                document.getElementById('add-pres-event').value = data.event_title;
            }
        });

        // Custom search para eventos
        eventAutocomplete.handleInput = async function(e) {
            const query = e.target.value.trim();
            if (query.length < 2) {
                this.hideResults();
                return;
            }

            this.isLoading = true;
            this.showLoading();

            const result = await EventsAPI.list({ search: query });
            const events = result.success ? (result.data.results || result.data || []) : [];

            this.results = events.map(event => ({
                type: 'local',
                data: event,
                display: `${event.event_title} (${event.year || 'N/A'}) - ${event.country_e || 'N/A'}`
            }));

            this.isLoading = false;
            this.renderResults();
        };

        localAutocompleteInstances.push(eventAutocomplete);
    } else {
        document.getElementById('add-pres-event').value = prefilledEvent.title;
    }

    // Renderizar primer ponente
    renderAddPresentationSpeakers();

    // Event listeners
    attachAddPresentationListeners();

    /**
     * Renderizar speakers
     */
    function renderAddPresentationSpeakers() {
        const container = document.getElementById('add-pres-speakers-list');
        container.innerHTML = '';

        localFormState.speakers.forEach((speaker, index) => {
            const speakerRow = document.createElement('div');
            speakerRow.className = 'speaker-row';
            speakerRow.setAttribute('data-speaker-index', index);
            speakerRow.innerHTML = `
                <div class="form-group">
                    <input type="hidden" class="speaker-id" data-index="${index}" value="${speaker.id || ''}">
                    <input 
                        type="text" 
                        class="form-control speaker-name"
                        data-index="${index}"
                        placeholder="Nombre del ponente *"
                        value="${speaker.name}"
                        required
                    >
                    ${speaker.id ? '<small class="text-success">✓ Ponente existente en BD</small>' : ''}
                </div>
                <div class="form-group">
                    <input 
                        type="text" 
                        class="form-control speaker-country autocomplete-input"
                        data-index="${index}"
                        placeholder="País *"
                        value="${speaker.country || ''}"
                        required
                    >
                    <!-- Indicador de validación 
                    <small class="country-validation-status" data-index="${index}" style="display: block; margin-top: 4px; font-size: 0.8rem; color: #6c757d;">
                        ${speaker.countryData ? '✅ País validado' : '❓ Sin validar'}
                    </small> -->
                </div>
                <div class="form-group">
                    <input 
                        type="text" 
                        class="form-control speaker-agency autocomplete-input"
                        data-index="${index}"
                        placeholder="Organismo"
                        value="${speaker.agency || ''}"
                    >
                </div>
                <button type="button" class="remove-speaker" data-index="${index}">
                    🗑️
                </button>
            `;
            container.appendChild(speakerRow);

            // Inicializar autocompletados
            const nameInput = speakerRow.querySelector('.speaker-name');
            const countryInput = speakerRow.querySelector('.speaker-country');
            const agencyInput = speakerRow.querySelector('.speaker-agency');

            const nameAC = new Autocomplete(nameInput, {
                type: 'speaker',
                searchLocal: true,
                allowCreate: false,
                onSelect: (data, type) => handleLocalSpeakerSelect(data, index)
            });
            localAutocompleteInstances.push(nameAC);

            const countryAC = new Autocomplete(countryInput, {
                type: 'country',
                searchLocal: true,
                searchNominatim: true,
                allowCreate: false,
                onSelect: (data, type) => {
                    console.log('🔵 [ADD-PRES] País seleccionado para speaker ' + index);
                    handleLocalCountrySelect(data, type, index);
                }
            });
            localAutocompleteInstances.push(countryAC);

            // Event listener para validación en tiempo real (blur)
            countryInput.addEventListener('blur', async (e) => {
                const countryValue = e.target.value.trim();
                const statusIndicator = speakerRow.querySelector('.country-validation-status');

                if (!statusIndicator) return;

                if (!countryValue) {
                    statusIndicator.style.color = '#6c757d';
                    statusIndicator.textContent = '❓ Sin validar';
                    return;
                }

                // Verificar si ya tiene countryData del autocomplete
                if (localFormState.speakers[index]?.countryData) {
                    statusIndicator.style.color = '#28a745';
                    statusIndicator.textContent = '✅ País validado';
                    e.target.style.backgroundColor = '#e7f5e7';
                    return;
                }

                // Si no tiene countryData, intentar validar automáticamente
                statusIndicator.style.color = '#ffc107';
                statusIndicator.textContent = '⏳ Validando...';

                try {
                    const searchResult = await CountriesAPI.list(countryValue);

                    if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
                        const foundCountry = searchResult.data.results[0];

                        // Actualizar formState automáticamente
                        if (!localFormState.speakers[index]) {
                            localFormState.speakers[index] = {};
                        }

                        localFormState.speakers[index].country = foundCountry.country;
                        localFormState.speakers[index].countryData = {
                            name: foundCountry.country,
                            lat: foundCountry.lat,
                            lon: foundCountry.lon,
                            isNew: false,
                            createdNow: false
                        };

                        e.target.value = foundCountry.country; // Normalizar nombre
                        statusIndicator.style.color = '#28a745';
                        statusIndicator.textContent = '✅ País validado';
                        e.target.style.backgroundColor = '#e7f5e7';

                        console.log(`✅ [AUTO-VALIDATE] País auto-validado para speaker #${index + 1}:`, foundCountry.country);
                    } else {
                        statusIndicator.style.color = '#dc3545';
                        statusIndicator.textContent = '⚠️ No encontrado - selecciona del menú';
                        e.target.style.backgroundColor = '#fff3cd';
                    }
                } catch (error) {
                    console.error('Error en validación automática:', error);
                    statusIndicator.style.color = '#dc3545';
                    statusIndicator.textContent = '⚠️ Error al validar';
                }
            });

            // Limpiar validación si el usuario empieza a escribir de nuevo
            countryInput.addEventListener('input', (e) => {
                const statusIndicator = speakerRow.querySelector('.country-validation-status');
                if (statusIndicator && e.target.value.trim()) {
                    statusIndicator.style.color = '#6c757d';
                    statusIndicator.textContent = '⌨️ Escribiendo...';
                    e.target.style.backgroundColor = '';
                }
            });

            const agencyAC = new Autocomplete(agencyInput, {
                type: 'agency',
                searchLocal: true,
                allowCreate: true
            });
            localAutocompleteInstances.push(agencyAC);
        });
    }
    
    /**
     * Handler local para selección de speaker en "Agregar Presentación"
     */
    function handleLocalSpeakerSelect(speakerData, index) {
        console.log('✅ [ADD-PRES] Speaker seleccionado:', speakerData);
    
        localFormState.speakers[index] = {
            id: speakerData.id,
            name: speakerData.name,
            country: speakerData.country_s?.country || speakerData.country_s,
            agency: speakerData.agency_s || ''
        };
    
        // Actualizar DOM sin re-renderizar
        const speakerRow = document.querySelector(`.speaker-row[data-speaker-index="${index}"]`);
        if (speakerRow) {
            const hiddenId = speakerRow.querySelector('.speaker-id');
            const nameInput = speakerRow.querySelector('.speaker-name');
            const countryInput = speakerRow.querySelector('.speaker-country');
            const agencyInput = speakerRow.querySelector('.speaker-agency');
        
            if (hiddenId) hiddenId.value = speakerData.id;
            if (nameInput) nameInput.value = speakerData.name;
        
            if (countryInput) {
                countryInput.value = speakerData.country_s?.country || speakerData.country_s;
                countryInput.disabled = true;
                countryInput.style.backgroundColor = '#f0f0f0';
                countryInput.title = 'Campo bloqueado - Speaker existente';
            }
        
            if (agencyInput) {
                agencyInput.value = speakerData.agency_s || '';
                agencyInput.disabled = true;
                agencyInput.style.backgroundColor = '#f0f0f0';
                agencyInput.title = 'Campo bloqueado - Speaker existente';
            }
        
            // Mostrar indicador
            let statusIndicator = speakerRow.querySelector('.speaker-status-indicator');
            if (!statusIndicator) {
                statusIndicator = document.createElement('small');
                statusIndicator.className = 'speaker-status-indicator text-success';
                statusIndicator.textContent = '✓ Ponente existente en BD';
                nameInput.parentNode.appendChild(statusIndicator);
            }
        }
    
        console.log('✅ [ADD-PRES] Speaker actualizado');
    }
    
    /**
     * Handler local para selección de país en "Agregar Presentación"
     * REUTILIZA LA LÓGICA GLOBAL
     */
    async function handleLocalCountrySelect(data, type, speakerIndex) {
        console.log('🌍 [ADD-PRES] País seleccionado:', { data, type, speakerIndex });
    
        // 🔍 PUNTO DE VERIFICACIÓN
        console.log('📍 [ADD-PRES VERIFICACIÓN] Coordenadas:', {
            lat: data.lat,
            lon: data.lon,
            nombre: data.name || data.country
        });
    
        const speakerRow = document.querySelector(`.speaker-row[data-speaker-index="${speakerIndex}"]`);
        if (!speakerRow) {
            console.error('❌ No se encontró speaker row');
            return;
        }
    
        const countryInput = speakerRow.querySelector('.speaker-country');
        if (!countryInput) {
            console.error('❌ No se encontró input de país');
            return;
        }
    
        let statusIndicator = countryInput.parentNode.querySelector('.country-status-indicator');
        if (!statusIndicator) {
            statusIndicator = document.createElement('small');
            statusIndicator.className = 'country-status-indicator';
            statusIndicator.style.cssText = 'display: block; margin-top: 4px; font-size: 0.8rem;';
            countryInput.parentNode.appendChild(statusIndicator);
        }
    
        if (type === 'nominatim') {
            console.log('🆕 [ADD-PRES] Creando país de Nominatim...');
        
            statusIndicator.style.color = '#ffc107';
            statusIndicator.innerHTML = '⏳ Creando país...';
            countryInput.disabled = true;
        
            try {
                const createResult = await CountriesAPI.create({
                    country: data.name,
                    lat: parseFloat(data.lat),
                    lon: parseFloat(data.lon)
                });

                console.log('📍 [ADD-PRES VERIFICACIÓN] Resultado creación:', createResult);

                if (createResult.success) {
                    console.log('✅ [ADD-PRES] País creado exitosamente');

                    localFormState.speakers[speakerIndex].country = data.name;
                    localFormState.speakers[speakerIndex].countryData = {
                        name: data.name,
                        lat: parseFloat(data.lat),
                        lon: parseFloat(data.lon),
                        isNew: true,
                        createdNow: true
                    };

                    countryInput.value = data.name;
                    statusIndicator.style.color = '#28a745';
                    statusIndicator.innerHTML = `✅ País creado: ${data.name} (${data.lat}, ${data.lon})`;
                    countryInput.disabled = true;
                    countryInput.style.backgroundColor = '#e7f5e7';

                } else {
                    console.warn('⚠️ [ADD-PRES] Error al crear:', createResult.error);

                    if (createResult.error.includes('unique') || createResult.error.includes('already exists')) {
                        const searchResult = await CountriesAPI.list(data.name);

                        if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
                            const existingCountry = searchResult.data.results[0];

                            localFormState.speakers[speakerIndex].country = existingCountry.country;
                            localFormState.speakers[speakerIndex].countryData = {
                                name: existingCountry.country,
                                lat: existingCountry.lat,
                                lon: existingCountry.lon,
                                isNew: false,
                                createdNow: false
                            };

                            countryInput.value = existingCountry.country;
                            statusIndicator.style.color = '#17a2b8';
                            statusIndicator.innerHTML = `ℹ️ País existente: ${existingCountry.country}`;
                            countryInput.disabled = true;
                            countryInput.style.backgroundColor = '#e7f5f5';
                        } else {
                            throw new Error('No se pudo verificar el país');
                        }
                    } else {
                        throw new Error(createResult.error);
                    }
                }
                // ACTUALIZAR INDICADOR VISUAL
                const statusIndicatorAddPres = speakerRow.querySelector('.country-validation-status');
                if (statusIndicatorAddPres) {
                    statusIndicatorAddPres.style.color = '#28a745';
                    statusIndicatorAddPres.textContent = '✅ País validado';
                }

            } catch (error) {
                console.error('❌ [ADD-PRES] Error inesperado:', error);

                statusIndicator.style.color = '#dc3545';
                statusIndicator.innerHTML = `❌ Error: ${error.message}`;
                countryInput.disabled = false;
                countryInput.style.backgroundColor = '#ffe7e7';

                localFormState.speakers[speakerIndex].country = null;
                localFormState.speakers[speakerIndex].countryData = null;
            }

        } else if (type === 'local') {
            console.log('✅ [ADD-PRES] País local:', data);

            localFormState.speakers[speakerIndex].country = data.country;
            localFormState.speakers[speakerIndex].countryData = {
                name: data.country,
                lat: data.lat,
                lon: data.lon,
                isNew: false,
                createdNow: false
            };

            countryInput.value = data.country;
            statusIndicator.style.color = '#28a745';
            statusIndicator.innerHTML = `✅ País: ${data.country} (${data.lat}, ${data.lon})`;
            countryInput.disabled = true;
            countryInput.style.backgroundColor = '#f0f0f0';

            const statusIndicatorLocal = speakerRow.querySelector('.country-validation-status');
            
            // ACTUALIZAR INDICADOR VISUAL
            if (statusIndicatorLocal) {
                statusIndicatorLocal.style.color = '#28a745';
                statusIndicatorLocal.textContent = '✅ País validado';
            }
        }

        console.log('📍 [ADD-PRES VERIFICACIÓN FINAL] FormState speaker:', localFormState.speakers[speakerIndex]);
    }

    /**
     * Event listeners
     */
    function attachAddPresentationListeners() {
        const form = document.getElementById('add-presentation-form');

        // Volver
        document.getElementById('back-to-add-options')?.addEventListener('click', () => {
            initAddOptionsView(container);
        });

        // Agregar idioma
        document.getElementById('add-pres-language-btn').addEventListener('click', () => {
            const input = document.getElementById('add-pres-language-input');
            const value = input.value.trim();
            if (value) {
                addLocalLanguageChip(value);
                input.value = '';
            }
        });

        document.getElementById('add-pres-language-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('add-pres-language-btn').click();
            }
        });

        // Agregar ponente
        document.getElementById('add-pres-add-speaker-btn').addEventListener('click', () => {
            localFormState.speakers.push({ name: '', country: null, agency: '' });
            renderAddPresentationSpeakers();
        });

        // Delegación: eliminar ponente
        document.getElementById('add-pres-speakers-list').addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-speaker')) {
                const index = parseInt(e.target.dataset.index);
                if (localFormState.speakers.length === 1) {
                    showFormAlert('Debe haber al menos un ponente', 'warning', 'add-pres-alert');
                    return;
                }
                localFormState.speakers.splice(index, 1);
                renderAddPresentationSpeakers();
            }
        });

        // Cancelar
        document.getElementById('add-pres-cancel-btn').addEventListener('click', () => {
            if (confirm('¿Seguro que deseas cancelar? Se perderán los cambios.')) {
                initAddOptionsView(container);
            }
        });

        // Submit
        form.addEventListener('submit', handleAddPresentationSubmit);
    }

    /**
     * Agregar chip de idioma local
     */
    function addLocalLanguageChip(language) {
        if (localFormState.languages.includes(language)) {
            return;
        }

        localFormState.languages.push(language);

        const container = document.getElementById('add-pres-languages-chips');
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `
            ${language}
            <button type="button" class="chip-remove" data-language="${language}">×</button>
        `;
        container.appendChild(chip);

        chip.querySelector('.chip-remove').addEventListener('click', (e) => {
            const lang = e.target.dataset.language;
            localFormState.languages = localFormState.languages.filter(l => l !== lang);
            chip.remove();
        });
    }

    /**
     * Submit del formulario de agregar presentación
     */
    async function handleAddPresentationSubmit(e) {
        e.preventDefault();

        console.log('🚀 [ADD-PRES] Iniciando guardado de presentación...');

        const submitBtn = document.getElementById('add-pres-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

        try {
            // Validar evento
            if (!selectedEvent || !selectedEvent.id) {
                showFormAlert('❌ Debes seleccionar un evento', 'error', 'add-pres-alert');
                return;
            }

            // Recopilar datos
            const title = document.getElementById('add-pres-title').value.trim();
            const url = document.getElementById('add-pres-url').value.trim();
            const observations = document.getElementById('add-pres-observations').value.trim();

            if (!title) {
                showFormAlert('❌ El título es obligatorio', 'error', 'add-pres-alert');
                return;
            }

            // Validar título duplicado
            console.log('🔍 [ADD-PRES] Validando título duplicado...');
            const existingPres = await PresentationsAPI.list({ event_id: selectedEvent.id });

            if (existingPres.success) {
                const presentations = existingPres.data.results || existingPres.data || [];
                const duplicate = presentations.find(p => 
                    p.title.toLowerCase() === title.toLowerCase()
                );

                if (duplicate) {
                    showFormAlert(
                        `❌ Ya existe una presentación con el título "${title}" en el evento "${selectedEvent.title}". Por favor usa un título diferente.`,
                        'error',
                        'add-pres-alert'
                    );
                    return;
                }
            }

            // Validar speakers
            console.log('👥 [ADD-PRES] Validando speakers...');
            const speakerRows = document.querySelectorAll('.speaker-row');
            const speakers = [];

            for (let i = 0; i < speakerRows.length; i++) {
                const row = speakerRows[i];
                const index = parseInt(row.dataset.speakerIndex);

                const speakerIdInput = row.querySelector('.speaker-id');
                const speakerId = speakerIdInput ? speakerIdInput.value.trim() : '';

                const nameInput = row.querySelector('.speaker-name');
                const name = nameInput ? nameInput.value.trim() : '';

                const countryInput = row.querySelector('.speaker-country');
                const country = countryInput ? countryInput.value.trim() : '';

                const agencyInput = row.querySelector('.speaker-agency');
                const agency = agencyInput ? agencyInput.value.trim() : '';

                // ✅ VALIDACIÓN BÁSICA
            if (!name || !country) {
                console.error(`❌ [ADD-PRES] Speaker #${i + 1} incompleto`);
                showFormAlert(
                    `❌ El speaker #${i + 1} debe tener nombre y país`,
                    'error',
                    'add-pres-alert'
                );
                return;
            }
        
            // ✅ PREPARAR OBJETO SPEAKER
            const speakerData = {
                id: speakerId || null,
                name,
                country,
                countryData: localFormState.speakers[index]?.countryData || null,
                agency
            };
        
            // ✅ VALIDACIÓN LAZY: Completar countryData si falta
            if (!speakerData.countryData || !speakerData.countryData.lat || !speakerData.countryData.lon) {
                console.warn(`⚠️ [ADD-PRES] Speaker #${i + 1} sin countryData, validando...`);
            
                // Mostrar mensaje de progreso
                showFormAlert(
                    `🔍 Validando país "${country}" del speaker "${name}"...`,
                    'info',
                    'add-pres-alert'
                );
            
                const validationResult = await ensureCountryDataComplete(speakerData, index, localFormState);
            
                if (!validationResult.success) {
                    console.error(`❌ [ADD-PRES] Error validando país:`, validationResult.error);
                    showFormAlert(validationResult.error, 'error', 'add-pres-alert');
                
                    // Resaltar campo problemático
                    if (countryInput) {
                        countryInput.style.border = '2px solid #dc3545';
                        countryInput.focus();
                        setTimeout(() => {
                            countryInput.style.border = '';
                        }, 3000);
                    }
                    return;
                }
            
                console.log(`✅ [ADD-PRES] País validado exitosamente para speaker #${i + 1}`);
            }
        
            speakers.push(speakerData);
        }
        
        if (speakers.length === 0) {
            showFormAlert('❌ Debes agregar al menos un ponente', 'error', 'add-pres-alert');
            return;
        }
        
        console.log('✅ [ADD-PRES] Todos los speakers validados:', speakers);
                /*
                if (!name || !country) {
                    showFormAlert(
                        `❌ El speaker #${i + 1} debe tener nombre y país`,
                        'error',
                        'add-pres-alert'
                    );
                    return;
                }

                // Validar que el país tenga datos completos en formState
                const speakerState = localFormState.speakers[index];
                if (!speakerState || !speakerState.countryData) {
                    showFormAlert(
                        `❌ El país "${country}" del speaker "${name}" no fue validado correctamente. Por favor selecciónalo nuevamente del menú desplegable.`,
                        'error',
                        'add-pres-alert'
                    );

                    if (countryInput) {
                        countryInput.style.border = '2px solid #dc3545';
                        setTimeout(() => {
                            countryInput.style.border = '';
                        }, 3000);
                    }
                    return;
                }

                speakers.push({
                    id: speakerId || null,
                    name,
                    country,
                    countryData: speakerState.countryData,
                    agency
                });
            }

            if (speakers.length === 0) {
                showFormAlert('❌ Debes agregar al menos un ponente', 'error', 'add-pres-alert');
                return;
            }

            console.log('✅ [ADD-PRES] Speakers validados:', speakers);*/

            // Crear presentación
            console.log('📄 [ADD-PRES] Creando presentación...');
            const presResult = await PresentationsAPI.create({
                title: title,
                event_title: selectedEvent.title,
                language: localFormState.languages,
                url_document: url,
                observations: observations
            });

            if (!presResult.success) {
                showFormAlert('❌ Error al crear presentación: ' + presResult.error, 'error', 'add-pres-alert');
                return;
            }

            const presentationId = presResult.data.id;
            console.log('✅ [ADD-PRES] Presentación creada con ID:', presentationId);

            // Procesar speakers
            console.log('👥 [ADD-PRES] Procesando speakers...');

            for (let speakerData of speakers) {
                let speaker;

                if (speakerData.id) {
                    // Speaker existente
                    console.log('✅ [ADD-PRES] Usando speaker existente:', speakerData.id);
                    speaker = { id: speakerData.id };

                } else {
                    // Speaker nuevo
                    console.log('🆕 [ADD-PRES] Creando speaker:', speakerData.name);

                    // Buscar por nombre+país
                    const existingSpeaker = await SpeakersAPI.list(speakerData.name, speakerData.country);

                    if (existingSpeaker.success && existingSpeaker.data.results && existingSpeaker.data.results.length > 0) {
                        speaker = existingSpeaker.data.results[0];
                        console.log('✅ [ADD-PRES] Speaker encontrado en BD:', speaker.id);

                    } else {
                        // Crear nuevo speaker
                        const newSpeaker = await SpeakersAPI.create({
                            name: speakerData.name,
                            country_s: speakerData.country,
                            agency_s: speakerData.agency
                        });

                        if (!newSpeaker.success) {
                            console.error('❌ [ADD-PRES] Error al crear speaker:', newSpeaker.error);
                            showFormAlert(
                                `⚠️ No se pudo crear el ponente "${speakerData.name}": ${newSpeaker.error}`,
                                'warning',
                                'add-pres-alert'
                            );
                            continue;
                        }

                        speaker = newSpeaker.data;
                        console.log('✅ [ADD-PRES] Speaker creado con ID:', speaker.id);
                    }
                }

                // Asociar speaker con presentación
                const assocResult = await PresentationsAPI.addSpeaker(presentationId, speaker.id);

                if (!assocResult.success) {
                    console.error('⚠️ [ADD-PRES] Error al asociar speaker:', assocResult.error);
                } else {
                    console.log('✅ [ADD-PRES] Speaker asociado a presentación');
                }
            }

            // Éxito
            console.log('🎉 [ADD-PRES] Presentación guardada exitosamente');
            showFormAlert('✅ Presentación agregada exitosamente', 'success', 'add-pres-alert');

            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('❌ [ADD-PRES] Error inesperado:', error);
            showFormAlert('❌ Error inesperado: ' + error.message, 'error', 'add-pres-alert');

        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Guardar Presentación';
        }
    }
}

/**
*====================================
*AGREGAR SPEAKER A PRESENTACIÓN
*====================================
*/

export function initAddSpeakerForm(container, prefilledPresentation = null) {
    let selectedPresentation = prefilledPresentation;
    let localAutocompleteInstances = [];
    
    // Estado local del speaker
    let speakerData = {
        id: null,
        name: '',
        country: null,
        countryData: null,
        agency: ''
    };

    // ========== GENERAR HTML CON INDICADOR DE VALIDACIÓN ==========
    container.innerHTML = `
        <form id="add-speaker-form" class="event-form">
            <button type="button" class="btn btn-outline-secondary" id="back-to-add-options-2" style="margin-bottom: 20px;">
                ← Volver a opciones
            </button>

            <!-- Sección: Seleccionar Presentación -->
            <div class="form-section">
                <h4 class="form-section-title">📋 Seleccionar Presentación</h4>
                
                <div class="form-group">
                    <label for="add-speaker-pres">Presentación *</label>
                    <input 
                        type="text" 
                        id="add-speaker-pres" 
                        class="form-control autocomplete-input"
                        placeholder="Busca la presentación..."
                        ${prefilledPresentation ? 'disabled' : ''}
                        required
                    >
                    ${prefilledPresentation ? `<input type="hidden" id="add-speaker-pres-id" value="${prefilledPresentation.id}">` : ''}
                    <small class="form-text">
                        ${prefilledPresentation ? '✓ Presentación prellenada' : 'Escribe para buscar presentaciones existentes'}
                    </small>
                </div>
            </div>

            <!-- Sección: Datos del Ponente -->
            <div class="form-section">
                <h4 class="form-section-title">👤 Datos del Ponente</h4>
                
                <div class="form-grid">
                    <div class="form-group" style="grid-column: 1 / -1;">
                        <label for="add-speaker-name">Nombre del ponente *</label>
                        <input 
                            type="text" 
                            id="add-speaker-name" 
                            class="form-control autocomplete-input"
                            placeholder="Busca o escribe el nombre completo"
                            required
                        >
                        <small class="form-text" style="color: #6c757d;">
                            💡 Escribe para buscar ponentes existentes en la base de datos
                        </small>
                        <!-- Indicador de speaker existente se agregará aquí dinámicamente -->
                    </div>

                    <div class="form-group">
                        <label for="add-speaker-country">País *</label>
                        <input 
                            type="text" 
                            id="add-speaker-country" 
                            class="form-control autocomplete-input"
                            placeholder="País del ponente"
                            required
                        >
                        <!-- ✅ NUEVO: Indicador de validación de país -->
                        <small class="country-validation-status" style="display: block; margin-top: 4px; font-size: 0.8rem; color: #6c757d;">
                            ❓ Sin validar
                        </small>
                    </div>

                    <div class="form-group">
                        <label for="add-speaker-agency">Organismo</label>
                        <input 
                            type="text" 
                            id="add-speaker-agency" 
                            class="form-control autocomplete-input"
                            placeholder="Institución u organización"
                        >
                    </div>
                </div>
            </div>

            <!-- Botones de acción -->
            <div class="form-buttons">
                <button type="button" id="add-speaker-cancel-btn" class="btn-cancel">
                    ❌ Cancelar
                </button>
                <button type="submit" id="add-speaker-submit-btn" class="btn-save">
                    💾 Agregar Ponente
                </button>
            </div>

            <div id="add-speaker-alert" class="alert-inline" style="display: none; margin-top: 20px;"></div>
        </form>
    `;

    // ========== REFERENCIAS A ELEMENTOS DEL DOM ==========
    const nameInput = document.getElementById('add-speaker-name');
    const countryInput = document.getElementById('add-speaker-country');
    const agencyInput = document.getElementById('add-speaker-agency');

    // ========== AUTOCOMPLETE DE PRESENTACIÓN ==========
    if (!prefilledPresentation) {
        const presAutocomplete = new Autocomplete(document.getElementById('add-speaker-pres'), {
            type: 'text',
            minChars: 2,
            searchLocal: false,
            onSelect: (data) => {
                selectedPresentation = {
                    id: data.id,
                    title: data.title
                };
                document.getElementById('add-speaker-pres').value = data.title;
                console.log('✅ Presentación seleccionada:', selectedPresentation);
            }
        });

        // Custom search para presentaciones
        presAutocomplete.handleInput = async function(e) {
            const query = e.target.value.trim();
            if (query.length < 2) {
                this.hideResults();
                return;
            }

            this.isLoading = true;
            this.showLoading();

            const result = await PresentationsAPI.search(query);
            const presentations = result.success ? (result.data || []) : [];

            this.results = presentations.map(pres => {
                const speakersNames = pres.speakers ? pres.speakers.map(s => s.name).join(', ') : 'Sin ponentes';
                return {
                    type: 'local',
                    data: pres,
                    display: `📋 ${pres.title} | Evento: ${pres.event_title} (${pres.event_country}) | Ponentes: ${speakersNames}`
                };
            });

            this.isLoading = false;
            this.renderResults();
        };

        localAutocompleteInstances.push(presAutocomplete);
    } else {
        document.getElementById('add-speaker-pres').value = prefilledPresentation.title;
    }

    // ========== ✅ NUEVO: AUTOCOMPLETE DE NOMBRE DE SPEAKER ==========
    const nameAutocomplete = createSpeakerNameAutocomplete(nameInput, handleSpeakerSelected);
    localAutocompleteInstances.push(nameAutocomplete);

    /**
     * Handler cuando se selecciona un speaker existente del autocomplete
     */
    function handleSpeakerSelected(data, type) {
        console.log('👤 [ADD-SPEAKER] Speaker seleccionado desde BD:', data);

        // Actualizar estado local
        speakerData = {
            id: data.id,
            name: data.name,
            country: data.country_s?.country || data.country_s,
            countryData: {
                name: data.country_s?.country || data.country_s,
                lat: data.country_s?.lat,
                lon: data.country_s?.lon,
                isNew: false,
                createdNow: false
            },
            agency: data.agency_s || ''
        };

        // Usar helper para llenar campos
        applySpeakerFieldsFromData(
            { nameInput, countryInput, agencyInput },
            data,
            { lockFields: true, showIndicator: true }
        );

        console.log('✅ [ADD-SPEAKER] Campos llenados desde BD');
    }

    // ========== AUTOCOMPLETE DE PAÍS ==========
    const countryAC = new Autocomplete(countryInput, {
        type: 'country',
        searchLocal: true,
        searchNominatim: true,
        allowCreate: false,
        onSelect: handleCountrySelected
    });
    localAutocompleteInstances.push(countryAC);

    /**
     * Handler cuando se selecciona un país del autocomplete
     */
    async function handleCountrySelected(data, type) {
        console.log('🌍 [ADD-SPEAKER] País seleccionado:', { data, type });

        updateCountryValidationIndicator(countryInput, 'validating');

        if (type === 'nominatim') {
            // País de Nominatim - crear en BD
            try {
                const createResult = await CountriesAPI.create({
                    country: data.name,
                    lat: parseFloat(data.lat),
                    lon: parseFloat(data.lon)
                });

                if (createResult.success) {
                    speakerData.country = data.name;
                    speakerData.countryData = {
                        name: data.name,
                        lat: parseFloat(data.lat),
                        lon: parseFloat(data.lon),
                        isNew: true,
                        createdNow: true
                    };

                    countryInput.value = data.name;
                    updateCountryValidationIndicator(countryInput, 'validated', `✅ País creado: ${data.name}`);
                    countryInput.disabled = true;
                    countryInput.style.backgroundColor = '#e7f5e7';

                } else {
                    // Puede que ya exista
                    const searchResult = await CountriesAPI.list(data.name);
                    if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
                        const existingCountry = searchResult.data.results[0];
                        
                        speakerData.country = existingCountry.country;
                        speakerData.countryData = {
                            name: existingCountry.country,
                            lat: existingCountry.lat,
                            lon: existingCountry.lon,
                            isNew: false,
                            createdNow: false
                        };

                        countryInput.value = existingCountry.country;
                        updateCountryValidationIndicator(countryInput, 'validated', `ℹ️ País existente: ${existingCountry.country}`);
                        countryInput.disabled = true;
                    } else {
                        updateCountryValidationIndicator(countryInput, 'error', createResult.error);
                    }
                }
            } catch (error) {
                console.error('❌ Error al crear país:', error);
                updateCountryValidationIndicator(countryInput, 'error', error.message);
            }

        } else if (type === 'local') {
            // País de BD local
            speakerData.country = data.country;
            speakerData.countryData = {
                name: data.country,
                lat: data.lat,
                lon: data.lon,
                isNew: false,
                createdNow: false
            };

            countryInput.value = data.country;
            updateCountryValidationIndicator(countryInput, 'validated');
            countryInput.disabled = true;
        }
    }

    // ========== ✅ NUEVO: VALIDACIÓN AUTOMÁTICA EN BLUR ==========
    countryInput.addEventListener('blur', async (e) => {
        const countryValue = e.target.value.trim();

        if (!countryValue) {
            updateCountryValidationIndicator(countryInput, 'unvalidated');
            return;
        }

        // Si ya tiene countryData, está validado
        if (speakerData.countryData) {
            updateCountryValidationIndicator(countryInput, 'validated');
            e.target.style.backgroundColor = '#e7f5e7';
            return;
        }

        // Intentar validar automáticamente
        updateCountryValidationIndicator(countryInput, 'validating');

        try {
            const searchResult = await CountriesAPI.list(countryValue);

            if (searchResult.success && searchResult.data.results && searchResult.data.results.length > 0) {
                const foundCountry = searchResult.data.results[0];

                speakerData.country = foundCountry.country;
                speakerData.countryData = {
                    name: foundCountry.country,
                    lat: foundCountry.lat,
                    lon: foundCountry.lon,
                    isNew: false,
                    createdNow: false
                };

                e.target.value = foundCountry.country;
                updateCountryValidationIndicator(countryInput, 'validated');
                e.target.style.backgroundColor = '#e7f5e7';

                console.log('✅ [AUTO-VALIDATE] País auto-validado:', foundCountry.country);
            } else {
                updateCountryValidationIndicator(countryInput, 'notfound');
                e.target.style.backgroundColor = '#fff3cd';
            }
        } catch (error) {
            console.error('Error en validación automática:', error);
            updateCountryValidationIndicator(countryInput, 'error');
        }
    });

    // ========== ✅ NUEVO: ACTUALIZAR INDICADOR AL ESCRIBIR ==========
    countryInput.addEventListener('input', (e) => {
        if (e.target.value.trim()) {
            updateCountryValidationIndicator(countryInput, 'typing');
        } else {
            updateCountryValidationIndicator(countryInput, 'unvalidated');
        }
    });

    // ========== ✅ NUEVO: DESBLOQUEAR CAMPOS SI SE MODIFICA NOMBRE ==========
    nameInput.addEventListener('input', (e) => {
        // Si el usuario empieza a escribir después de seleccionar un speaker
        if (speakerData.id && e.target.value !== speakerData.name) {
            console.log('⚠️ Usuario modificó nombre de speaker existente, desbloqueando campos');
            
            // Limpiar ID
            speakerData.id = null;

            // Desbloquear campos
            if (countryInput.disabled) {
                countryInput.disabled = false;
                countryInput.style.backgroundColor = '';
            }
            if (agencyInput.disabled) {
                agencyInput.disabled = false;
                agencyInput.style.backgroundColor = '';
            }

            // Eliminar indicador
            const indicator = nameInput.parentNode.querySelector('.speaker-status-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
    });

    // ========== AUTOCOMPLETE DE AGENCIA ==========
    const agencyAC = new Autocomplete(agencyInput, {
        type: 'agency',
        searchLocal: true,
        allowCreate: true
    });
    localAutocompleteInstances.push(agencyAC);

    // ========== EVENT LISTENERS ==========
    document.getElementById('back-to-add-options-2')?.addEventListener('click', () => {
        initAddOptionsView(container);
    });

    document.getElementById('add-speaker-cancel-btn').addEventListener('click', () => {
        if (confirm('¿Seguro que deseas cancelar?')) {
            initAddOptionsView(container);
        }
    });

    document.getElementById('add-speaker-form').addEventListener('submit', handleAddSpeakerSubmit);

    // ========== ✅ MEJORADO: SUBMIT CON VALIDACIÓN LAZY ==========
    async function handleAddSpeakerSubmit(e) {
        e.preventDefault();

        console.log('🚀 [ADD-SPEAKER] Iniciando submit...');

        const submitBtn = document.getElementById('add-speaker-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="loading-spinner"></span> Guardando...';

        try {
            // ========== VALIDACIÓN: PRESENTACIÓN ==========
            if (!selectedPresentation || !selectedPresentation.id) {
                showFormAlert('❌ Debes seleccionar una presentación', 'error', 'add-speaker-alert');
                return;
            }

            // ========== VALIDACIÓN: DATOS BÁSICOS ==========
            const name = nameInput.value.trim();
            const country = countryInput.value.trim();
            const agency = agencyInput.value.trim();

            if (!name || !country) {
                showFormAlert('❌ El nombre y el país son obligatorios', 'error', 'add-speaker-alert');
                return;
            }

            // ========== ✅ NUEVO: VALIDACIÓN LAZY DEL PAÍS ==========
            if (!speakerData.countryData || !speakerData.countryData.lat || !speakerData.countryData.lon) {
                console.warn('⚠️ [ADD-SPEAKER] País sin countryData, validando...');

                showFormAlert(`🔍 Validando país "${country}"...`, 'info', 'add-speaker-alert');

                const tempSpeakerData = {
                    name,
                    country,
                    countryData: speakerData.countryData,
                    agency
                };

                const validationResult = await ensureCountryDataComplete(tempSpeakerData, 0, { speakers: [tempSpeakerData] });

                if (!validationResult.success) {
                    showFormAlert(validationResult.error, 'error', 'add-speaker-alert');
                    countryInput.style.border = '2px solid #dc3545';
                    countryInput.focus();
                    setTimeout(() => {
                        countryInput.style.border = '';
                    }, 3000);
                    return;
                }

                // Actualizar speakerData con countryData validado
                speakerData.countryData = tempSpeakerData.countryData;
                console.log('✅ [ADD-SPEAKER] País validado lazily');
            }

            // ========== BUSCAR/CREAR SPEAKER ==========
            console.log('👤 [ADD-SPEAKER] Buscando/creando speaker...');

            let speaker;

            // Si tiene ID, usar speaker existente
            if (speakerData.id) {
                console.log('✅ [ADD-SPEAKER] Usando speaker existente con ID:', speakerData.id);
                speaker = { id: speakerData.id };
            } else {
                // Buscar por nombre + país
                const existingSpeaker = await SpeakersAPI.list(name, country);

                if (existingSpeaker.success && existingSpeaker.data.results && existingSpeaker.data.results.length > 0) {
                    speaker = existingSpeaker.data.results[0];
                    console.log('✅ [ADD-SPEAKER] Speaker encontrado en BD:', speaker.id);
                } else {
                    // Crear nuevo speaker
                    const newSpeaker = await SpeakersAPI.create({
                        name: name,
                        country_s: country,
                        agency_s: agency
                    });

                    if (!newSpeaker.success) {
                        showFormAlert('❌ Error al crear ponente: ' + newSpeaker.error, 'error', 'add-speaker-alert');
                        return;
                    }
                    speaker = newSpeaker.data;
                    console.log('✅ [ADD-SPEAKER] Speaker creado con ID:', speaker.id);
                }
            }

            // ========== ASOCIAR SPEAKER CON PRESENTACIÓN ==========
            console.log('🔗 [ADD-SPEAKER] Asociando speaker con presentación...');

            const assocResult = await PresentationsAPI.addSpeaker(selectedPresentation.id, speaker.id);

            if (!assocResult.success) {
                showFormAlert('❌ Error al asociar ponente: ' + assocResult.error, 'error', 'add-speaker-alert');
                return;
            }

            // ========== ÉXITO ==========
            console.log('🎉 [ADD-SPEAKER] Ponente agregado exitosamente');
            showFormAlert('✅ Ponente agregado exitosamente', 'success', 'add-speaker-alert');

            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('❌ [ADD-SPEAKER] Error inesperado:', error);
            showFormAlert('❌ Error inesperado: ' + error.message, 'error', 'add-speaker-alert');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '💾 Agregar Ponente';
        }
    }
}

/**
Vista de opciones de agregar
*/
function initAddOptionsView(container) {
    container.innerHTML = `
        <div class="add-options">          
            <button class="add-option-btn" data-action="add-presentation">
                📋 Agregar Presentación a Evento Existente 
                <small>Añade una nueva presentación con sus ponentes a un evento ya creado</small>
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

            if (action === 'add-presentation') {
                initAddPresentationForm(container);
            } else if (action === 'add-speaker') {
                initAddSpeakerForm(container);
            }
        });
    });
}

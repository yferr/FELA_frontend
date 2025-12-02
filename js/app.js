import axios from 'axios';
// Leaflet
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { initAuthButton } from './auth.js';
import { initEditor } from './editor.js';
// Bootstrap
//import 'bootstrap/dist/css/bootstrap.min.css';
//import 'bootstrap/dist/js/bootstrap.bundle.min.js';

let map;
let eventsData = {};
let countriesGeoJSON = {}; // Solo países
let citiesGeoJSON = {};    // Solo ciudades
let currentView = 'events'; // 'events', 'speakers', 'language', 'agency'
let currentLocationView = 'country'; // 'country' or 'city'
let filterLanguage = null; 
let filterAgency = null; 
let markersLayer;
let eventsLayer;
let speakersLayer;
let languagesLayer = L.layerGroup();
let agenciesLayer = L.layerGroup(); 
window.map = null;
window.eventsLayer = null;
window.speakersLayer = null;
window.languagesLayer = null;
window.agenciesLayer = null;

// Configuración de la API
const API_BASE_URL = 'https://gisserver.car.upv.es/fela_api/';

// Main Menu switching
/*document.querySelectorAll('.menu-item').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('visible'));
    const sectionId = `${button.dataset.section}-container`;
    document.getElementById(sectionId).classList.add('visible');

    const controlsContainer = document.querySelector('.controls-container');
    if (button.dataset.section === 'map') {
      controlsContainer.style.display = 'block';
    } else {
      controlsContainer.style.display = 'none';
    }
  });
});
*/

// ✅ CORREGIDO: Main Menu switching con validación
document.querySelectorAll('.menu-item').forEach(button => {
  button.addEventListener('click', () => {
    // ✅ VALIDAR: Ignorar botón de auth que no tiene data-section
    if (!button.dataset.section) {
      console.log('🔘 Botón sin data-section (auth), ignorando cambio de sección');
      return;
    }
    
    document.querySelectorAll('.menu-item').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');

    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('visible'));
    const sectionId = `${button.dataset.section}-container`;
    const targetSection = document.getElementById(sectionId);
    
    // ✅ VALIDAR: Verificar que la sección existe
    if (targetSection) {
      targetSection.classList.add('visible');
    } else {
      console.error(`❌ Sección no encontrada: ${sectionId}`);
    }

    const controlsContainer = document.querySelector('.controls-container');
    if (controlsContainer) {
      if (button.dataset.section === 'map') {
        controlsContainer.style.display = 'block';
      } else {
        controlsContainer.style.display = 'none';
      }
    }
  });
});


//Initialize the map
function initMap() {
	// Crear mapa y asignarlo a variable global
	window.map = L.map('map').setView([40.0, 0.0], 3);
	map = window.map; // Mantener compatibilidad
	
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '© OpenStreetMap contributors'
	}).addTo(map);
	
	// Asignar layers a variables globales
	window.eventsLayer = L.layerGroup().addTo(map);
	eventsLayer = window.eventsLayer;
	
	window.speakersLayer = L.layerGroup();
	speakersLayer = window.speakersLayer;
	
	window.languagesLayer = L.layerGroup();
	languagesLayer = window.languagesLayer;
	
	window.agenciesLayer = L.layerGroup();
	agenciesLayer = window.agenciesLayer;
}

// Function to show loading state
function showLoading(message = 'Cargando datos de eventos...') {
	const loadingDiv = document.getElementById('loading');
	loadingDiv.innerHTML = `<div>${message}</div>`;
	loadingDiv.style.display = 'block';
}

// Function to hide loading state
function hideLoading() {
	document.getElementById('loading').style.display = 'none';
}
// Function to show error
function showError(message) {
	const loadingDiv = document.getElementById('loading');
	loadingDiv.innerHTML = `
		<div style="color: #dc3545; padding: 20px;">
			<h3>❌ Error</h3>
			<p>${message}</p>
			<button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">
				🔄 Reintentar
			</button>
		</div>
	`;
	loadingDiv.style.display = 'block';
}


//-------------------------
// NUEVA: Function to extract unique languages from events data
function extractUniqueLanguages(eventsData) {
	const languagesSet = new Set();
	
	Object.keys(eventsData).forEach(year => {
		Object.keys(eventsData[year]).forEach(eventTitle => {
			eventsData[year][eventTitle].forEach(event => {
				Object.keys(event.titles).forEach(titleKey => {
					event.titles[titleKey].forEach(presentation => {
						// language puede ser string o array
						const languages = Array.isArray(presentation.language) 
							? presentation.language 
							: [presentation.language];
						
						languages.forEach(lang => {
							if (lang && lang.trim() !== '') {
								languagesSet.add(lang.trim());
							}
						});
					});
				});
			});
		});
	});
	
	// Convertir Set a Array y ordenar alfabéticamente
	return Array.from(languagesSet).sort((a, b) => a.localeCompare(b, 'es'));
}

// NUEVA: Function to extract unique agencies from events data
function extractUniqueAgencies(eventsData) {
	const agenciesSet = new Set();
	
	Object.keys(eventsData).forEach(year => {
		Object.keys(eventsData[year]).forEach(eventTitle => {
			eventsData[year][eventTitle].forEach(event => {
				// agency puede ser string o array
				const agencies = Array.isArray(event.agency) 
					? event.agency 
					: [event.agency];
				
				agencies.forEach(agency => {
					if (agency && agency.trim() !== '') {
						agenciesSet.add(agency.trim());
					}
				});
			});
		});
	});
	
	// Convertir Set a Array y ordenar alfabéticamente
	return Array.from(agenciesSet).sort((a, b) => a.localeCompare(b, 'es'));
}

// NUEVA: Function to populate languages dropdown
function populateLanguagesDropdown(languages) {
	const dropdown = document.getElementById('languages-dropdown');
	
	if (!dropdown) {
		console.error('No se encontró el dropdown de idiomas con id "languages-dropdown"');
		return;
	}
	
	// Limpiar contenido existente
	dropdown.innerHTML = '';
	
	// Crear items del dropdown
	languages.forEach(language => {
		const li = document.createElement('li');
		const a = document.createElement('a');
		
		a.className = 'dropdown-item';
		a.href = '#';
		a.textContent = language;
		a.onclick = (e) => {
			e.preventDefault();
			filterBy('lang', language);
		};
		
		li.appendChild(a);
		dropdown.appendChild(li);
	});
	
	console.log(`✅ Dropdown de idiomas poblado con ${languages.length} opciones:`, languages);
}

// NUEVA: Function to populate agencies dropdown
function populateAgenciesDropdown(agencies) {
	const dropdown = document.getElementById('agencies-dropdown');
	
	if (!dropdown) {
		console.error('No se encontró el dropdown de organismos con id "agencies-dropdown"');
		return;
	}
	
	// Limpiar contenido existente
	dropdown.innerHTML = '';
	
	// Crear items del dropdown
	agencies.forEach(agency => {
		const li = document.createElement('li');
		const a = document.createElement('a');
		
		a.className = 'dropdown-item';
		a.href = '#';
		a.textContent = agency;
		a.onclick = (e) => {
			e.preventDefault();
			filterBy('agc', agency);
		};
		
		li.appendChild(a);
		dropdown.appendChild(li);
	});
	
	console.log(`✅ Dropdown de organismos poblado con ${agencies.length} opciones:`, agencies);
}

// NUEVA: Function to populate all dynamic dropdowns
function populateAllDropdowns() {
	console.log('🔄 Poblando dropdowns dinámicos...');
	
	// Extraer valores únicos
	const uniqueLanguages = extractUniqueLanguages(eventsData);
	const uniqueAgencies = extractUniqueAgencies(eventsData);
	
	// Poblar dropdowns
	populateLanguagesDropdown(uniqueLanguages);
	populateAgenciesDropdown(uniqueAgencies);
	
	console.log('✅ Dropdowns poblados exitosamente');
}
//-----


// Function to load data with Axios
async function loadData() {
	try {
		showLoading('Cargando datos de eventos...');
		
		// Realizar petición con Axios
		const response = await axios.get(`${API_BASE_URL}/geojson/`, {
			timeout: 30000, // 30 segundos de timeout
			headers: {
				'Content-Type': 'application/json',
			}
		});
		
		// Validar que la respuesta tenga la estructura esperada
		if (!response.data) {
			throw new Error('La respuesta del servidor está vacía');
		}
		
		const data = response.data;
		
		// Validar estructura de datos
		if (!data.events) {
			throw new Error('La respuesta no contiene datos de eventos');
		}
		
		if (!data.countriesGeoJSON || !data.countriesGeoJSON.features) {
			throw new Error('La respuesta no contiene datos de países');
		}
		
		if (!data.citiesGeoJSON || !data.citiesGeoJSON.features) {
			throw new Error('La respuesta no contiene datos de ciudades');
		}
		
		// Asignar datos a variables globales
		eventsData = data.events;
		countriesGeoJSON = data.countriesGeoJSON;
		citiesGeoJSON = data.citiesGeoJSON;
		
		console.log('✅ Datos cargados correctamente:', {
			eventos: Object.keys(eventsData).length,
			países: countriesGeoJSON.features.length,
			ciudades: citiesGeoJSON.features.length
		});
		populateAllDropdowns();
		hideLoading();
		displayEventsOnMap();
		
	} catch (error) {
		console.error('❌ Error al cargar datos:', error);
		
		// Manejo específico de errores
		let errorMessage = 'Error desconocido al cargar los datos';
		
		if (error.code === 'ECONNABORTED') {
			errorMessage = 'La petición tardó demasiado. Por favor, verifica tu conexión.';
		} else if (error.response) {
			// El servidor respondió con un código de error
			errorMessage = `Error del servidor (${error.response.status}): ${error.response.statusText}`;
			
			if (error.response.status === 404) {
				errorMessage = 'No se encontró el endpoint. Verifica que el servidor esté corriendo en http://localhost:8888';
			} else if (error.response.status === 500) {
				errorMessage = 'Error interno del servidor. Revisa los logs del backend.';
			}
		} else if (error.request) {
			// La petición se hizo pero no hubo respuesta
			errorMessage = `No se pudo conectar con el servidor en ${API_BASE_URL}. Verifica que:
				<br>• El servidor Django esté corriendo
				<br>• CORS esté configurado correctamente
				<br>• La URL sea correcta`;
		} else {
			errorMessage = error.message;
		}
		
		showError(errorMessage);
	}
}

// Function to retry loading (placeholder para implementación futura)
function retryLoadData() {
	// TODO: Implementar lógica de reintentos automáticos
	// Ejemplo: intentar 3 veces con delay exponencial
}

//// Function to load data
//async function loadData() {
//	try {
//		const response = await fetch('./datos_completos.json');
//		const data = await response.json();
//		
//		eventsData = data.events;
//		countriesGeoJSON = data.countriesGeoJSON;
//		
//		document.getElementById('loading').style.display = 'none';
//		displayEventsOnMap();
//		
//	} catch (error) {
//		console.error('Error loading data:', error);
//	}
//}

// Function to switch between main views (events/speakers)
function switchView(viewType) {
	currentView = viewType;
	
	// Update buttons if they exist (legacy support)
	const eventsBtn = document.getElementById('events-btn');
	const speakersBtn = document.getElementById('speakers-btn');
	if (eventsBtn) eventsBtn.classList.toggle('active', viewType === 'events');
	if (speakersBtn) speakersBtn.classList.toggle('active', viewType === 'speakers');
	
	// Show corresponding view
	displayCurrentView();
}

// Function to switch between location views (country/city)
function switchLocationView(locationType) {
	currentLocationView = locationType;
	
	// Update dropdown selection if it exists
	const locationSelect = document.getElementById('location-select');
	if (locationSelect) locationSelect.value = locationType;
	
	// Refresh current view
	displayCurrentView();
}

// Function to display current view
function displayCurrentView() {
	console.log("Current view:", currentView, "Location view:", currentLocationView);

	// Remove all layers from map
	map.removeLayer(eventsLayer);
	map.removeLayer(speakersLayer);
	map.removeLayer(languagesLayer);
	map.removeLayer(agenciesLayer);

	// Clear all layers
	eventsLayer.clearLayers();
	speakersLayer.clearLayers();
	languagesLayer.clearLayers();
	agenciesLayer.clearLayers();

	// Display appropriate view
	if (currentView === 'events') {
		displayEventsOnMap();
		map.addLayer(eventsLayer);
	} else if (currentView === 'speakers') {
		displaySpeakersOnMap();
		map.addLayer(speakersLayer);
	} else if (currentView === 'language') {
		displayLanguageFilteredMap();
		map.addLayer(languagesLayer);
	} else if (currentView === 'agency') {
		displayAgencyFilteredMap();
		map.addLayer(agenciesLayer);
	}
}

// Function to get coordinates by country name (NUEVA)
function getCoordinatesByCountry(countryName) {
	if (!countryName || countryName.trim() === '' || countryName === '-') {
		return null;
	}
	
	if (countriesGeoJSON && countriesGeoJSON.features) {
		const feature = countriesGeoJSON.features.find(f => 
			f.properties.country.toLowerCase() === countryName.toLowerCase()
		);
		if (feature) {
			return {
				lat: feature.geometry.coordinates[1],
				lon: feature.geometry.coordinates[0]
			};
		}
	}
	return null;
}

// Function to get coordinates by city name (ACTUALIZADA)
function getCoordinatesByCity(cityName) {
	if (!cityName || cityName.trim() === '' || cityName === '-') {
		return null;
	}
	
	if (citiesGeoJSON && citiesGeoJSON.features) {
		const feature = citiesGeoJSON.features.find(f => 
			f.properties.city.toLowerCase() === cityName.toLowerCase()
		);
		if (feature) {
			return {
				lat: feature.geometry.coordinates[1],
				lon: feature.geometry.coordinates[0]
			};
		}
	}
	return null;
}

//EVENTS

// Function to display events on map
function displayEventsOnMap() {
	const eventLocations = new Map();
	
	// Group events by location based on current view
	Object.keys(eventsData).forEach(year => {
		Object.keys(eventsData[year]).forEach(eventTitle => {
			eventsData[year][eventTitle].forEach(event => {
				let coordinates = null;
				let locationKey = '';
				let locationName = '';
				
				if (event.place && event.place.length > 0) {
					const place = event.place[0]; // Take first place
					
					if (currentLocationView === 'country') {
						// Use country coordinates
						coordinates = getCoordinatesByCountry(place.country);
						locationKey = place.country;
						locationName = place.country;
					} else {
						// Use city coordinates
						coordinates = getCoordinatesByCity(place.city);
						locationKey = place.city;
						locationName = `${place.city}, ${place.country}`;
					}
				}
				
				if (coordinates && coordinates.lat && coordinates.lon) {
					const key = `${locationKey}-${coordinates.lat},${coordinates.lon}`;
					
					if (!eventLocations.has(key)) {
						eventLocations.set(key, {
							coordinates: coordinates,
							locationName: locationName,
							events: []
						});
					}
					
					eventLocations.get(key).events.push({
						year,
						eventTitle,
						...event
					});
				}
			});
		});
	});
	
	// Add markers to map
	eventLocations.forEach((location, key) => {
		addEventMarker(location, eventsLayer);
	});
}

// Function to add event marker
function addEventMarker(location, layer) {
	const { coordinates, locationName, events } = location;
	
	// Create custom icon
	const customIcon = L.divIcon({
		className: 'custom-marker',
		html: `<div style="
			background: #667eea;
			color: white;
			border-radius: 50%;
			width: 25px;
			height: 25px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-weight: bold;
			font-size: 12px;
			border: 3px solid white;
			box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		">${events.length}</div>`,
		iconSize: [31, 31],
		iconAnchor: [15, 15]
	});
	
	const marker = L.marker([coordinates.lat, coordinates.lon], {
		icon: customIcon,
		eventData: events[0]
	}).addTo(layer);
	
	// Create popup with detailed information
	const popupContent = createPopupContent(locationName, events);
	marker.bindPopup(popupContent, {
		maxWidth: 450,
		className: 'custom-popup'
	});
	
	// Add tooltip
	marker.bindTooltip(`${locationName} - ${events.length} evento(s)`, {
		permanent: false,
		direction: 'top'
	});
	 // Adjuntar listeners cuando se abre el popup
    marker.on('popupopen', (e) => {
        const popupElement = e.popup.getElement();
        // Pasar TODOS los eventos, no solo el primero
        attachPopupButtonListeners(popupElement, events);
    });
}

// Function to create popup content
function createPopupContent(locationName, events) {
    let content = `<div class="popup-container">`;
    
    events.forEach((event, index) => {
        const agency = Array.isArray(event.agency) ? event.agency.join(', ') : event.agency;
        const place = event.place && event.place.length > 0 ? event.place[0] : {};
        
        // ✅ Generar un ID único para cada evento
        const eventUniqueId = `event-${event.year}-${index}-${Date.now()}`;
        
        content += `
            <div class="event-header">
                <div class="event-title">${event.eventTitle}</div>
                <div class="event-meta">
                    <span>🏛️ ${agency}</span>
                    <span>📅 ${event.date}</span>
                    <span>🏢 ${event.type}</span>
                    <span>🌍 ${place.country || 'N/A'}</span>
                    <span>🏙️ ${place.city || 'N/A'}</span>
                </div>
            </div>
            
            <div class="presentations-section">
                <div class="presentations-title">📋 Presentaciones (${Object.keys(event.titles).length})</div>
                
                <!-- ✅ BOTONES DE ACCIÓN AQUÍ (justo después del título) -->
                <div class="action-buttons-container" style="margin-bottom: 15px;">
                    <button class="btn btn-primary add-presentation-btn" 
                            data-event-id="${eventUniqueId}"
                            data-event-title="${event.eventTitle.replace(/"/g, '&quot;')}"
                            style="flex: 1;">
                        ➕ Nueva Presentación
                    </button>
                    <button class="btn btn-outline-secondary edit-event-btn" 
                            data-event-id="${eventUniqueId}"
                            data-event-title="${event.eventTitle.replace(/"/g, '&quot;')}"
                            style="flex: 1;">
                        ✏️ Editar Evento
                    </button>
                </div>
        `;
        
        Object.keys(event.titles).forEach(titleKey => {
            event.titles[titleKey].forEach(presentation => {
                const language = Array.isArray(presentation.language) 
                    ? presentation.language.join(', ') 
                    : presentation.language;
                
                content += `
                    <div class="presentation-item">
                        <div class="presentation-title">${titleKey}</div>
                        
                        <div class="speakers-list">
                            ${presentation.speakers.map(speaker => `
                                <div class="speaker-item">
                                    <div class="speaker-name">👤 ${speaker.speaker}</div>
                                    <div class="speaker-details">${speaker.country_s}${speaker.agency_s ? ` - ${speaker.agency_s}` : ''}</div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="presentation-meta">
                            <div>🌐 Idioma: ${language}</div>
                            ${presentation.URL_document ? `<div>🔗 <a href="${presentation.URL_document}" target="_blank" class="url-link">Ver documento</a></div>` : ''}
                            ${presentation.observations ? `<div>📝 ${presentation.observations}</div>` : ''}
                        </div>
                    </div>
                `;
            });
        });
        
        content += `</div>`; // Cierra presentations-section
        
        // Separador entre eventos (si hay más de uno)
        if (index < events.length - 1) {
            content += `<hr style="margin: 20px 0; border: 1px solid #eee;">`;
        }
    });
    
    content += `</div>`; // Cierra popup-container
    return content;
}

/**
 * IMPORTANTE: Agregar esta función DESPUÉS de createPopupContent
 * Adjunta event listeners a los botones del popup
 */
function attachPopupButtonListeners(popupElement, eventsData) {
    if (!popupElement) return;
    
    // Buscar todos los botones en el popup
    const addPresentationBtns = popupElement.querySelectorAll('.add-presentation-btn');
    const editEventBtns = popupElement.querySelectorAll('.edit-event-btn');
    
    // Adjuntar listeners a cada botón de agregar presentación
    addPresentationBtns.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const eventTitle = btn.dataset.eventTitle;
            const eventData = eventsData[index]; // Obtener el evento correspondiente
            
            // Llamar a la función global de editor.js
            if (window.handleAddPresentationFromMapGlobal) {
                window.handleAddPresentationFromMapGlobal(eventData, eventTitle);
            }
        });
    });
    
    // Adjuntar listeners a cada botón de editar
    editEventBtns.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const eventTitle = btn.dataset.eventTitle;
            const eventData = eventsData[index];
            
            // Llamar a la función global de editor.js para editar
            if (window.handleEditEventFromMapGlobal) {
                window.handleEditEventFromMapGlobal(eventData, eventTitle);
            }
        });
    });
}

//SPEAKERS

// Function to display speakers on map
function displaySpeakersOnMap() {
	const speakerLocations = new Map();
	
	// Group by speaker countries
	Object.keys(eventsData).forEach(year => {
		Object.keys(eventsData[year]).forEach(eventTitle => {
			eventsData[year][eventTitle].forEach(event => {
				const agency = Array.isArray(event.agency) ? event.agency.join(', ') : event.agency;
				const place = event.place && event.place.length > 0 ? event.place[0] : {};
				
				Object.keys(event.titles).forEach(titleKey => {
					event.titles[titleKey].forEach(presentation => {
						const language = Array.isArray(presentation.language) ? presentation.language.join(', ') : presentation.language;
						
						presentation.speakers.forEach(speaker => {
							if (speaker.country_s && speaker.country_s.trim() !== '' && speaker.country_s !== '-') {
								const speakerCountry = speaker.country_s.trim();
								
								// Get coordinates for speaker country
								const coordinates = getCoordinatesByCountry(speakerCountry);
								
								if (coordinates) {
									if (!speakerLocations.has(speakerCountry)) {
										speakerLocations.set(speakerCountry, {
											country: speakerCountry,
											coordinates: coordinates,
											speakers: new Map()
										});
									}
									
									const location = speakerLocations.get(speakerCountry);
									const speakerKey = `${speaker.speaker}-${speaker.agency_s}`;
									
									if (!location.speakers.has(speakerKey)) {
										location.speakers.set(speakerKey, {
											...speaker,
											presentations: []
										});
									}
									
									location.speakers.get(speakerKey).presentations.push({
										presentationTitle: titleKey,
										eventTitle: eventTitle,
										eventDate: event.date,
										eventCountry: place.country,
										eventCity: place.city,
										eventType: event.type,
										language: language,
										url: presentation.URL_document,
										observations: presentation.observations,
										year: year
									});
								}
							}
						});
					});
				});
			});
		});
	});
	
	// Add speaker markers to map
	speakerLocations.forEach((location, country) => {
		if (location.coordinates) {
			addSpeakerMarker(location, speakersLayer);
		}
	});
}

// Function to add speaker marker
function addSpeakerMarker(location, layer) {
	const { coordinates, country, speakers } = location;
	const totalSpeakers = speakers.size;
	
	// Create custom icon for speakers
	const speakerIcon = L.divIcon({
		className: 'speaker-marker',
		html: `<div style="
			background: #28a745;
			color: white;
			border-radius: 50%;
			width: 25px;
			height: 25px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-weight: bold;
			font-size: 12px;
			border: 3px solid white;
			box-shadow: 0 2px 8px rgba(0,0,0,0.3);
		">${totalSpeakers}</div>`,
		iconSize: [31, 31],
		iconAnchor: [15, 15]
	});
	
	const marker = L.marker([coordinates.lat, coordinates.lon], {
		icon: speakerIcon
	}).addTo(layer);
	
	// Create popup with speaker information
	const popupContent = createSpeakerPopupContent(country, speakers);
	marker.bindPopup(popupContent, {
		maxWidth: 450,
		className: 'custom-popup'
	});
	
	// Add tooltip
	marker.bindTooltip(`${country} - ${totalSpeakers} speaker(s)`, {
		permanent: false,
		direction: 'top'
	});
}

// Function to create speaker popup content
function createSpeakerPopupContent(country, speakers) {
	let content = `<div class="popup-container">`;
	
	let speakerIndex = 0;
	speakers.forEach((speakerData, speakerKey) => {
		content += `
			<div class="speaker-header">
				<div class="speaker-name-main">👤 ${speakerData.speaker}</div>
				<div class="speaker-details-main">
					🌍 ${speakerData.country_s}${speakerData.agency_s ? ` - 🏢 ${speakerData.agency_s}` : ''}
				</div>
			</div>
			
			<div class="presentations-by-speaker">
				<div class="presentations-title">📋 Presentaciones (${speakerData.presentations.length})</div>
		`;
		
		speakerData.presentations.forEach(presentation => {
			content += `
				<div class="speaker-presentation-item">
					<div class="event-info-compact">
						<strong>📅 ${presentation.eventDate}</strong> - <strong>🌍 ${presentation.eventCountry}</strong><br>
						<strong>🏙️ ${presentation.eventCity}</strong><br>
						<strong>🎯 ${presentation.eventTitle}</strong>
					</div>
					
					<div class="presentation-title">📝 ${presentation.presentationTitle}</div>
					
					<div class="presentation-meta">
						<div>🌐 Idioma: ${presentation.language}</div>
						${presentation.url ? `<div>🔗 <a href="${presentation.url}" target="_blank" class="url-link">Ver documento</a></div>` : ''}
						${presentation.observations ? `<div>📝 ${presentation.observations}</div>` : ''}
					</div>
				</div>
			`;
		});
		
		content += `</div>`;
		
		speakerIndex++;
		if (speakerIndex < speakers.size) {
			content += `<hr style="margin: 20px 0; border: 1px solid #eee;">`;
		}
	});
	
	content += `</div>`;
	return content;
}

// LANGUAGE FUNCTIONS

// Function to display language filtered map
function displayLanguageFilteredMap() {
	if (!filterLanguage) return;
	
	const languageLocations = new Map();
	
	Object.keys(eventsData).forEach(year => {
		Object.keys(eventsData[year]).forEach(eventTitle => {
			eventsData[year][eventTitle].forEach(event => {
				Object.keys(event.titles).forEach(titleKey => {
					event.titles[titleKey].forEach(presentation => {
						const languages = Array.isArray(presentation.language) ? presentation.language : [presentation.language];
						
						// Check if this presentation contains the filtered language
						if (languages.some(lang => lang.toLowerCase() === filterLanguage.toLowerCase())) {
							let coordinates = null;
							let locationKey = '';
							let locationName = '';
							
							if (event.place && event.place.length > 0) {
								const place = event.place[0];
								
								// SIEMPRE usar coordenadas de país para languages
								coordinates = getCoordinatesByCountry(place.country);
								locationKey = place.country;
								locationName = place.country;
							}
							
							if (coordinates && coordinates.lat && coordinates.lon) {
								const key = `${locationKey}-${coordinates.lat},${coordinates.lon}`;
								
								if (!languageLocations.has(key)) {
									languageLocations.set(key, {
										coordinates: coordinates,
										locationName: locationName,
										language: filterLanguage,
										presentations: []
									});
								}
								
								languageLocations.get(key).presentations.push({
									year,
									eventTitle,
									presentationTitle: titleKey,
									language: languages.join(', '),
									presentation: presentation,
									event: event
								});
							}
						}
					});
				});
			});
		});
	});
	
	languageLocations.forEach((location, key) => {
		addLanguageMarker(location, languagesLayer);
	});
}

// Function to add language marker
function addLanguageMarker(location, layer) {
	const customIcon = L.divIcon({
		className: 'language-marker',
		html: `<div style="
			background: #6f42c1;
			color: white;
			border-radius: 50%;
			width: 30px;
			height: 30px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-weight: bold;
			font-size: 12px;
			border: 3px solid white;
			box-shadow: 0 3px 12px rgba(0,0,0,0.3);
		">${location.presentations.length}</div>`,
		iconSize: [36, 36],
		iconAnchor: [18, 18]
	});
	
	const marker = L.marker([location.coordinates.lat, location.coordinates.lon], {
		icon: customIcon
	}).addTo(layer);
	
	const popupContent = createLanguagePopupContent(location);
	marker.bindPopup(popupContent, {
		maxWidth: 500,
		className: 'custom-popup'
	});
	
	marker.bindTooltip(`${location.language} en ${location.locationName} - ${location.presentations.length} presentación(es)`, {
		permanent: false,
		direction: 'top'
	});
}

// Function to create language popup content
function createLanguagePopupContent(location) {
	let content = `<div class="popup-container">
		<div class="language-header">
			<div class="language-title">🗣️ Presentaciones en ${location.language}</div>
		</div>
	`;
	
	// Group presentations by event
	const eventGroups = new Map();
	
	location.presentations.forEach(presentation => {
		const eventKey = `${presentation.eventTitle}-${presentation.year}`;
		
		if (!eventGroups.has(eventKey)) {
			eventGroups.set(eventKey, {
				eventTitle: presentation.eventTitle,
				year: presentation.year,
				event: presentation.event,
				presentations: []
			});
		}
		
		eventGroups.get(eventKey).presentations.push(presentation);
	});
	
	// Display each event group
	let eventIndex = 0;
	eventGroups.forEach((eventGroup, eventKey) => {
		const place = eventGroup.event.place && eventGroup.event.place.length > 0 ? eventGroup.event.place[0] : {};
		const agency = Array.isArray(eventGroup.event.agency) ? eventGroup.event.agency.join(', ') : eventGroup.event.agency;
		
		content += `
			<div class="language-event-item">
				<div class="event-header">
					<div class="event-title">${eventGroup.eventTitle}</div>
					<div class="event-meta">
						<span>🏛️ ${agency}</span>
						<span>📅 ${eventGroup.event.date}</span>
						<span>🏢 ${eventGroup.event.type}</span>
						<span>🌍 ${place.country || 'N/A'}</span>
						<span>🏙️ ${place.city || 'N/A'}</span>
					</div>
				</div>
				
				<div class="presentations-section">
					<div class="presentations-title">📋 Presentaciones (${eventGroup.presentations.length})</div>
		`;
		
		// Display all presentations for this event
		eventGroup.presentations.forEach(presentation => {
			content += `
				<div class="presentation-item">
					<div class="presentation-title">${presentation.presentationTitle}</div>
					
					<div class="speakers-list">
						${presentation.presentation.speakers.map(speaker => `
							<div class="speaker-item">
								<div class="speaker-name">👤 ${speaker.speaker}</div>
								<div class="speaker-details">${speaker.country_s}${speaker.agency_s ? ` - ${speaker.agency_s}` : ''}</div>
							</div>
						`).join('')}
					</div>
					
					<div class="presentation-meta">
						<div>🌐 Idioma: ${presentation.language}</div>
						${presentation.presentation.URL_document ? `<div>🔗 <a href="${presentation.presentation.URL_document}" target="_blank" class="url-link">Ver documento</a></div>` : ''}
						${presentation.presentation.observations ? `<div>📝 ${presentation.presentation.observations}</div>` : ''}
					</div>
				</div>
			`;
		});
		
		content += `</div></div>`;
		
		eventIndex++;
		if (eventIndex < eventGroups.size) {
			content += `<hr style="margin: 20px 0; border: 1px solid #eee;">`;
		}
	});
	
	content += `</div>`;
	return content;
}

// AGENCY FUNCTIONS

// Function to display agency filtered map
function displayAgencyFilteredMap() {
	if (!filterAgency) return;
	
	const agencyLocations = new Map();
	
	Object.keys(eventsData).forEach(year => {
		Object.keys(eventsData[year]).forEach(eventTitle => {
			eventsData[year][eventTitle].forEach(event => {
				const agencies = Array.isArray(event.agency) ? event.agency : [event.agency];
				
				// Check if this event contains the filtered agency
				if (agencies.some(agency => agency.toLowerCase() === filterAgency.toLowerCase())) {
					let coordinates = null;
					let locationKey = '';
					let locationName = '';
					
					if (event.place && event.place.length > 0) {
						const place = event.place[0];

						// SIEMPRE usar coordenadas de país para languages
						coordinates = getCoordinatesByCountry(place.country);
						locationKey = place.country;
						locationName = place.country;
						}
							
						if (coordinates && coordinates.lat && coordinates.lon) {
							const key = `${locationKey}-${coordinates.lat},${coordinates.lon}`;
								
							if (!agencyLocations.has(key)) {
								agencyLocations.set(key, {
									coordinates: coordinates,
									locationName: locationName,
									agency: filterAgency,
									events: []
								});
							}
							agencyLocations.get(key).events.push({
								year,
								eventTitle,
								agency: filterAgency,
								...event
							});
					}
				}
			});
		});
	});
	
	agencyLocations.forEach((location, key) => {
		addAgencyMarker(location, agenciesLayer);
	});
}

// Function to add agency marker
function addAgencyMarker(location, layer) {
	const customIcon = L.divIcon({
		className: 'agency-marker',
		html: `<div style="
			background: #fd7e14;
			color: white;
			border-radius: 50%;
			width: 30px;
			height: 30px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-weight: bold;
			font-size: 12px;
			border: 3px solid white;
			box-shadow: 0 3px 12px rgba(0,0,0,0.3);
		">${location.events.length}</div>`,
		iconSize: [36, 36],
		iconAnchor: [18, 18]
	});
	
	const marker = L.marker([location.coordinates.lat, location.coordinates.lon], {
		icon: customIcon
	}).addTo(layer);
	
	const popupContent = createAgencyPopupContent(location);
	marker.bindPopup(popupContent, {
		maxWidth: 500,
		className: 'custom-popup'
	});
	
	marker.bindTooltip(`${location.agency} en ${location.locationName} - ${location.events.length} evento(s)`, {
		permanent: false,
		direction: 'top'
	});
}

// Function to create agency popup content
function createAgencyPopupContent(location) {
	let content = `<div class="popup-container">
		<div class="agency-header">
			<div class="agency-title">🏛️ ${location.agency}</div>
		</div>
	`;
	
	location.events.forEach((event, index) => {
		const place = event.place && event.place.length > 0 ? event.place[0] : {};
		
		content += `
			<div class="agency-event-item">
				<div class="event-header">
					<div class="event-title">${event.eventTitle}</div>
					<div class="event-meta">
						<span>📅 ${event.date}</span>
						<span>🏢 ${event.type}</span>
						<span>🌍 ${place.country || 'N/A'}</span>
						<span>🏙️ ${place.city || 'N/A'}</span>
					</div>
				</div>
				
				<div class="presentations-section">
					<div class="presentations-title">📋 Presentaciones (${Object.keys(event.titles).length})</div>
		`;
		
		Object.keys(event.titles).forEach(titleKey => {
			event.titles[titleKey].forEach(presentation => {
				const language = Array.isArray(presentation.language) ? presentation.language.join(', ') : presentation.language;
				
				content += `
					<div class="presentation-item">
						<div class="presentation-title">${titleKey}</div>
						
						<div class="speakers-list">
							${presentation.speakers.map(speaker => `
								<div class="speaker-item">
									<div class="speaker-name">👤 ${speaker.speaker}</div>
									<div class="speaker-details">${speaker.country_s}${speaker.agency_s ? ` - ${speaker.agency_s}` : ''}</div>
								</div>
							`).join('')}
						</div>
						
						<div class="presentation-meta">
							<div>🌐 Idioma: ${language}</div>
							${presentation.URL_document ? `<div>🔗 <a href="${presentation.URL_document}" target="_blank" class="url-link">Ver documento</a></div>` : ''}
							${presentation.observations ? `<div>📝 ${presentation.observations}</div>` : ''}
						</div>
					</div>
				`;
			});
		});
		
		content += `</div>`;
		
		if (index < location.events.length - 1) {
			content += `<hr style="margin: 20px 0; border: 1px solid #eee;">`;
		}
	});
	
	content += `</div>`;
	return content;
}

// MAIN FILTER FUNCTION 
function filterBy(type, value) {
	console.log(`Filtering by ${type}: ${value}`);
	
	// Reset all filters first
	filterLanguage = null;
	filterAgency = null;
	
	// Set the appropriate filter and view
	if (type === 'event') {
		currentView = 'events';
		currentLocationView = value; // 'country' or 'city'
	} else if (type === 'speaker') {
		currentView = 'speakers';
	} else if (type === 'lang') {
		currentView = 'language';
		filterLanguage = value;
	} else if (type === 'agc') {
		currentView = 'agency';
		filterAgency = value;
	}
	
	// Update the display
	displayCurrentView();
}

// Initialize application
document.addEventListener('DOMContentLoaded', async function() {
	// Inicializar mapa
	initMap();
	// Inicializar autenticación
	await initAuthButton();
	
	// Cargar datos
	await loadData();
	
	// Inicializar editor (solo si está autenticado)
	initEditor();
});

window.filterBy = filterBy;
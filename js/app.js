let map;
let eventsData = {};
let countriesGeoJSON = {};
let currentView = 'events'; // 'events', 'speakers', 'language', 'agency'
let currentLocationView = 'country'; // 'country' or 'city'
let filterLanguage = null; 
let filterAgency = null; 
let markersLayer;
let eventsLayer;
let speakersLayer;
let languagesLayer = L.layerGroup();
let agenciesLayer = L.layerGroup(); 


// Main Menu switching
document.querySelectorAll('.menu-item').forEach(button => {
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

// Initialize the map
function initMap() {
	map = L.map('map').setView([40.0, 0.0], 3);
	
	// Add base layer
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		attribution: '© OpenStreetMap contributors'
	}).addTo(map);
	
	// Initialize marker layers
	eventsLayer = L.layerGroup().addTo(map);
	speakersLayer = L.layerGroup();
	languagesLayer = L.layerGroup();
	agenciesLayer = L.layerGroup();
}

// Function to load data
async function loadData() {
	try {
		const response = await fetch('./datos_completos.json');
		const data = await response.json();
		
		eventsData = data.events;
		countriesGeoJSON = data.countriesGeoJSON;
		
		document.getElementById('loading').style.display = 'none';
		displayEventsOnMap();
		
	} catch (error) {
		console.error('Error loading data:', error);
	}
}

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

// Function to get coordinates by matching cityPais with city in GeoJSON
function getCoordinatesByCityPais(cityPais) {
	if (countriesGeoJSON && countriesGeoJSON.features) {
		const feature = countriesGeoJSON.features.find(f => 
			f.properties.city.toLowerCase() === cityPais.toLowerCase()
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

// Function to get coordinates by city name
function getCoordinatesByCity(cityName) {
	if (countriesGeoJSON && countriesGeoJSON.features) {
		const feature = countriesGeoJSON.features.find(f => 
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

// Function to get country name from GeoJSON by city
function getCountryByCity(cityName) {
	if (countriesGeoJSON && countriesGeoJSON.features) {
		const feature = countriesGeoJSON.features.find(f => 
			f.properties.city.toLowerCase() === cityName.toLowerCase()
		);
		if (feature) {
			return feature.properties.country;
		}
	}
	return null;
}

//Events

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
						// Use country from event and coordinates from cityPais match
						coordinates = getCoordinatesByCityPais(place.cityPais);
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
		icon: customIcon
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
}

// Function to create popup content
function createPopupContent(locationName, events) {
	let content = `<div class="popup-container">`;
	
	events.forEach((event, index) => {
		const agency = Array.isArray(event.agency) ? event.agency.join(', ') : event.agency;
		const place = event.place && event.place.length > 0 ? event.place[0] : {};
		
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
		
		if (index < events.length - 1) {
			content += `<hr style="margin: 20px 0; border: 1px solid #eee;">`;
		}
	});
	
	content += `</div>`;
	return content;
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
								let coordinates = null;
								if (countriesGeoJSON && countriesGeoJSON.features) {
									const feature = countriesGeoJSON.features.find(f => 
										f.properties.country.toLowerCase() === speakerCountry.toLowerCase()
									);
									if (feature) {
										coordinates = {
											lat: feature.geometry.coordinates[1],
											lon: feature.geometry.coordinates[0]
										};
									}
								}
								
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
								
								if (currentLocationView === 'country') {
									coordinates = getCoordinatesByCityPais(place.cityPais);
									locationKey = place.country;
									locationName = place.country;
								} else {
									coordinates = getCoordinatesByCity(place.city);
									locationKey = place.city;
									locationName = `${place.city}, ${place.country}`;
								}
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
						
						if (currentLocationView === 'country') {
							coordinates = getCoordinatesByCityPais(place.cityPais);
							locationKey = place.country;
							locationName = place.country;
						} else {
							coordinates = getCoordinatesByCity(place.city);
							locationKey = place.city;
							locationName = `${place.city}, ${place.country}`;
						}
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
document.addEventListener('DOMContentLoaded', function() {
	initMap();
	loadData();
});
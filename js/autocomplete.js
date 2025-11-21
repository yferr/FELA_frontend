/**
 * Autocomplete Module - Sistema de autocompletado con Nominatim
 */

import { CountriesAPI, CitiesAPI, AgenciesAPI, SpeakersAPI } from './api.js';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const DEBOUNCE_DELAY = 300; // ms

/**
 * Debounce helper
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * ====================================
 * NOMINATIM API
 * ====================================
 */

const NominatimAPI = {
    /**
     * Buscar país en Nominatim
     */
    async searchCountry(query) {
        try {
            const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
                params: {
                    country: query,
                    format: 'json',
                    addressdetails: 1,
                    limit: 5
                },
                headers: {
                    'Accept-Language': 'es,en'
                }
            });

            // Filtrar solo resultados de tipo country
            return response.data
                .filter(item => item.type === 'administrative' || item.class === 'boundary')
                .map(item => ({
                    name: item.display_name.split(',')[0].trim(),
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    display_name: item.display_name
                }));
        } catch (error) {
            console.error('Error searching country in Nominatim:', error);
            return [];
        }
    },

    /**
     * Buscar ciudad en Nominatim
     */
    async searchCity(cityQuery, countryName = '') {
        try {
            const params = {
                city: cityQuery,
                format: 'json',
                addressdetails: 1,
                limit: 10
            };

            if (countryName) {
                params.country = countryName;
            }

            const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
                params,
                headers: {
                    'Accept-Language': 'es,en'
                }
            });

            // Filtrar solo ciudades
            return response.data
                .filter(item => ['city', 'town', 'village', 'municipality'].includes(item.type))
                .map(item => ({
                    name: item.address.city || item.address.town || item.address.village || item.name,
                    country: item.address.country,
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    display_name: item.display_name
                }));
        } catch (error) {
            console.error('Error searching city in Nominatim:', error);
            return [];
        }
    }
};

/**
 * ====================================
 * CLASE AUTOCOMPLETE
 * ====================================
 */

export class Autocomplete {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            type: 'text', // 'country', 'city', 'agency', 'speaker'
            minChars: 1,
            onSelect: null,
            onCreate: null,
            allowCreate: false,
            searchLocal: true, // Buscar en BD local
            searchNominatim: false, // Buscar en Nominatim
            dependsOn: null, // Para ciudad que depende de país
            placeholder: '',
            ...options
        };

        this.resultsContainer = null;
        this.results = [];
        this.selectedIndex = -1;
        this.isLoading = false;

        this.init();
    }

    init() {
        // Crear contenedor de resultados
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-wrapper';
        this.input.parentNode.insertBefore(wrapper, this.input);
        wrapper.appendChild(this.input);

        this.resultsContainer = document.createElement('div');
        this.resultsContainer.className = 'autocomplete-results';
        this.resultsContainer.style.display = 'none';
        wrapper.appendChild(this.resultsContainer);

        // Event listeners
        this.input.addEventListener('input', debounce((e) => this.handleInput(e), DEBOUNCE_DELAY));
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.input.addEventListener('focus', (e) => this.handleFocus(e));
        
        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                this.hideResults();
            }
        });
    }

    async handleInput(e) {
        const query = e.target.value.trim();

        if (query.length < this.options.minChars) {
            this.hideResults();
            return;
        }

        this.isLoading = true;
        this.showLoading();

        let localResults = [];
        let nominatimResults = [];

        // Buscar en BD local
        if (this.options.searchLocal) {
            localResults = await this.searchLocal(query);
        }

        // Buscar en Nominatim
        if (this.options.searchNominatim) {
            nominatimResults = await this.searchNominatim(query);
        }

        // Combinar resultados
        this.results = this.combineResults(localResults, nominatimResults);

        this.isLoading = false;
        this.renderResults();
    }

    async searchLocal(query) {
        const type = this.options.type;

        try {
            if (type === 'country') {
                const response = await CountriesAPI.list(query);
                return response.success ? response.data.results || response.data : [];
            } else if (type === 'city') {
                const country = this.options.dependsOn ? this.options.dependsOn() : '';
                const response = await CitiesAPI.list(query, country);
                return response.success ? response.data.results || response.data : [];
            } else if (type === 'agency') {
                const response = await AgenciesAPI.list(query);
                return response.success ? response.data.results || response.data : [];
            } else if (type === 'speaker') {
                const response = await SpeakersAPI.list(query);
                return response.success ? response.data.results || response.data : [];
            }
        } catch (error) {
            console.error('Error searching local:', error);
        }

        return [];
    }

    async searchNominatim(query) {
        const type = this.options.type;

        if (type === 'country') {
            return await NominatimAPI.searchCountry(query);
        } else if (type === 'city') {
            const country = this.options.dependsOn ? this.options.dependsOn() : '';
            return await NominatimAPI.searchCity(query, country);
        }

        return [];
    }

    combineResults(localResults, nominatimResults) {
        const combined = [];

        // Agregar resultados locales primero
        localResults.forEach(item => {
            combined.push({
                type: 'local',
                data: item,
                display: this.formatLocalItem(item)
            });
        });

        // Agregar resultados de Nominatim que no estén en local
        nominatimResults.forEach(item => {
            const exists = localResults.some(local => 
                this.normalizeString(this.getItemName(local)) === this.normalizeString(item.name)
            );

            if (!exists) {
                combined.push({
                    type: 'nominatim',
                    data: item,
                    display: this.formatNominatimItem(item)
                });
            }
        });

        return combined;
    }

    formatLocalItem(item) {
        const type = this.options.type;

        if (type === 'country') {
            return `${item.country} 📍 ${item.lat}, ${item.lon}`;
        } else if (type === 'city') {
            return `${item.city}, ${item.country.country || item.country}`;
        } else if (type === 'agency') {
            return item.nombre;
        } else if (type === 'speaker') {
            return `${item.name} (${item.country_s.country || item.country_s})`;
        }

        return item.name || item.toString();
    }

    formatNominatimItem(item) {
        if (this.options.type === 'country') {
            return `${item.name} 🌍 (Nominatim)`;
        } else if (this.options.type === 'city') {
            return `${item.name}, ${item.country} 🌍 (Nominatim)`;
        }
        return item.display_name;
    }

    getItemName(item) {
        const type = this.options.type;

        if (type === 'country') {
            return item.country || item.name;
        } else if (type === 'city') {
            return item.city || item.name;
        } else if (type === 'agency') {
            return item.nombre || item.name;
        } else if (type === 'speaker') {
            return item.name;
        }

        return item.name || item.toString();
    }

    normalizeString(str) {
        return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    showLoading() {
        this.resultsContainer.innerHTML = '<div class="autocomplete-loading">Buscando...</div>';
        this.resultsContainer.style.display = 'block';
    }

    hideResults() {
        this.resultsContainer.style.display = 'none';
        this.selectedIndex = -1;
    }

    renderResults() {
        this.resultsContainer.innerHTML = '';

        if (this.results.length === 0) {
            // Opción para crear nuevo
            if (this.options.allowCreate && this.input.value.trim()) {
                const createItem = document.createElement('div');
                createItem.className = 'autocomplete-create';
                createItem.textContent = `➕ Crear "${this.input.value.trim()}"`;
                createItem.addEventListener('click', () => this.handleCreate());
                this.resultsContainer.appendChild(createItem);
            } else {
                const noResults = document.createElement('div');
                noResults.className = 'autocomplete-loading';
                noResults.textContent = 'No se encontraron resultados';
                this.resultsContainer.appendChild(noResults);
            }
        } else {
            this.results.forEach((result, index) => {
                const item = document.createElement('div');
                item.className = 'autocomplete-item';
                item.textContent = result.display;
                item.dataset.index = index;

                item.addEventListener('click', () => this.selectItem(index));
                item.addEventListener('mouseenter', () => {
                    this.selectedIndex = index;
                    this.updateSelection();
                });

                this.resultsContainer.appendChild(item);
            });

            // Opción para crear nuevo si no hay coincidencia exacta
            if (this.options.allowCreate) {
                const exactMatch = this.results.some(r => 
                    this.normalizeString(this.getItemName(r.data)) === 
                    this.normalizeString(this.input.value.trim())
                );

                if (!exactMatch) {
                    const createItem = document.createElement('div');
                    createItem.className = 'autocomplete-create';
                    createItem.textContent = `➕ Crear "${this.input.value.trim()}"`;
                    createItem.addEventListener('click', () => this.handleCreate());
                    this.resultsContainer.appendChild(createItem);
                }
            }
        }

        this.resultsContainer.style.display = 'block';
    }

    handleKeydown(e) {
        if (!this.resultsContainer.style.display || this.resultsContainer.style.display === 'none') {
            return;
        }

        const items = this.resultsContainer.querySelectorAll('.autocomplete-item');

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.updateSelection();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.updateSelection();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && this.selectedIndex < this.results.length) {
                    this.selectItem(this.selectedIndex);
                }
                break;
            case 'Escape':
                this.hideResults();
                break;
        }
    }

    handleFocus(e) {
        if (this.results.length > 0) {
            this.resultsContainer.style.display = 'block';
        }
    }

    updateSelection() {
        const items = this.resultsContainer.querySelectorAll('.autocomplete-item');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === this.selectedIndex);
        });
    }

    selectItem(index) {
        const result = this.results[index];
        
        if (this.options.onSelect) {
            this.options.onSelect(result.data, result.type);
        }

        this.input.value = this.getItemName(result.data);
        this.hideResults();
    }

    handleCreate() {
        if (this.options.onCreate) {
            this.options.onCreate(this.input.value.trim());
        }
        this.hideResults();
    }

    destroy() {
        if (this.resultsContainer) {
            this.resultsContainer.remove();
        }
    }
}

/**
 * Helper function para inicializar autocompletado rápido
 */
export function initAutocomplete(inputId, type, options = {}) {
    const input = document.getElementById(inputId);
    if (!input) {
        console.error(`Input ${inputId} not found`);
        return null;
    }

    return new Autocomplete(input, { type, ...options });
}
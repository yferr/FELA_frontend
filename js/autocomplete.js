/**
 * autocomplete.js
 *
 * Changes from previous version:
 *  - formatLocalItem(): agency uses 'name' (was 'nombre')
 *  - formatLocalItem(): speaker uses 'country' string directly (was 'country_s.country || country_s')
 *  - getItemName(): agency uses 'name' only (was 'nombre || name')
 *  - getItemName(): speaker country reads 'country' directly (was 'country_s')
 *  - All legacy fallbacks to old field names removed
 */
import axios from 'axios'
import { CountriesAPI, CitiesAPI, AgenciesAPI, SpeakersAPI } from './api.js';

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const DEBOUNCE_DELAY = 300;
const NOMINATIM_TIMEOUT = 5000;

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

const NominatimAPI = {
    async searchCountry(query) {
        try {
            const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
                params: { country: query, format: 'json', addressdetails: 1, limit: 5 },
                headers: { 'Accept-Language': 'es,en' },
                timeout: NOMINATIM_TIMEOUT
            });
            return response.data
                .filter(item =>
                    item.class === 'boundary' ||
                    item.type  === 'administrative' ||
                    item.type  === 'country' ||
                    (item.class === 'place' && item.type === 'country')
                )
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

    async searchCity(cityQuery, countryName = '') {
        try {
            const q = countryName ? `${cityQuery}, ${countryName}` : cityQuery;
            const params = { q, format: 'json', addressdetails: 1, limit: 10 };

            const response = await axios.get(`${NOMINATIM_BASE_URL}/search`, {
                params,
                headers: { 'Accept-Language': 'es,en' },
                timeout: NOMINATIM_TIMEOUT
            });

            const CITY_TYPES = new Set([
                'city', 'town', 'village', 'municipality', 'administrative'
            ]);

            return response.data
                .filter(item => CITY_TYPES.has(item.type) || item.class === 'place')
                .map(item => ({
                    name: item.address?.city  ||
                          item.address?.town  ||
                          item.address?.village ||
                          item.address?.municipality ||
                          item.name,
                    country: item.address?.country || countryName,
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    display_name: item.display_name
                }))
                .filter(item => item.name); // drop entries where name could not be resolved
        } catch (error) {
            console.error('Error searching city in Nominatim:', error);
            return [];
        }
    }
};

export class Autocomplete {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            type: 'text',
            minChars: 1,
            onSelect: null,
            onCreate: null,
            allowCreate: false,
            searchLocal: true,
            searchNominatim: false,
            dependsOn: null,
            placeholder: '',
            ...options
        };

        this.resultsContainer = null;
        this.results = [];
        this.selectedIndex = -1;
        this.isLoading = false;
        this._docClickHandler = null;

        this.init();
    }

    init() {
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-wrapper';
        this.input.parentNode.insertBefore(wrapper, this.input);
        wrapper.appendChild(this.input);

        this.resultsContainer = document.createElement('div');
        this.resultsContainer.className = 'autocomplete-results';
        this.resultsContainer.style.display = 'none';
        wrapper.appendChild(this.resultsContainer);

        this.input.addEventListener('input', debounce((e) => this.handleInput(e), DEBOUNCE_DELAY));
        this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
        this.input.addEventListener('focus', (e) => this.handleFocus(e));

        this._docClickHandler = (e) => {
            if (!wrapper.contains(e.target)) this.hideResults();
        };
        document.addEventListener('click', this._docClickHandler);
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

        if (this.options.searchLocal) localResults = await this.searchLocal(query);
        if (this.options.searchNominatim) nominatimResults = await this.searchNominatim(query);

        this.results = this.combineResults(localResults, nominatimResults);
        this.isLoading = false;
        this.renderResults();
    }

    async searchLocal(query) {
        const type = this.options.type;
        try {
            if (type === 'country') {
                const response = await CountriesAPI.list(query);
                return response.success ? (response.data.results || response.data) : [];
            } else if (type === 'city') {
                const country = this.options.dependsOn ? this.options.dependsOn() : '';
                const response = await CitiesAPI.list(query, country);
                return response.success ? (response.data.results || response.data) : [];
            } else if (type === 'agency') {
                const response = await AgenciesAPI.list(query);
                return response.success ? (response.data.results || response.data) : [];
            } else if (type === 'speaker') {
                const response = await SpeakersAPI.list(query);
                return response.success ? (response.data.results || response.data) : [];
            }
        } catch (error) {
            console.error('Error searching local:', error);
        }
        return [];
    }

    async searchNominatim(query) {
        const type = this.options.type;
        if (type === 'country') return await NominatimAPI.searchCountry(query);
        if (type === 'city') {
            const country = this.options.dependsOn ? this.options.dependsOn() : '';
            return await NominatimAPI.searchCity(query, country);
        }
        return [];
    }

    combineResults(localResults, nominatimResults) {
        const combined = [];

        localResults.forEach(item => {
            combined.push({
                type: 'local',
                data: item,
                display: this.formatLocalItem(item)
            });
        });

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

    // -----------------------------------------------------------------------
    // formatLocalItem — updated field names
    // -----------------------------------------------------------------------
    formatLocalItem(item) {
        const type = this.options.type;

        if (type === 'country') {
            return `${item.country} 📍 ${item.lat}, ${item.lon}`;
        } else if (type === 'city') {
            // city.country is now a nested object with .country string, or plain string
            const countryName = item.country?.country ?? item.country ?? '';
            return `${item.city}, ${countryName}`;
        } else if (type === 'agency') {
            // CHANGED: 'nombre' → 'name'
            return item.name;
        } else if (type === 'speaker') {
            // CHANGED: 'country_s.country || country_s' → 'country' (plain string from SpeakerDetailSerializer)
            return `${item.name} (${item.country ?? ''})`;
        }

        return item.name ?? item.toString();
    }

    formatNominatimItem(item) {
        if (this.options.type === 'country') return `${item.name} 🌍 (Nominatim)`;
        if (this.options.type === 'city') return `${item.name}, ${item.country} 🌍 (Nominatim)`;
        return item.display_name;
    }

    // -----------------------------------------------------------------------
    // getItemName — updated field names
    // -----------------------------------------------------------------------
    getItemName(item) {
        const type = this.options.type;

        if (type === 'country') {
            return item.country ?? item.name ?? '';
        } else if (type === 'city') {
            return item.city ?? item.name ?? '';
        } else if (type === 'agency') {
            // CHANGED: removed 'nombre' fallback — only 'name' exists now
            return item.name ?? '';
        } else if (type === 'speaker') {
            return item.name ?? '';
        }

        return item.name ?? item.toString();
    }

    normalizeString(str) {
        return String(str).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
        if (!this.resultsContainer.style.display || this.resultsContainer.style.display === 'none') return;

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
        if (this.results.length > 0) this.resultsContainer.style.display = 'block';
    }

    updateSelection() {
        const items = this.resultsContainer.querySelectorAll('.autocomplete-item');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === this.selectedIndex);
        });
    }

    selectItem(index) {
        const result = this.results[index];
        if (this.options.onSelect) this.options.onSelect(result.data, result.type);
        this.input.value = this.getItemName(result.data);
        this.hideResults();
    }

    handleCreate() {
        if (this.options.onCreate) this.options.onCreate(this.input.value.trim());
        this.hideResults();
    }

    destroy() {
        if (this._docClickHandler) {
            document.removeEventListener('click', this._docClickHandler);
            this._docClickHandler = null;
        }
        if (this.resultsContainer) this.resultsContainer.remove();
    }
}

export function initAutocomplete(inputId, type, options = {}) {
    const input = document.getElementById(inputId);
    if (!input) {
        console.error(`Input ${inputId} not found`);
        return null;
    }
    return new Autocomplete(input, { type, ...options });
}

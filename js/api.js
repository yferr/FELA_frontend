
import axios from 'axios';
import {getApiBaseUrl} from './settings.js';

/**
 * API Module - Wrapper para todas las llamadas HTTP al backend Django
 * CSRF token dinámico en cada petición
 */

//const API_BASE_URL = 'http://localhost:8888';
//const API_BASE_URL = 'https://gisserver.car.upv.es/fela_api';

var API_BASE_URL=getApiBaseUrl();

/**
 * Obtener token CSRF de las cookies
 */
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

/**
 * Función que se llama dinámicamente en cada petición
 * Configuración de axios con credenciales y CSRF
 */
function getAxiosConfig() {
    const csrfToken = getCookie('csrftoken');
    
    // Debug: Mostrar token en consola
    if (csrfToken) {
        console.log('🔑 CSRF Token encontrado:', csrfToken.substring(0, 20) + '...');
    } else {
        console.warn('⚠️ CSRF Token no encontrado en cookies');
    }
    
    return {
        withCredentials: true,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken || ''
        }
    };
}

/**
 * Manejo centralizado de errores
 */
function handleAPIError(error, customMessage = 'Error en la operación') {
    console.error('API Error:', error);
    
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
            return { success: false, error: 'No autorizado. Por favor inicia sesión.' };
        } else if (status === 403) {
            // Mejorar mensaje de error CSRF
            if (data.detail && data.detail.includes('CSRF')) {
                return { success: false, error: 'Error de seguridad (CSRF). Recarga la página e intenta nuevamente.' };
            }
            return { success: false, error: 'No tienes permisos para esta acción.' };
        } else if (status === 404) {
            return { success: false, error: 'Recurso no encontrado.' };
        } else if (status === 400 && data) {
            const errorMessages = Object.entries(data)
                .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
                .join('\n');
            return { success: false, error: errorMessages, details: data };
        }
        
        return { 
            success: false, 
            error: data.detail || data.error || customMessage,
            details: data 
        };
    } else if (error.request) {
        return { 
            success: false, 
            error: 'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.' 
        };
    } else {
        return { success: false, error: error.message };
    }
}

/**
 * ====================================
 * AUTENTICACIÓN
 * ====================================
 */

export const AuthAPI = {
    /**
     * Obtener token CSRF y esperar respuesta
     */
    async getCSRFToken() {
        try {
            console.log('📡 Solicitando CSRF token...');
            await axios.get(`${API_BASE_URL}/auth/csrf/`, getAxiosConfig());
            
            // Verificar que se creó la cookie
            const token = getCookie('csrftoken');
            if (token) {
                console.log('✅ CSRF token obtenido correctamente');
                return { success: true, token };
            } else {
                console.warn('⚠️ CSRF token no encontrado después de la petición');
                return { success: false, error: 'No se pudo obtener el token CSRF' };
            }
        } catch (error) {
            return handleAPIError(error, 'Error al obtener token CSRF');
        }
    },

    /**
     * Login con CSRF token
     */
    async login(username, password) {
        try {
            console.log('📡 Intentando login...');
            const response = await axios.post(
                `${API_BASE_URL}/auth/login/`,
                { username, password },
                getAxiosConfig()  // ✅ Llamar función dinámicamente
            );
            console.log('✅ Login exitoso');
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al iniciar sesión');
        }
    },

    /**
     * Registro
     */
    async register(userData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/auth/register/`,
                userData,
                getAxiosConfig()  // ✅ Llamar función dinámicamente
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al registrarse');
        }
    },

    /**
     * Logout con CSRF token
     */
    async logout() {
        try {
            console.log('📡 Intentando logout...');
            await axios.post(
                `${API_BASE_URL}/auth/logout/`, 
                {}, 
                getAxiosConfig()  // ✅ Llamar función dinámicamente
            );
            console.log('✅ Logout exitoso');
            return { success: true };
        } catch (error) {
            return handleAPIError(error, 'Error al cerrar sesión');
        }
    },

    /**
     * Obtener usuario actual
     */
    async getCurrentUser() {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/auth/user/`, 
                getAxiosConfig()  // ✅ Llamar función dinámicamente
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener usuario');
        }
    }
};

/**
 * ====================================
 * PAÍSES
 * ====================================
 */

export const CountriesAPI = {
    async list(search = '') {
        try {
            const url = search 
                ? `${API_BASE_URL}/FELA/countries/?search=${encodeURIComponent(search)}`
                : `${API_BASE_URL}/FELA/countries/`;
            
            const response = await axios.get(url, getAxiosConfig());
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar países');
        }
    },

    async get(countryName) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/countries/${encodeURIComponent(countryName)}/`,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener país');
        }
    },

    async create(countryData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/countries/`,
                countryData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear país');
        }
    }
};

/**
 * ====================================
 * CIUDADES
 * ====================================
 */

export const CitiesAPI = {
    async list(search = '', country = '') {
        try {
            let url = `${API_BASE_URL}/FELA/cities/?`;
            if (search) url += `search=${encodeURIComponent(search)}&`;
            if (country) url += `country=${encodeURIComponent(country)}`;
            
            const response = await axios.get(url, getAxiosConfig());
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar ciudades');
        }
    },

    async create(cityData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/cities/`,
                cityData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear ciudad');
        }
    }
};

/**
 * ====================================
 * AGENCIAS
 * ====================================
 */

export const AgenciesAPI = {
    async list(search = '') {
        try {
            const url = search 
                ? `${API_BASE_URL}/FELA/agencies/?search=${encodeURIComponent(search)}`
                : `${API_BASE_URL}/FELA/agencies/`;
            
            const response = await axios.get(url, getAxiosConfig());
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar agencias');
        }
    },

    async create(agencyData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/agencies/`,
                agencyData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear agencia');
        }
    }
};

/**
 * ====================================
 * SPEAKERS
 * ====================================
 */

export const SpeakersAPI = {
    async list(nameQuery = '', country = '') {
        try {
            let url = `${API_BASE_URL}/FELA/speakers/?`;
            if (nameQuery) url += `search=${encodeURIComponent(nameQuery)}&`;
            if (country) url += `country=${encodeURIComponent(country)}`;
            
            const response = await axios.get(url, getAxiosConfig());
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar speakers');
        }
    },

    async create(speakerData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/speakers/`,
                speakerData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear speaker');
        }
    }
};

/**
 * ====================================
 * PRESENTATIONS API
 * ====================================
 */

export const PresentationsAPI = {
    async list(filters = {}) {
        try {
            let url = `${API_BASE_URL}/FELA/presentations/?`;
            
            if (filters.search) url += `search=${encodeURIComponent(filters.search)}&`;
            if (filters.event_id) url += `event_id=${filters.event_id}&`;
            if (filters.event_title) url += `event_title=${encodeURIComponent(filters.event_title)}&`;
            if (filters.speaker_id) url += `speaker_id=${filters.speaker_id}&`;
            if (filters.language) url += `language=${encodeURIComponent(filters.language)}&`;
            
            const response = await axios.get(url, getAxiosConfig());
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar presentaciones');
        }
    },

    async search(query) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/presentations/search/?title=${encodeURIComponent(query)}`,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al buscar presentaciones');
        }
    },

    async get(presentationId) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/presentations/${presentationId}/`,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener presentación');
        }
    },

    async create(presentationData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/presentations/`,
                presentationData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear presentación');
        }
    },

    async update(presentationId, presentationData) {
        try {
            const response = await axios.put(
                `${API_BASE_URL}/FELA/presentations/${presentationId}/`,
                presentationData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al actualizar presentación');
        }
    },

    async delete(presentationId) {
        try {
            await axios.delete(
                `${API_BASE_URL}/FELA/presentations/${presentationId}/`,
                getAxiosConfig()
            );
            return { success: true };
        } catch (error) {
            return handleAPIError(error, 'Error al eliminar presentación');
        }
    },

    async addSpeaker(presentationId, speakerId) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/presentation-speakers/`,
                {
                    presentation_id: presentationId,
                    speaker_id: speakerId
                },
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al agregar ponente a presentación');
        }
    },

    async removeSpeaker(presentationId, speakerId) {
        try {
            await axios.delete(
                `${API_BASE_URL}/FELA/presentation-speakers/${presentationId}-${speakerId}/`,
                getAxiosConfig()
            );
            return { success: true };
        } catch (error) {
            return handleAPIError(error, 'Error al eliminar ponente de presentación');
        }
    }
};

/**
 * ====================================
 * EVENTOS
 * ====================================
 */

export const EventsAPI = {
    async list(filters = {}) {
        try {
            let url = `${API_BASE_URL}/FELA/events/?`;
            
            if (filters.search) url += `search=${encodeURIComponent(filters.search)}&`;
            if (filters.year) url += `year=${filters.year}&`;
            if (filters.country) url += `country=${encodeURIComponent(filters.country)}&`;
            if (filters.type) url += `type=${encodeURIComponent(filters.type)}&`;
            
            const response = await axios.get(url, getAxiosConfig());
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar eventos');
        }
    },

    async get(eventId) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/events/${eventId}/`,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener evento');
        }
    },

    async getWithDetails(eventId) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/events/${eventId}/`,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener evento con detalles');
        }
    },

    async createComplete(eventData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/events/create-complete/`,
                eventData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear evento completo');
        }
    },

    async update(eventId, eventData) {
        try {
            const response = await axios.put(
                `${API_BASE_URL}/FELA/events/${eventId}/`,
                eventData,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al actualizar evento');
        }
    },

    async delete(eventId) {
        try {
            await axios.delete(
                `${API_BASE_URL}/FELA/events/${eventId}/`,
                getAxiosConfig()
            );
            return { success: true };
        } catch (error) {
            return handleAPIError(error, 'Error al eliminar evento');
        }
    }
};

/**
 * ====================================
 * GEOJSON
 * ====================================
 */

export const GeoJSONAPI = {
    async getComplete() {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/geojson/`,
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener GeoJSON');
        }
    },

    async refresh() {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/geojson/refresh/`,
                {},
                getAxiosConfig()
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al refrescar GeoJSON');
        }
    }
};

/**
 * ====================================
 * UTILIDADES
 * ====================================
 */

export const Utils = {
    async checkAuth() {
        const result = await AuthAPI.getCurrentUser();
        return result.success;
    },

    async getUserInfo() {
        return await AuthAPI.getCurrentUser();
    }
};
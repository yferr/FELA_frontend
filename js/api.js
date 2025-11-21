/**
 * API Module - Wrapper para todas las llamadas HTTP al backend Django
 */

const API_BASE_URL = 'http://localhost:8888';

/**
 * Configuración de axios con credenciales

const axiosConfig = {
    withCredentials: true, // Importante para sesiones
    headers: {
        'Content-Type': 'application/json',
    }
}; */

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
 * Configuración de axios con credenciales y CSRF
 */
function getAxiosConfig() {
    const csrfToken = getCookie('csrftoken');
    return {
        withCredentials: true,
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken || ''
        }
    };
}

const axiosConfig = getAxiosConfig();

/**
 * Manejo centralizado de errores
 */
function handleAPIError(error, customMessage = 'Error en la operación') {
    console.error('API Error:', error);
    
    if (error.response) {
        // El servidor respondió con error
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
            return { success: false, error: 'No autorizado. Por favor inicia sesión.' };
        } else if (status === 403) {
            return { success: false, error: 'No tienes permisos para esta acción.' };
        } else if (status === 404) {
            return { success: false, error: 'Recurso no encontrado.' };
        } else if (status === 400 && data) {
            // Errores de validación del backend
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
        // La petición se hizo pero no hubo respuesta
        return { 
            success: false, 
            error: 'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.' 
        };
    } else {
        // Error al configurar la petición
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
     * Obtener token CSRF
     */
    async getCSRFToken() {
        try {
            await axios.get(`${API_BASE_URL}/auth/csrf/`, getAxiosConfig);
            return { success: true };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener token CSRF');
        }
    },

    /**
     * Login
     */
    async login(username, password) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/auth/login/`,
                { username, password },
                getAxiosConfig
            );
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
                getAxiosConfig
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al registrarse');
        }
    },

    /**
     * Logout
     */
    async logout() {
        try {
            await axios.post(`${API_BASE_URL}/auth/logout/`, {}, getAxiosConfig);
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
            const response = await axios.get(`${API_BASE_URL}/auth/user/`, getAxiosConfig);
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
    /**
     * Listar países con búsqueda
     */
    async list(search = '') {
        try {
            const url = search 
                ? `${API_BASE_URL}/FELA/countries/?search=${encodeURIComponent(search)}`
                : `${API_BASE_URL}/FELA/countries/`;
            
            const response = await axios.get(url, getAxiosConfig);
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar países');
        }
    },

    /**
     * Obtener país por nombre
     */
    async get(countryName) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/countries/${encodeURIComponent(countryName)}/`,
                getAxiosConfig
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener país');
        }
    },

    /**
     * Crear país
     */
    async create(countryData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/countries/`,
                countryData,
                getAxiosConfig
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
    /**
     * Listar ciudades con filtros
     */
    async list(search = '', country = '') {
        try {
            let url = `${API_BASE_URL}/FELA/cities/?`;
            if (search) url += `search=${encodeURIComponent(search)}&`;
            if (country) url += `country=${encodeURIComponent(country)}`;
            
            const response = await axios.get(url, getAxiosConfig);
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar ciudades');
        }
    },

    /**
     * Crear ciudad
     */
    async create(cityData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/cities/`,
                cityData,
                getAxiosConfig
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
    /**
     * Listar agencias con búsqueda
     */
    async list(search = '') {
        try {
            const url = search 
                ? `${API_BASE_URL}/FELA/agencies/?search=${encodeURIComponent(search)}`
                : `${API_BASE_URL}/FELA/agencies/`;
            
            const response = await axios.get(url, getAxiosConfig);
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar agencias');
        }
    },

    /**
     * Crear agencia
     */
    async create(agencyData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/agencies/`,
                agencyData,
                getAxiosConfig
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
    /**
     * Listar speakers con búsqueda
     */
    async list(search = '', country = '') {
        try {
            let url = `${API_BASE_URL}/FELA/speakers/?`;
            if (search) url += `search=${encodeURIComponent(search)}&`;
            if (country) url += `country=${encodeURIComponent(country)}`;
            
            const response = await axios.get(url, getAxiosConfig);
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar speakers');
        }
    },

    /**
     * Crear speaker
     */
    async create(speakerData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/speakers/`,
                speakerData,
                getAxiosConfig
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear speaker');
        }
    }
};

/**
 * ====================================
 * EVENTOS
 * ====================================
 */

export const EventsAPI = {
    /**
     * Listar eventos con filtros
     */
    async list(filters = {}) {
        try {
            let url = `${API_BASE_URL}/FELA/events/?`;
            
            if (filters.search) url += `search=${encodeURIComponent(filters.search)}&`;
            if (filters.year) url += `year=${filters.year}&`;
            if (filters.country) url += `country=${encodeURIComponent(filters.country)}&`;
            if (filters.type) url += `type=${encodeURIComponent(filters.type)}&`;
            
            const response = await axios.get(url, getAxiosConfig);
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al listar eventos');
        }
    },

    /**
     * Obtener evento por ID
     */
    async get(eventId) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/events/${eventId}/`,
                getAxiosConfig
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener evento');
        }
    },

    /**
     * Crear evento completo (con presentaciones y speakers)
     */
    async createComplete(eventData) {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/events/create-complete/`,
                eventData,
                getAxiosConfig
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al crear evento completo');
        }
    },

    /**
     * Actualizar evento
     */
    async update(eventId, eventData) {
        try {
            const response = await axios.put(
                `${API_BASE_URL}/FELA/events/${eventId}/`,
                eventData,
                getAxiosConfig
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al actualizar evento');
        }
    },

    /**
     * Eliminar evento (solo superusuarios)
     */
    async delete(eventId) {
        try {
            await axios.delete(
                `${API_BASE_URL}/FELA/events/${eventId}/`,
                getAxiosConfig
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
    /**
     * Obtener GeoJSON completo
     */
    async getComplete() {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/FELA/geojson/`,
                getAxiosConfig
            );
            return { success: true, data: response.data };
        } catch (error) {
            return handleAPIError(error, 'Error al obtener GeoJSON');
        }
    },

    /**
     * Refrescar caché del GeoJSON
     */
    async refresh() {
        try {
            const response = await axios.post(
                `${API_BASE_URL}/FELA/geojson/refresh/`,
                {},
                getAxiosConfig
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
    /**
     * Verificar si el usuario está autenticado
     */
    async checkAuth() {
        const result = await AuthAPI.getCurrentUser();
        return result.success;
    },

    /**
     * Obtener información del usuario actual
     */
    async getUserInfo() {
        return await AuthAPI.getCurrentUser();
    }
};
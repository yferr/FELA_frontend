const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_BASE_URL_APP = import.meta.env.VITE_API_BASE_URL_APP;

export function getApiBaseUrl() {
    return API_BASE_URL;
}
export function getApiBaseUrlApp() {
    return API_BASE_URL_APP;
}

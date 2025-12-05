var MODE = 1 //MODE 2 para produccion, 1 para desarrollo
var API_BASE_URL=""
var API_BASE_URL_APP=""

if (MODE === 1) {
    console.log("Running in DEVELOPMENT mode");
    API_BASE_URL="http://localhost:8888"
    API_BASE_URL_APP='http://localhost:8888/FELA'
} else {
    API_BASE_URL = 'https://gisserver.car.upv.es/fela_api';
    API_BASE_URL_APP = 'https://gisserver.car.upv.es/fela_api/FELA';
}

export function getApiBaseUrl() {
    return API_BASE_URL;
}
export function getApiBaseUrlApp() {
    return API_BASE_URL_APP;
}   
Uso node 24.11.1 Para ejecutarme en modo desarrollo: nvm use 24.11.1 npm install npm run dev

Para compilarme npm run build -base=fela

Para cambiar la url de la api hay que modificar los siguiente:

const API_BASE_URL = 'https://gisserver.car.upv.es/fela_api/FELA';
en los ficheros js/api.js y js/app.js
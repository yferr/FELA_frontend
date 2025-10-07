const fs = require('fs');
const path = require('path');

// Función para limpiar texto (eliminar espacios y saltos de línea al inicio y final)
function cleanText(text) {
  if (!text) return '';
  return text.toString().replace(/^\s+|\s+$/g, '').replace(/\n|\r/g, '');
}

// Función para procesar campos separados por comas
function processCommaSeparatedField(field) {
  if (!field || cleanText(field) === '') return [];
  return cleanText(field)
    .split(',')
    .map(item => cleanText(item))
    .filter(item => item !== ''); // Eliminar elementos vacíos
}

// Función para leer y parsear CSV
function parseCSV(filePath, delimiter = ';') {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.trim().split('\n');
    const headers = lines[0].split(delimiter).map(h => cleanText(h));
    
    const result = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] ? cleanText(values[index]) : '';
      });
      result.push(row);
    }
    return result;
  } catch (error) {
    console.error(`Error leyendo archivo ${filePath}:`, error);
    return [];
  }
}

// Función para crear GeoJSON de países
function createCountriesGeoJSON(countriesData) {
  return {
    type: "FeatureCollection",
    features: countriesData.map(country => ({
      type: "Feature",
      properties: {
        country: cleanText(country.country),
        city: cleanText(country.city)
      },
      geometry: {
        type: "Point",
        coordinates: [
          parseFloat(cleanText(country.lon)), // longitude primero en GeoJSON
          parseFloat(cleanText(country.lat))  // latitude segundo
        ]
      }
    }))
  };
}

// Función para procesar speakers y crear lookup
function createSpeakersLookup(speakersData) {
  const lookup = {};
  speakersData.forEach(speaker => {
    lookup[cleanText(speaker.speakers)] = {
      speaker: cleanText(speaker.name),
      country_s: cleanText(speaker.country_s),
      agency_s: cleanText(speaker.agency_s)
    };
  });
  return lookup;
}

// Función principal para procesar todos los datos
function processEventData(eventosPath, paisesPath, speakersPath) {
  // Leer los archivos CSV
  const eventos = parseCSV(eventosPath);
  const paises = parseCSV(paisesPath);
  const speakers = parseCSV(speakersPath);
  
  // Crear lookup de speakers
  const speakersLookup = createSpeakersLookup(speakers);
  
  // Crear GeoJSON de países
  const countriesGeoJSON = createCountriesGeoJSON(paises);
  
  // Crear lookup de coordenadas por país
  /*
  const countryCoords = {};
  paises.forEach(country => {
    const countryName = cleanText(country.country);
    countryCoords[countryName] = {
      lat: parseFloat(cleanText(country.lat)),
      lon: parseFloat(cleanText(country.lon))
    };
  });
  const cityCoords = {};
  paises.forEach(country=>{;
    const cityName = cleanText(country.city);
    cityCoords[cityName] = {
      lat: parseFloat(cleanText(country.lat)),
      lon: parseFloat(cleanText(country.lon))
    };
  }); */
  
  // Procesar eventos con nueva estructura
  const result = {};
  
  eventos.forEach(evento => {
    const year = cleanText(evento.year);
    const eventTitle = cleanText(evento.event_title);
    const title = cleanText(evento.title);
    //const countryName = cleanText(evento.country);
    // Procesar agencies como array
    const agencies = processCommaSeparatedField(evento.agency);

    // Inicializar año si no existe
    if (!result[year]) {
      result[year] = {};
    }
    
    // Inicializar evento si no existe
    if (!result[year][eventTitle]) {
      result[year][eventTitle] = [{
        date: cleanText(evento.date),
        type: cleanText(evento.type),
        agency: agencies,
        place: [{
          country: cleanText(evento.country),
          city: cleanText(evento.city),
          cityPais: cleanText(evento.cityPais)
        }],
        titles: {}
      }];
    }
    
    // Procesar speakers (pueden ser múltiples números separados por comas)
    let speakersInfo = [];
    if (evento.speakers && cleanText(evento.speakers) !== '') {
      const speakerNumbers = cleanText(evento.speakers).split(',').map(s => cleanText(s));
      speakersInfo = speakerNumbers.map(num => {
        return speakersLookup[num] || {
          speaker: 'Speaker no encontrado',
          country_s: '',
          agency_s: ''
        };
      });
    }
    
    // Procesar languages como array
    const languages = processCommaSeparatedField(evento.language);

    // Buscar el evento existente para este año y título de evento
    const eventIndex = result[year][eventTitle].findIndex(e => 
      e.country === cleanText(evento.country) && e.date === cleanText(evento.date)
    );
    
    const targetEvent = eventIndex !== -1 ? result[year][eventTitle][eventIndex] : result[year][eventTitle][0];
    
    // Inicializar el título si no existe
    if (!targetEvent.titles[title]) {
      targetEvent.titles[title] = [];
    }
    
    // Agregar información del título
    targetEvent.titles[title].push({
      speakers: speakersInfo,
      language: languages,
      URL_document: cleanText(evento.URL_document),
      observations: cleanText(evento.Observations || '')
    });
  });
  
  return {
    events: result,
    countriesGeoJSON: countriesGeoJSON
  };
}

// Función para guardar los resultados
function saveResults(data, outputPath) {
  try {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`Datos guardados en: ${outputPath}`);
  } catch (error) {
    console.error('Error guardando archivo:', error);
  }
}

// Ejemplo de uso
function main() {
  // Rutas a tus archivos CSV
  const basePath = 'C:\\Users\\Yadira\\Desktop\\practicasNOVA\\codigo';
  const eventosPath = path.join(basePath, 'eventos2.csv');
  const paisesPath = path.join(basePath, 'paises.csv');
  const speakersPath = path.join(basePath, 'speakers0.csv');
  
  // Procesar los datos
  const result = processEventData(eventosPath, paisesPath, speakersPath);
  
  // Mostrar resultado en consola (opcional)
  console.log('Estructura de eventos:', JSON.stringify(result.events, null, 2));
  
  // Guardar archivos separados
  saveResults(result.events, path.join(basePath, 'eventos_procesados.json'));
  saveResults(result.countriesGeoJSON, path.join(basePath, 'paises.geojson'));
  
  // Guardar todo junto
  saveResults(result, path.join(basePath, 'datos_completos.json'));
  
  return result;
}

// Ejecutar
if (require.main === module) {
  main();
}

module.exports = {
  processEventData,
  parseCSV,
  createCountriesGeoJSON,
  createSpeakersLookup
};
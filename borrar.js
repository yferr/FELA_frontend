const fs = require("fs");

// ✅ Cargar directamente la raíz (los años están en la raíz del objeto)
const data = JSON.parse(fs.readFileSync("eventos_procesados.json", "utf-8"));
const events = data;

let totalEventos = 0;
const eventosPorAnio = {};
const eventosPorContinente = {
  América: 0,
  Europa: 0,
  Asia: 0,
  África: 0,
  Oceanía: 0
};
const organismos = {};
const ponentes = {};
const paisesPonentes = {};
const eventosPorPaisPonente = {};
const lenguajes = {};

const paisesContinente = {
  USA: "América", Brazil: "América", Mexico: "América", Chile: "América",
  Argentina: "América", Barbados: "América", "Republica Dominicana": "América",
  Canada: "América", France: "Europa", Belgium: "Europa", Spain: "Europa",
  Netherlands: "Europa", Poland: "Europa", Germany: "Europa", Slovenia: "Europa",
  Latvia: "Europa", "United Kingdom": "Europa", Sweden: "Europa",
  Australia: "Oceanía", Fiji: "Oceanía",
  China: "Asia", Japan: "Asia", Singapore: "Asia", Indonesia: "Asia",
  Nepal: "Asia", Malaysia: "Asia", Armenia: "Asia", "Saudi Arabia": "Asia",
  India: "Asia", "Sri Lanka": "Asia",
  Ghana: "África", Chad: "África", Rwanda: "África", Kenya: "África",
  "Democratic Republic of Congo": "África", Egypt: "África",
  Nigeria: "África", Morocco: "África"
};

for (const year in events) {
  eventosPorAnio[year] = 0;

  for (const eventKey in events[year]) {
    for (const e of events[year][eventKey]) {
      totalEventos++;
      eventosPorAnio[year]++;

      // Lugar del evento
      e.place.forEach(p => {
        const pais = p.country;
        const continente = paisesContinente[pais];
        if (continente) eventosPorContinente[continente]++;
      });

      // Organismos
      e.agency.forEach(org => {
        organismos[org] = (organismos[org] || 0) + 1;
      });

      // Ponencias y ponentes
      for (const key in e.titles) {
        e.titles[key].forEach(ponencia => {
          ponencia.speakers.forEach(s => {
            const nombre = s.speaker.trim(",");
            ponentes[nombre] = (ponentes[nombre] || 0) + 1;

            const pais = s.country_s;
            if (pais !== "-") {
              if (!paisesPonentes[pais]) paisesPonentes[pais] = new Set();
              paisesPonentes[pais].add(nombre);
              eventosPorPaisPonente[pais] = (eventosPorPaisPonente[pais] || 0) + 1;
            }
          });

          ponencia.language.forEach(lang => {
            const idioma = lang.toLowerCase();
            lenguajes[idioma] = (lenguajes[idioma] || 0) + 1;
          });
        });
      }
    }
  }
}

// Top 5 ponentes
const topPonentes = Object.entries(ponentes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// Top 5 países por ponentes únicos
const topPaisesPonentes = Object.entries(paisesPonentes)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 10)
  .map(([pais, set]) => [pais, set.size]);

// Top 5 países por cantidad de ponencias
const topPaisesPorEventos = Object.entries(eventosPorPaisPonente)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

// Porcentaje de idiomas
const totalPonencias = Object.values(lenguajes).reduce((a, b) => a + b, 0);
const porcentajeIdiomas = {};
for (const idioma in lenguajes) {
  porcentajeIdiomas[idioma] = ((lenguajes[idioma] / totalPonencias) * 100).toFixed(2) + "%";
}

// Mostrar resultados
console.log("✅ Total de eventos:", totalEventos);
console.log("📅 Eventos por año:", eventosPorAnio);
console.log("🌍 Eventos por continente:", eventosPorContinente);
console.log("🏢 Organismos organizadores:", organismos);
console.log("🧑‍🏫 Top 5 ponentes:", topPonentes);
console.log("🌐 Top países por ponentes únicos:", topPaisesPonentes);
console.log("🌐 Top países por eventos (ponencias):", topPaisesPorEventos);
console.log("🗣️ Porcentaje por idioma:", porcentajeIdiomas);

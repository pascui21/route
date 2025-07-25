document.addEventListener('DOMContentLoaded', () => {
    // --- Variabili globali e Chiavi API ---
    const cityInput = document.getElementById('city-input');
    const getWeatherBtn = document.getElementById('get-weather-btn');
    const weatherResults = document.getElementById('weather-results');

    const startPointInput = document.getElementById('start-point');
    const endPointInput = document.getElementById('end-point');
    const getRouteWeatherBtn = document.getElementById('get-route-weather-btn');
    const mapElement = document.getElementById('map');

    const METEOSOURCE_API_KEY = '2xam02eqjgdv6ehg61mqvdxt46dgj8dmqqfuti10';
    const Maps_API_KEY = 'AIzaSyDcTncbLroGBItEXYAyXU45j2rgisiYi_E'; // Inserita direttamente nello script HTML

    let map;
    let directionsService;
    let directionsRenderer;
    const markers = []; // Per tenere traccia dei marker meteo sulla mappa

    // --- Funzione di inizializzazione della mappa (chiamata automaticamente da Google Maps) ---
    // Deve essere nel global scope o allegata a window
    window.initMap = function() {
        map = new google.maps.Map(mapElement, {
            zoom: 7,
            center: { lat: 41.9028, lng: 12.4964 } // Centro iniziale (es. Roma)
        });

        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({ map: map });

        // Aggiungi listener per la ricerca per singola città
        getWeatherBtn.addEventListener('click', () => {
            const city = cityInput.value.trim();
            if (city) {
                getWeatherForCity(city);
            } else {
                weatherResults.innerHTML = '<p class="error">Per favore, inserisci il nome di una città.</p>';
            }
        });

        // Aggiungi listener per la ricerca del percorso meteo
        getRouteWeatherBtn.addEventListener('click', calculateAndDisplayRoute);
    };


    // --- Funzione per ottenere le previsioni per una singola città (già presente) ---
    async function getWeatherForCity(city) {
        weatherResults.innerHTML = '<p>Caricamento previsioni per città...</p>';
        try {
            // Passo 1: Trovare le coordinate della città
            const findPlacesResponse = await fetch(`https://www.meteosource.com/api/v1/web/find_places?text=${encodeURIComponent(city)}&key=${METEOSOURCE_API_KEY}`);
            if (!findPlacesResponse.ok) {
                throw new Error(`Errore API Meteosource (Find Places)! status: ${findPlacesResponse.status}`);
            }
            const placesData = await findPlacesResponse.json();

            if (placesData && placesData.length > 0) {
                const place = placesData[0];
                const lat = place.lat;
                const lon = place.lon;
                const originalCityName = place.name; // Nome normalizzato

                // Passo 2: Ottenere le previsioni meteo usando le coordinate
                const pointDataResponse = await fetch(`https://www.meteosource.com/api/v1/web/point_data?lat=${lat}&lon=${lon}&sections=current%2Cdaily&language=it&units=metric&key=${METEOSOURCE_API_KEY}`);
                if (!pointDataResponse.ok) {
                    throw new Error(`Errore API Meteosource (Point Data)! status: ${pointDataResponse.status}`);
                }
                const weatherData = await pointDataResponse.json();
                displayWeather(weatherData, originalCityName);
            } else {
                throw new Error('Città non trovata. Controlla il nome e riprova.');
            }
        } catch (error) {
            console.error('Errore nel recupero delle previsioni per città:', error);
            weatherResults.innerHTML = `<p class="error">Errore: ${error.message}</p>`;
        }
    }

    // --- Funzione per visualizzare le previsioni per singola città ---
    function displayWeather(data, originalCity) {
        if (!data || !data.current || !data.daily) {
            weatherResults.innerHTML = '<p class="error">Dati meteo non disponibili per questa città.</p>';
            return;
        }

        const current = data.current;
        const daily = data.daily.data;

        let html = `<h2>Previsioni per ${originalCity.charAt(0).toUpperCase() + originalCity.slice(1)}</h2>`;

        html += `
            <h3>Attuale</h3>
            <p>Temperatura: ${current.temperature}°C</p>
            <p>Percepita: ${current.feels_like}°C</p>
            <p>Condizioni: ${current.summary}</p>
            <p>Umidità: ${current.humidity}%</p>
            <p>Velocità vento: ${current.wind.speed} m/s</p>
            <p>Pressione: ${current.pressure} hPa</p>
        `;

        if (daily && daily.length > 0) {
            html += `<h3>Prossimi Giorni</h3>`;
            for (let i = 0; i < Math.min(daily.length, 3); i++) {
                const day = daily[i];
                const date = new Date(day.day).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
                html += `
                    <div style="margin-bottom: 10px; padding: 10px; border: 1px solid #eee; border-radius: 5px;">
                        <p><strong>${date}</strong></p>
                        <p>Temperatura Max: ${day.all_day.temperature_max}°C</p>
                        <p>Temperatura Min: ${day.all_day.temperature_min}°C</p>
                        <p>Condizioni: ${day.all_day.summary}</p>
                    </div>
                `;
            }
        }
        weatherResults.innerHTML = html;
    }


    // --- Nuove Funzioni per il Percorso e la Mappa ---

    async function calculateAndDisplayRoute() {
        // Pulisci i marker precedenti dalla mappa
        clearMarkers();
        directionsRenderer.setDirections({ routes: [] }); // Pulisci il percorso precedente

        const start = startPointInput.value.trim();
        const end = endPointInput.value.trim();

        if (!start || !end) {
            alert('Per favore, inserisci sia il punto di partenza che quello di arrivo.');
            return;
        }

        try {
            const request = {
                origin: start,
                destination: end,
                travelMode: google.maps.TravelMode.DRIVING // OTHERS: WALKING, BICYCLING, TRANSIT
            };

            const response = await directionsService.route(request);
            if (response.status === 'OK') {
                directionsRenderer.setDirections(response);
                const route = response.routes[0];
                const path = route.overview_path; // Array di LatLng del percorso

                await getWeatherDataAlongRoute(path);

            } else {
                alert('Impossibile calcolare il percorso: ' + response.status);
                console.error('Directions service failed:', response.status);
            }
        } catch (error) {
            console.error('Errore nel calcolo del percorso:', error);
            alert('Si è verificato un errore nel calcolo del percorso. Riprova.');
        }
    }

    async function getWeatherDataAlongRoute(path) {
        // Seleziona un sottoinsieme di punti lungo il percorso per non fare troppe chiamate API
        const numPoints = 10; // Quanti punti campione vuoi lungo il percorso
        const step = Math.floor(path.length / numPoints);
        const pointsToQuery = [];

        for (let i = 0; i < path.length; i += step) {
            pointsToQuery.push(path[i]);
            if (pointsToQuery.length >= numPoints) break;
        }
        // Assicurati di includere il punto finale se non è già stato incluso
        if (!pointsToQuery.includes(path[path.length - 1])) {
             pointsToQuery.push(path[path.length - 1]);
        }


        // Effettua le chiamate API Meteosource per ogni punto
        const weatherPromises = pointsToQuery.map(async (point) => {
            const lat = point.lat();
            const lon = point.lng();
            try {
                const response = await fetch(`https://www.meteosource.com/api/v1/web/point_data?lat=${lat}&lon=${lon}&sections=current&language=it&units=metric&key=${METEOSOURCE_API_KEY}`);
                if (!response.ok) {
                    // Non bloccare tutto se una singola richiesta fallisce
                    console.warn(`Errore nel recupero meteo per ${lat},${lon}: ${response.status}`);
                    return null;
                }
                const data = await response.json();
                return { lat: lat, lon: lon, data: data.current };
            } catch (error) {
                console.error(`Errore fetch meteo per ${lat},${lon}:`, error);
                return null;
            }
        });

        const weatherResultsArray = await Promise.all(weatherPromises);
        displayWeatherMarkers(weatherResultsArray.filter(Boolean)); // Filtra i risultati nulli
    }

    function displayWeatherMarkers(results) {
        clearMarkers(); // Pulisci i marker precedenti

        results.forEach(result => {
            if (result && result.data) {
                const latLng = new google.maps.LatLng(result.lat, result.lon);
                const weather = result.data;

                const contentString = `
                    <div class="weather-info-box">
                        <h4>Previsioni qui</h4>
                        <p>Temp: ${weather.temperature}°C</p>
                        <p>Condizioni: ${weather.summary}</p>
                        <p>Vento: ${weather.wind.speed} m/s</p>
                    </div>
                `;

                const infoWindow = new google.maps.InfoWindow({
                    content: contentString,
                });

                const marker = new google.maps.Marker({
                    position: latLng,
                    map: map,
                    title: weather.summary,
                    icon: {
                        url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png', // Un'icona semplice
                        scaledSize: new google.maps.Size(30, 30) // Regola la dimensione se necessario
                    }
                });

                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });

                markers.push(marker); // Aggiungi il marker all'array per poterlo pulire in seguito
            }
        });
    }

    function clearMarkers() {
        for (let i = 0; i < markers.length; i++) {
            markers[i].setMap(null);
        }
        markers.length = 0; // Svuota l'array
    }

    // Nota: window.initMap è chiamata automaticamente dall'API di Google Maps.
    // Non devi chiamarla tu direttamente nel DOMContentLoaded.
    // Il resto del tuo codice qui sotto è legato a DOMContentLoaded
    // ma `initMap` viene gestita in modo diverso dall'API di Google.
    // Ho spostato i listeners dentro `initMap` per assicurare che la mappa sia pronta.
});
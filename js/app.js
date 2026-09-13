// ============================================
// Kıyafet Toptancısı Bulucu — B2B Radar & CRM
// ============================================

var map;
var placesService;
var infoWindow;
var markers = [];
var searchCircle = null;
var centerMarker = null;

var allPlaces = [];
var currentSorted = [];
var selectedLatLng = null;

var directionsService = null;
var directionsRenderer = null;
var routePlaces = [];
var waTemplateText = localStorage.getItem('waTemplateText') || "Merhaba, e-ticaret sitenizi saniyeler içinde kuran sistemimizle dijitalleşmenize yardımcı olmak isteriz. Müsait olduğunuzda görüşebilir miyiz?";

// State ve Filtreler
var crmData = JSON.parse(localStorage.getItem('kiyafet_crm_data')) || {};
var filterOpenNow = false;
var filterMinRating = 0;
var showFavoritesOnly = false;
var currentSearchCenter = null;
var currentSearchRadius = 10000;
var backgroundEnrichTimer = null;
var coordsMap = {};

var SEARCH_KEYWORDS = [
    'toptan giyim',
    'tekstil toptancısı',
    'kıyafet toptancısı',
    'toptan tekstil',
    'konfeksiyon toptan',
    'toptan kumaş',
    'toptan kadın giyim',
    'toptan erkek giyim',
    'toptan çocuk giyim',
    'toptan triko',
    'toptan iç giyim'
];

var NEGATIVE_KEYWORDS = [
    'biber', 'baharat', 'süt', 'gıda', 'peynir', 'et', 'kasap', 'manav', 'sebze', 'meyve',
    'market', 'bakkal', 'süpermarket', 'hırdavat', 'inşaat', 'oto', 'otomotiv', 'yedek parça',
    'lastik', 'medikal', 'eczane', 'kırtasiye', 'ambalaj', 'plastik', 'tarım', 'gübre', 'yem',
    'temizlik', 'deterjan', 'unlu mamül', 'fırın', 'pastane', 'kuruyemiş', 'tatlı', 'lokanta',
    'restoran', 'restaurant', 'cafe', 'kafe', 'döner', 'kebap', 'pide', 'çorbacı', 'köfte',
    'kuyumcu', 'altın', 'emlak', 'mobilya', 'marangoz', 'demir doğrama', 'sigorta', 'avukat',
    'turizm', 'otel', 'pansiyon', 'pansiyonu', 'veteriner', 'pet shop', 'kuaför', 'berber'
];

var NEGATIVE_TYPES = [
    'restaurant', 'food', 'grocery_or_supermarket', 'bakery', 'meal_takeaway', 'meal_delivery',
    'cafe', 'bar', 'liquor_store', 'car_repair', 'car_dealer', 'pharmacy', 'gas_station',
    'supermarket', 'convenience_store', 'lodging'
];

// --- Hava Durumu & Döviz Kuru API'leri ---
window.updateWeather = function(lat, lng, label) {
    var weatherEl = document.getElementById('weather-info');
    if (weatherEl) weatherEl.innerText = label + ': Yükleniyor...';
    
    var cityBtnText = document.getElementById('city-search-text');
    if (cityBtnText) {
        cityBtnText.innerText = (label === 'Konumunuz' || label === 'Seçilen Konum') 
            ? 'Şehirdeki Tümünü Bul' 
            : label + ' Tümünü Bul';
    }

    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&current_weather=true')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.current_weather && weatherEl) {
                var temp = data.current_weather.temperature;
                weatherEl.innerText = label + ': ' + temp + ' °C';
            }
        }).catch(function(e) {
            if (weatherEl) weatherEl.innerText = 'Hava Durumu: Alınamadı';
        });
};

function initDashboardApis() {
    fetch('https://open.er-api.com/v6/latest/USD')
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data && data.rates) {
                var usd = data.rates.TRY.toFixed(2);
                var eur = (data.rates.TRY / data.rates.EUR).toFixed(2);
                var usdEl = document.getElementById('usd-rate');
                var eurEl = document.getElementById('eur-rate');
                if (usdEl) usdEl.innerText = 'USD: ₺' + usd;
                if (eurEl) eurEl.innerText = 'EUR: ₺' + eur;
            }
        }).catch(function(e) { console.log('Kur hatası', e); });

    window.updateWeather(38.4237, 27.1428, 'İzmir');
}

// --- Koordinat ve Mesafe Yardımcıları ---
function safeLatLng(location) {
    if (!location) return null;
    if (typeof location.lat === 'function') {
        return { lat: location.lat(), lng: location.lng() };
    }
    if (typeof location.lat === 'number' && typeof location.lng === 'number') {
        return { lat: location.lat, lng: location.lng };
    }
    return null;
}

function storeCoords(placeId, location) {
    var loc = safeLatLng(location);
    if (loc) {
        coordsMap[placeId] = loc;
    }
}

function getCoords(placeId) {
    if (coordsMap[placeId]) return coordsMap[placeId];
    var place = allPlaces.find(function(p) { return p.place_id === placeId; });
    if (place && place.geometry && place.geometry.location) {
        var loc = safeLatLng(place.geometry.location);
        if (loc) {
            coordsMap[placeId] = loc;
            return loc;
        }
    }
    return null;
}

function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371; // km
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// --- Harita Başlat ---
function initMap() {
    var izmir = { lat: 38.4237, lng: 27.1428 };
    map = new google.maps.Map(document.getElementById('map'), {
        center: izmir,
        zoom: 12,
        mapTypeId: 'roadmap',
        styles: [
            { elementType: 'geometry', stylers: [{ color: '#1a1f2c' }] },
            { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2c' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
            { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#e2e8f0' }] },
            { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
            { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#162032' }] },
            { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3441' }] },
            { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#334155' }] },
            { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
            { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2c3e50' }] },
            { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
            { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
            { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a3441' }] },
            { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
            { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3b82f6' }] },
            { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2c' }] }
        ],
        disableDefaultUI: false
    });

    placesService = new google.maps.places.PlacesService(map);
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        map: map,
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 5 }
    });
    infoWindow = new google.maps.InfoWindow();

    map.addListener('click', function(e) {
        selectedLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        var input = document.getElementById('address-input');
        if (input) input.value = "Seçilen Konum: " + selectedLatLng.lat.toFixed(4) + ", " + selectedLatLng.lng.toFixed(4);
        
        var searchBtn = document.getElementById('search-btn');
        var searchCityBtn = document.getElementById('search-city-btn');
        if (searchBtn) searchBtn.disabled = false;
        if (searchCityBtn) searchCityBtn.disabled = false;
        
        if (window.updateWeather) window.updateWeather(selectedLatLng.lat, selectedLatLng.lng, 'Seçilen Konum');

        if (centerMarker) centerMarker.setMap(null);
        centerMarker = new google.maps.Marker({
            position: selectedLatLng,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#ef4444',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
            },
            title: 'Arama Merkezi'
        });
    });

    initAutocomplete();
    initEventListeners();
    initCrmFeatures();
}

// --- Autocomplete Başlat ---
function initAutocomplete() {
    var input = document.getElementById('address-input');
    if (!input) return;
    var autocomplete = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: 'tr' }
    });

    autocomplete.addListener('place_changed', function () {
        var place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
            alert('Lütfen listeden geçerli bir adres seçin.');
            return;
        }

        selectedLatLng = {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng()
        };
        
        var city = "Seçilen Konum";
        if (place.address_components) {
            for (var i = 0; i < place.address_components.length; i++) {
                if (place.address_components[i].types.includes('administrative_area_level_1')) {
                    city = place.address_components[i].long_name;
                    break;
                }
            }
        }
        
        var searchBtn = document.getElementById('search-btn');
        var searchCityBtn = document.getElementById('search-city-btn');
        if (searchBtn) searchBtn.disabled = false;
        if (searchCityBtn) searchCityBtn.disabled = false;
        
        if (window.updateWeather) window.updateWeather(selectedLatLng.lat, selectedLatLng.lng, city);

        map.setCenter(selectedLatLng);
        map.setZoom(14);
        
        if (centerMarker) centerMarker.setMap(null);
        centerMarker = new google.maps.Marker({
            position: selectedLatLng,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#ef4444',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
            },
            title: 'Arama Merkezi'
        });
    });
}

// --- Event Listeners ---
function initEventListeners() {
    var searchBtn = document.getElementById('search-btn');
    var searchCityBtn = document.getElementById('search-city-btn');
    var radiusSlider = document.getElementById('radius-slider');
    var radiusValue = document.getElementById('radius-value');
    var locateBtn = document.getElementById('locate-btn');
    var addressInput = document.getElementById('address-input');
    var sortSelect = document.getElementById('sort-select');
    var exportBtn = document.getElementById('export-btn');
    var filterOpen = document.getElementById('filter-open');
    var filterRating = document.getElementById('filter-rating');
    var favoritesToggle = document.getElementById('favorites-toggle');

    if (radiusSlider && radiusValue) {
        radiusSlider.addEventListener('input', function () {
            radiusValue.textContent = this.value + ' km';
        });
    }

    // Mevcut Konumumu Kullan Butonu
    if (locateBtn) {
        locateBtn.addEventListener('click', function () {
            if (navigator.geolocation) {
                locateBtn.classList.add('locating');
                navigator.geolocation.getCurrentPosition(function (position) {
                    locateBtn.classList.remove('locating');
                    selectedLatLng = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    if (addressInput) addressInput.value = "Mevcut Konumunuz";
                    if (searchBtn) searchBtn.disabled = false;
                    if (searchCityBtn) searchCityBtn.disabled = false;
                    
                    if (window.updateWeather) window.updateWeather(selectedLatLng.lat, selectedLatLng.lng, 'Konumunuz');

                    map.setCenter(selectedLatLng);
                    map.setZoom(14);
                    
                    if (centerMarker) centerMarker.setMap(null);
                    centerMarker = new google.maps.Marker({
                        position: selectedLatLng,
                        map: map,
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 8,
                            fillColor: '#ef4444',
                            fillOpacity: 1,
                            strokeColor: '#ffffff',
                            strokeWeight: 2
                        },
                        title: 'Arama Merkezi'
                    });
                }, function (err) {
                    locateBtn.classList.remove('locating');
                    alert('Konum alınamadı: ' + (err.message || 'Lütfen tarayıcı izinlerini kontrol edin.'));
                }, { enableHighAccuracy: true, timeout: 10000 });
            } else {
                alert('Tarayıcınız konum özelliğini desteklemiyor.');
            }
        });
    }

    // Arama Butonu
    if (searchBtn) {
        searchBtn.addEventListener('click', function () {
            if (!selectedLatLng) {
                alert('Lütfen önce arama merkezini belirleyin.');
                return;
            }
            var radius = parseInt(radiusSlider ? radiusSlider.value : 10) * 1000;
            startSearch(selectedLatLng.lat, selectedLatLng.lng, radius);
        });
    }

    // Şehirdeki Tümünü Bul Butonu (50km)
    if (searchCityBtn) {
        searchCityBtn.addEventListener('click', function () {
            if (!selectedLatLng) {
                alert('Lütfen önce arama merkezini belirleyin.');
                return;
            }
            if (radiusSlider && radiusValue) {
                radiusSlider.value = 50;
                radiusValue.textContent = '50 km';
            }
            startSearch(selectedLatLng.lat, selectedLatLng.lng, 50000);
        });
    }

    // Arama Kutusunda Enter'a basıldığında
    if (addressInput) {
        addressInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedLatLng && searchBtn && !searchBtn.disabled) {
                    searchBtn.click();
                }
            }
        });
    }

    // Sıralama Değişimi
    if (sortSelect) {
        sortSelect.addEventListener('change', function () {
            applyFiltersAndRender();
        });
    }

    // CSV Dışa Aktarma
    if (exportBtn) {
        exportBtn.addEventListener('click', function () {
            exportCSV(currentSorted.length ? currentSorted : allPlaces);
        });
    }

    // Filtreler: Şu An Açık
    if (filterOpen) {
        filterOpen.addEventListener('change', function () {
            filterOpenNow = this.checked;
            applyFiltersAndRender();
        });
    }

    // Filtreler: 4+ Yıldız
    if (filterRating) {
        filterRating.addEventListener('change', function () {
            filterMinRating = this.checked ? 4 : 0;
            applyFiltersAndRender();
        });
    }

    // Filtreler: Favorilerim
    if (favoritesToggle) {
        favoritesToggle.addEventListener('click', function () {
            showFavoritesOnly = !showFavoritesOnly;
            favoritesToggle.classList.toggle('active', showFavoritesOnly);
            applyFiltersAndRender();
        });
    }
}


// --- Arama Başlat (Anında Render & Arka Planda Zenginleştirme) ---
function startSearch(lat, lng, radius) {
    showLoading(true);
    clearAll();
    if (backgroundEnrichTimer) clearTimeout(backgroundEnrichTimer);

    currentSearchCenter = { lat: lat, lng: lng };
    currentSearchRadius = radius;

    var center = new google.maps.LatLng(lat, lng);

    drawSearchCircle(center, radius);
    addCenterMarker({ lat: lat, lng: lng });

    var allResults = [];
    var keywordIndex = 0;
    var keywords = SEARCH_KEYWORDS.slice();
    var isSearchFinished = false;

    // Arama güvenlik zamanlayıcısı (Maksimum 35 saniye)
    var searchWatchdog = setTimeout(function() {
        if (!isSearchFinished) {
            isSearchFinished = true;
            processResults(allResults, lat, lng, radius);
        }
    }, 35000);

    function runNextKeyword() {
        if (isSearchFinished) return;

        if (keywordIndex >= keywords.length) {
            isSearchFinished = true;
            clearTimeout(searchWatchdog);
            processResults(allResults, lat, lng, radius);
            return;
        }

        var keyword = keywords[keywordIndex];
        updateLoadingText('Toptancılar taranıyor (' + (keywordIndex + 1) + ' / ' + keywords.length + ')...');

        var request = {
            location: center,
            radius: radius,
            keyword: keyword
        };
        
        var pageCount = 0;

        function processPage(results, status, pagination) {
            if (isSearchFinished) return;

            if ((status === "OK" || (window.google && google.maps && google.maps.places && google.maps.places.PlacesServiceStatus && status === google.maps.places.PlacesServiceStatus.OK)) && results) {
                allResults = allResults.concat(results);
                pageCount++;

                if (pagination && pagination.hasNextPage && pageCount < 2) {
                    setTimeout(function() {
                        pagination.nextPage();
                    }, 2000);
                } else {
                    keywordIndex++;
                    setTimeout(runNextKeyword, 250);
                }
            } else if ((status === "OVER_QUERY_LIMIT" || (window.google && google.maps && google.maps.places && google.maps.places.PlacesServiceStatus && status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT))) {
                setTimeout(function() {
                    if (pagination && pagination.hasNextPage) {
                        pagination.nextPage();
                    } else {
                        placesService.nearbySearch(request, processPage);
                    }
                }, 1500);
            } else {
                keywordIndex++;
                setTimeout(runNextKeyword, 250);
            }
        }

        placesService.nearbySearch(request, processPage);
    }

    runNextKeyword();
}

// --- Mesafe ve Kategori Filtresi ---
function isTextilePlace(place) {
    if (!place || !place.name) return false;
    var nameLower = place.name.toLowerCase('tr');
    
    // Negatif kelime kontrolü
    for (var i = 0; i < NEGATIVE_KEYWORDS.length; i++) {
        if (nameLower.includes(NEGATIVE_KEYWORDS[i])) {
            return false;
        }
    }

    // Negatif Google Maps tür kontrolü (Eğer giyim/tekstil türü yoksa ve negatif tür varsa ele)
    if (place.types && Array.isArray(place.types)) {
        var hasClothingType = place.types.some(function(t) {
            return t === 'clothing_store' || t === 'store' || t === 'wholesaler' || t === 'home_goods_store';
        });
        var hasNegativeType = place.types.some(function(t) {
            return NEGATIVE_TYPES.includes(t);
        });
        if (hasNegativeType && !hasClothingType) {
            return false;
        }
    }

    return true;
}

function filterPlacesByRadius(places, centerLat, centerLng, radiusInMeters) {
    if (!places) return [];
    var maxKm = radiusInMeters ? (radiusInMeters / 1000) * 1.4 : 50;
    
    return places.filter(function(place) {
        try {
            // Tekstil / Kıyafet uygunluğu kontrolü
            if (!isTextilePlace(place)) {
                return false;
            }

            // Mesafe kontrolü
            if (radiusInMeters && centerLat && centerLng) {
                if (!place.geometry || !place.geometry.location) return true;
                var loc = safeLatLng(place.geometry.location);
                if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return true;
                var dist = haversine(centerLat, centerLng, loc.lat, loc.lng);
                return dist <= maxKm;
            }
            return true;
        } catch(e) {
            return true;
        }
    });
}

// --- Tekrarları Kaldır ---
function deduplicatePlaces(places) {
    var seen = {};
    var unique = [];
    for (var i = 0; i < places.length; i++) {
        if (places[i] && places[i].place_id && !seen[places[i].place_id]) {
            seen[places[i].place_id] = true;
            unique.push(places[i]);
        }
    }
    return unique;
}

// --- Sonuçları İşle ---
function processResults(rawResults, centerLat, centerLng, radius) {
    try {
        var uniquePlaces = deduplicatePlaces(rawResults);
        var nearbyPlaces = filterPlacesByRadius(uniquePlaces, centerLat, centerLng, radius);

        // Koordinatları hafızaya al
        nearbyPlaces.forEach(function(place) {
            if (place.geometry && place.geometry.location) {
                storeCoords(place.place_id, place.geometry.location);
            }
        });

        allPlaces = nearbyPlaces;
        showLoading(false);

        if (allPlaces.length === 0) {
            showNoResults();
            return;
        }

        // Listele ve Haritaya dök
        applyFiltersAndRender();

        // Arka planda sessizce telefon ve web sitelerini zenginleştir
        enrichPlacesInBackground(allPlaces);

    } catch(err) {
        console.error('İşleme hatası:', err);
        showLoading(false);
        showNoResults();
    }
}

// --- Arka Planda Sessizce Telefon ve Detay Zenginleştirici ---
function enrichPlacesInBackground(places) {
    var queue = places.slice(0, 50); // İlk 50 yeri öncelikli zenginleştir
    var enrichIndex = 0;

    function processNextEnrich() {
        if (enrichIndex >= queue.length) return;

        var place = queue[enrichIndex];
        if (place.formatted_phone_number && place.website) {
            enrichIndex++;
            processNextEnrich();
            return;
        }

        placesService.getDetails({
            placeId: place.place_id,
            fields: ['formatted_phone_number', 'international_phone_number', 'website', 'opening_hours', 'url']
        }, function (details, status) {
            if ((status === "OK" || (window.google && google.maps && google.maps.places && google.maps.places.PlacesServiceStatus && status === google.maps.places.PlacesServiceStatus.OK)) && details) {
                Object.assign(place, details);
                updateCardLive(place);
                enrichIndex++;
                backgroundEnrichTimer = setTimeout(processNextEnrich, 250);
            } else if ((status === "OVER_QUERY_LIMIT" || (window.google && google.maps && google.maps.places && google.maps.places.PlacesServiceStatus && status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT))) {
                backgroundEnrichTimer = setTimeout(processNextEnrich, 2000);
            } else {
                enrichIndex++;
                backgroundEnrichTimer = setTimeout(processNextEnrich, 250);
            }
        });
    }

    processNextEnrich();
}

// Canlı Kart Güncelleme
function updateCardLive(place) {
    var card = document.querySelector('.place-card[data-place-id="' + place.place_id + '"]');
    if (!card) return;

    var detailsContainer = card.querySelector('.place-details');

    // Telefon güncelle
    if (place.formatted_phone_number && detailsContainer && !card.querySelector('a[href^="tel:"]')) {
        var phoneDiv = document.createElement('div');
        phoneDiv.className = 'place-detail';
        phoneDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>' +
            '<a href="tel:' + place.formatted_phone_number + '">' + place.formatted_phone_number + '</a>';
        detailsContainer.appendChild(phoneDiv);
    }

    // Web sitesi güncelle
    if (place.website && detailsContainer && !card.querySelector('a[target="_blank"]:not(.wa-btn):not(.instagram):not(.whatsapp)')) {
        var webDiv = document.createElement('div');
        webDiv.className = 'place-detail';
        webDiv.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
            '<a href="' + place.website + '" target="_blank">' + extractDomain(place.website) + '</a>';
        detailsContainer.appendChild(webDiv);
    }

    // WhatsApp butonunu güncelle
    if (place.formatted_phone_number) {
        var actionsContainer = card.querySelector('.place-actions');
        if (actionsContainer && !actionsContainer.querySelector('.whatsapp')) {
            var cleanPhone = getCleanPhone(place.formatted_phone_number);
            var waLink = document.createElement('a');
            waLink.href = 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(waTemplateText);
            waLink.target = '_blank';
            waLink.className = 'place-action-btn whatsapp';
            waLink.onclick = function(e) { e.stopPropagation(); };
            waLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>WhatsApp';
            actionsContainer.insertBefore(waLink, actionsContainer.firstChild);
        }
    }
}

// --- Filtreleme ve Sıralama Uygula ---
function applyFiltersAndRender() {
    if (!allPlaces || allPlaces.length === 0) {
        showNoResults();
        clearMarkers();
        return;
    }

    var filtered = allPlaces.filter(function(place) {
        if (filterOpenNow) {
            if (!place.opening_hours) return false;
            try {
                var isOpen = place.opening_hours.isOpen ? place.opening_hours.isOpen() : null;
                if (isOpen === false) return false;
            } catch(e) {}
        }

        if (filterMinRating > 0) {
            if (!place.rating || place.rating < filterMinRating) return false;
        }

        if (showFavoritesOnly) {
            var crm = crmData[place.place_id];
            if (!crm || !crm.isFavorite) return false;
        }

        return true;
    });

    var sortSelect = document.getElementById('sort-select');
    var sortVal = sortSelect ? sortSelect.value : 'rating';

    filtered.sort(function(a, b) {
        if (sortVal === 'rating') {
            return (b.rating || 0) - (a.rating || 0);
        } else if (sortVal === 'name') {
            return (a.name || '').localeCompare(b.name || '', 'tr');
        } else if (sortVal === 'distance') {
            if (!currentSearchCenter) return 0;
            var locA = getCoords(a.place_id);
            var locB = getCoords(b.place_id);
            if (!locA || !locB) return 0;
            var distA = haversine(currentSearchCenter.lat, currentSearchCenter.lng, locA.lat, locA.lng);
            var distB = haversine(currentSearchCenter.lat, currentSearchCenter.lng, locB.lat, locB.lng);
            return distA - distB;
        }
        return 0;
    });

    currentSorted = filtered;

    if (filtered.length === 0) {
        showNoResults();
        clearMarkers();
    } else {
        showResultsHeader(filtered.length);
        renderResults(filtered);
        addMarkers(filtered);
        fitMapToMarkers();
    }
}

// --- Sonuçları Ekrana Yazdır ---
function renderResults(places) {
    var container = document.getElementById('results-list');
    if (!container) return;
    container.innerHTML = '';

    for (var i = 0; i < places.length; i++) {
        var card = createPlaceCard(places[i], i);
        container.appendChild(card);
    }
}

// --- Dijital Puan Hesaplayıcı ---
function calculateDigitalScore(place) {
    var score = 0;
    if (place.website) score += 4;
    if (place.formatted_phone_number) score += 2;
    if (place.opening_hours) score += 1;
    if (place.rating && place.rating >= 4) score += 2;
    if (place.user_ratings_total && place.user_ratings_total > 10) score += 1;
    return score;
}

// --- Kart Oluştur (Kompakt & Modern Tasarım) ---
function toggleCrmDrawer(placeId) {
    var drawer = document.getElementById('crm-drawer-' + placeId);
    if (drawer) {
        drawer.classList.toggle('hidden');
    }
}

function createPlaceCard(place, index) {
    var card = document.createElement('div');
    card.className = 'place-card';
    card.setAttribute('data-place-id', place.place_id);

    var statusHTML = '';
    if (place.opening_hours) {
        try {
            var isOpen = place.opening_hours.isOpen ? place.opening_hours.isOpen() : null;
            if (isOpen === true) {
                statusHTML = '<span class="place-status open">AÇIK</span>';
            } else if (isOpen === false) {
                statusHTML = '<span class="place-status closed">KAPALI</span>';
            }
        } catch(e) {}
    }

    var ratingHTML = '';
    if (place.rating) {
        ratingHTML = '<span class="rating-chip">★ ' + place.rating.toFixed(1) + ' <small>(' + (place.user_ratings_total || 0) + ')</small></span>';
    }

    var address = place.formatted_address || place.vicinity || 'Adres bilgisi yok';
    var coords = getCoords(place.place_id);
    var directionsUrl = place.url || (coords ? 'https://www.google.com/maps/dir/?api=1&destination=' + coords.lat + ',' + coords.lng : '');

    var pData = crmData[place.place_id] || { isFavorite: false, status: 'Beklemede', notes: '' };
    var favClass = pData.isFavorite ? ' active' : '';
    
    var dScore = calculateDigitalScore(place);
    var scoreClass = dScore >= 8 ? 'score-high' : (dScore >= 5 ? 'score-med' : 'score-low');
    
    var cleanPhone = '';
    if (place.international_phone_number || place.formatted_phone_number) {
        var rawPhone = place.international_phone_number || place.formatted_phone_number;
        cleanPhone = getCleanPhone(rawPhone);
    }

    var escapedName = escapeHTML(place.name).replace(/'/g, "\'");

    card.innerHTML = 
        '<div class="card-top-row">' +
            '<div class="card-title-wrap">' +
                '<h4 class="place-name" title="' + escapeHTML(place.name) + '">' + escapeHTML(place.name) + '</h4>' +
                statusHTML +
            '</div>' +
            '<button class="favorite-btn' + favClass + '" onclick="event.stopPropagation(); toggleFavorite(\'' + place.place_id + '\', this)" title="Favorilere Ekle">' +
                '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' +
            '</button>' +
        '</div>' +
        
        '<div class="card-meta-row">' +
            '<span class="digital-badge ' + scoreClass + '">Dijital: ' + dScore + '/10</span>' +
            (!place.website ? '<span class="opportunity-badge">Web Yok</span>' : '<span class="web-badge">Web Var</span>') +
            ratingHTML +
            (place.formatted_phone_number ? '<span class="phone-chip">📞 ' + escapeHTML(place.formatted_phone_number) + '</span>' : '') +
        '</div>' +

        '<div class="card-address-row">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            '<span class="address-text" title="' + escapeHTML(address) + '">' + escapeHTML(address) + '</span>' +
        '</div>' +

        '<div class="card-actions-compact">' +
            (cleanPhone ? '<a href="https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(waTemplateText) + '" target="_blank" class="mini-btn wa" onclick="event.stopPropagation();" title="WhatsApp Mesajı Gönder">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>WhatsApp</a>' : '') +
            '<a href="https://www.google.com/search?q=site:instagram.com+' + encodeURIComponent(place.name) + '" target="_blank" class="mini-btn ig" onclick="event.stopPropagation();" title="Instagram Profilini Ara">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>Instagram</a>' +
            '<button class="mini-btn pitch" onclick="event.stopPropagation(); generatePitch(\'' + escapedName + '\', ' + dScore + ', \'' + (place.website?1:0) + '\');" title="Özel Satış Metni Oluştur">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>Satış Metni</button>' +
            '<button class="mini-btn qr" onclick="event.stopPropagation(); showQrModal(\'' + escapedName + '\', \'' + (cleanPhone||'') + '\', \'' + escapeHTML(address).replace(/'/g, "\'") + '\', \'' + (place.website||'') + '\');" title="QR vCard Oluştur">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="7" y="7" width="3" height="3"/><rect x="14" y="7" width="3" height="3"/><rect x="7" y="14" width="3" height="3"/></svg>QR vCard</button>' +
            '<a href="' + directionsUrl + '" target="_blank" class="mini-btn route" onclick="event.stopPropagation();" title="Google Haritalar Yol Tarifi">' +
            '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3,11 22,2 13,21 11,13"/></svg>Yol Tarifi</a>' +
            '<button class="mini-btn crm-btn" onclick="event.stopPropagation(); toggleCrmDrawer(\'' + place.place_id + '\');" title="CRM Durumu ve Notları">' +
            '<span>' + (pData.status === 'Beklemede' ? '⏳' : (pData.status === 'Satış Kapatıldı' ? '✅' : '📞')) + '</span> CRM ▾</button>' +
        '</div>' +

        '<div id="crm-drawer-' + place.place_id + '" class="card-crm-drawer hidden" onclick="event.stopPropagation();">' +
            '<div class="crm-drawer-inner">' +
                '<select class="crm-status-mini" onchange="updateCrmStatus(\'' + place.place_id + '\', this.value)">' +
                    '<option value="Beklemede"' + (pData.status=='Beklemede'?' selected':'') + '>⏳ Beklemede</option>' +
                    '<option value="Aranacak"' + (pData.status=='Aranacak'?' selected':'') + '>📞 Aranacak</option>' +
                    '<option value="Görüşüldü"' + (pData.status=='Görüşüldü'?' selected':'') + '>💬 Görüşüldü</option>' +
                    '<option value="Demo Ayarlandı"' + (pData.status=='Demo Ayarlandı'?' selected':'') + '>📅 Demo Ayarlandı</option>' +
                    '<option value="Satış Kapatıldı"' + (pData.status=='Satış Kapatıldı'?' selected':'') + '>✅ Satış Kapatıldı</option>' +
                    '<option value="Red/İlgilenmiyor"' + (pData.status=='Red/İlgilenmiyor'?' selected':'') + '>❌ İlgilenmiyor</option>' +
                '</select>' +
                '<input type="text" class="crm-note-mini" placeholder="Müşteri notu..." value="' + escapeHTML(pData.notes || '') + '" onchange="updateCrmNotes(\'' + place.place_id + '\', this.value)">' +
            '</div>' +
        '</div>';

    card.addEventListener('click', function () {
        document.querySelectorAll('.place-card').forEach(function(c) { c.classList.remove('active'); });
        card.classList.add('active');
        if (coords) {
            google.maps.event.trigger(map, 'resize');
            setTimeout(function() {
                map.setCenter(coords);
                map.setZoom(16);
            }, 50);
            showInfoWindow(place, coords);
        }
    });

    return card;
}

// --- Markerlar ve Harita UI ---
function createStars(rating) {
    var stars = '';
    var full = Math.floor(rating);
    var half = (rating - full) >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;

    for (var i = 0; i < full; i++) stars += '<svg viewBox="0 0 24 24" class="star full"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    if (half) stars += '<svg viewBox="0 0 24 24" class="star half"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    for (var j = 0; j < empty; j++) stars += '<svg viewBox="0 0 24 24" class="star empty"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    return stars;
}

function addMarkers(places) {
    clearMarkers();
    var bounds = new google.maps.LatLngBounds();
    var hasValidBounds = false;

    for (var i = 0; i < places.length; i++) {
        var place = places[i];
        var coords = getCoords(place.place_id);
        
        if (!coords) continue;

        var marker = new google.maps.Marker({
            position: coords,
            map: map,
            title: place.name,
            placeId: place.place_id
        });

        bounds.extend(coords);
        hasValidBounds = true;
        markers.push(marker);

        (function (p, m, c) {
            m.addListener('click', function () {
                showInfoWindow(p, c);
                highlightCard(p.place_id);
            });
        })(place, marker, coords);
    }

    if (hasValidBounds && markers.length > 0) {
        fitMapToMarkers();
    }
}

function highlightCard(placeId) {
    document.querySelectorAll('.place-card').forEach(function(c) { c.classList.remove('active'); });
    var card = document.querySelector('.place-card[data-place-id="' + placeId + '"]');
    if (card) {
        card.classList.add('active');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function fitMapToMarkers() {
    if (markers.length === 0) return;
    var bounds = new google.maps.LatLngBounds();
    markers.forEach(function(m) { bounds.extend(m.getPosition()); });
    
    if (centerMarker) {
        bounds.extend(centerMarker.getPosition());
    }
    
    map.fitBounds(bounds);
}

function showInfoWindow(place, coords) {
    var address = place.formatted_address || place.vicinity || 'Adres bilgisi yok';
    var cleanPhone = '';
    if (place.international_phone_number || place.formatted_phone_number) {
        var rawPhone = place.international_phone_number || place.formatted_phone_number;
        cleanPhone = getCleanPhone(rawPhone);
    }
    var directionsUrl = place.url || (coords ? 'https://www.google.com/maps/dir/?api=1&destination=' + coords.lat + ',' + coords.lng : '');
    var escapedName = escapeHTML(place.name).replace(/'/g, "\'");
    var dScore = calculateDigitalScore(place);

    var ratingHtml = '';
    if (place.rating) {
        ratingHtml = '<span class="iw-rating">★ ' + place.rating.toFixed(1) + ' <small>(' + (place.user_ratings_total || 0) + ')</small></span>';
    }

    var content = 
        '<div class="info-window-content">' +
            '<h3 class="iw-title">' + escapeHTML(place.name) + '</h3>' +
            '<div class="iw-meta">' +
                ratingHtml +
                '<span class="iw-dscore">Dijital: ' + dScore + '/10</span>' +
                (!place.website ? '<span class="iw-badge-noweb">Web Yok</span>' : '') +
            '</div>' +
            '<p class="iw-address">📍 ' + escapeHTML(address) + '</p>' +
            (place.formatted_phone_number ? '<p class="iw-phone-line"><a href="tel:' + place.formatted_phone_number + '" class="iw-phone">📞 ' + escapeHTML(place.formatted_phone_number) + '</a></p>' : '') +
            '<div class="iw-actions">' +
                (cleanPhone ? '<a href="https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(waTemplateText) + '" target="_blank" class="iw-btn wa"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>WA</a>' : '') +
                '<a href="' + directionsUrl + '" target="_blank" class="iw-btn">Yol Tarifi</a>' +
                '<button class="iw-btn" onclick="generatePitch(\'' + escapedName + '\', ' + dScore + ', \'' + (place.website?1:0) + '\');">Satış Metni</button>' +
            '</div>' +
        '</div>';

    infoWindow.setContent(content);
    infoWindow.setPosition(coords);
    infoWindow.open(map);
}

function addCenterMarker(coords) {
    if (centerMarker) {
        centerMarker.setMap(null);
    }
    centerMarker = new google.maps.Marker({
        position: coords,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#4f46e5',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        },
        title: 'Arama Merkezi',
        zIndex: 999
    });
}

function drawSearchCircle(center, radius) {
    if (searchCircle) {
        searchCircle.setMap(null);
    }
    searchCircle = new google.maps.Circle({
        strokeColor: '#4f46e5',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#4f46e5',
        fillOpacity: 0.1,
        map: map,
        center: center,
        radius: radius
    });
}

function exportCSV(places) {
    if (!places || places.length === 0) {
        alert('Dışa aktarılacak sonuç yok.');
        return;
    }

    var csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Toptancı Adı,Adres,Telefon,Web Sitesi,Google Haritalar,Durum,Puan,Dijital Olgunluk Skoru,CRM Durumu,CRM Notu\n";

    places.forEach(function(place) {
        var name = '"' + (place.name || '').replace(/"/g, '""') + '"';
        var address = '"' + (place.formatted_address || place.vicinity || '').replace(/"/g, '""') + '"';
        var phone = '"' + (place.formatted_phone_number || '') + '"';
        var website = '"' + (place.website || '') + '"';
        var url = '"' + (place.url || '') + '"';
        var isOpen = '';
        if (place.opening_hours) {
            try {
                isOpen = place.opening_hours.isOpen ? (place.opening_hours.isOpen() ? 'Açık' : 'Kapalı') : '';
            } catch(e){}
        }
        var rating = place.rating || '';
        var dScore = calculateDigitalScore(place);
        
        var pData = crmData[place.place_id] || { status: 'Beklemede', notes: '' };
        var crmStatus = '"' + (pData.status || 'Beklemede') + '"';
        var crmNotes = '"' + (pData.notes || '').replace(/"/g, '""') + '"';

        csvContent += name + "," + address + "," + phone + "," + website + "," + url + "," + isOpen + "," + rating + "," + dScore + "," + crmStatus + "," + crmNotes + "\n";
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "toptanci-crm-listesi-" + getDateString() + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function clearMarkers() {
    for (var i = 0; i < markers.length; i++) {
        markers[i].setMap(null);
    }
    markers = [];
}

function clearAll() {
    clearMarkers();
    if (searchCircle) searchCircle.setMap(null);
    if (infoWindow) infoWindow.close();
    var listEl = document.getElementById('results-list');
    if (listEl) listEl.innerHTML = '';
    
    var initEl = document.getElementById('initial-state');
    if (initEl) initEl.classList.remove('hidden');
    
    var noResEl = document.getElementById('no-results');
    if (noResEl) noResEl.classList.add('hidden');
    
    var headerEl = document.getElementById('results-header');
    if (headerEl) headerEl.classList.add('hidden');
    
    allPlaces = [];
    currentSorted = [];
}

// --- UI Yardımcıları ---
function showResultsHeader(count) {
    var initEl = document.getElementById('initial-state');
    if (initEl) initEl.classList.add('hidden');
    
    var noResEl = document.getElementById('no-results');
    if (noResEl) noResEl.classList.add('hidden');
    
    var headerEl = document.getElementById('results-header');
    if (headerEl) headerEl.classList.remove('hidden');
    
    var countEl = document.getElementById('results-count-text');
    if (countEl) countEl.textContent = count + ' toptancı bulundu';
}

function showNoResults() {
    var initEl = document.getElementById('initial-state');
    if (initEl) initEl.classList.add('hidden');
    
    var noResEl = document.getElementById('no-results');
    if (noResEl) noResEl.classList.remove('hidden');
    
    var headerEl = document.getElementById('results-header');
    if (headerEl) headerEl.classList.add('hidden');
}

function showLoading(show) {
    var overlay = document.getElementById('loading-overlay');
    if (!overlay) return;
    if (show) overlay.classList.remove('hidden');
    else overlay.classList.add('hidden');
}

function updateLoadingText(text) {
    var loadingText = document.getElementById('loading-text');
    if (loadingText) loadingText.textContent = text;
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, function(tag) {
        var charsToReplace = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return charsToReplace[tag] || tag;
    });
}

function extractDomain(url) {
    if (!url) return '';
    return url.replace('http://', '').replace('https://', '').split(/[/?#]/)[0];
}

function getDateString() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0');
}

// --- CRM & Pitch & QR Modalleri ---
function updateCrmStatus(placeId, status) {
    if (!crmData[placeId]) crmData[placeId] = { isFavorite: false, status: 'Beklemede', notes: '' };
    crmData[placeId].status = status;
    saveCrmData();
}

function updateCrmNotes(placeId, notes) {
    if (!crmData[placeId]) crmData[placeId] = { isFavorite: false, status: 'Beklemede', notes: '' };
    crmData[placeId].notes = notes;
    saveCrmData();
}

function saveCrmData() {
    localStorage.setItem('kiyafet_crm_data', JSON.stringify(crmData));
}

function toggleFavorite(placeId, btnElement) {
    if (!crmData[placeId]) crmData[placeId] = { isFavorite: false, status: 'Beklemede', notes: '' };
    crmData[placeId].isFavorite = !crmData[placeId].isFavorite;
    
    if (crmData[placeId].isFavorite) {
        btnElement.classList.add('active');
    } else {
        btnElement.classList.remove('active');
    }
    saveCrmData();
    
    if (showFavoritesOnly) {
        applyFiltersAndRender();
    }
}

function generatePitch(name, score, hasWeb) {
    var title = "Satış Metni: " + name;
    var webText = hasWeb == '1' ? 
        "Web siteniz var ancak otomasyon ve dijitalleşme konusunda rakiplerinizin gerisinde kalmış görünüyor." : 
        "İşletmenizin henüz bir web sitesi olmadığını fark ettim. Bugünlerde dijital vitrini olmayan toptancılar maalesef görünmez oluyor.";
    
    var rawText = "Merhaba, iyi çalışmalar dilerim. Ben [Adınız].\n\n" +
                "Google Haritalar üzerinden " + name + " işletmenizin profilini inceledim. " +
                "Dijital olgunluk analizi yaptığımızda işletmenizin puanı 10 üzerinden " + score + " çıktı.\n\n" +
                webText + "\n\n" +
                "Bizim Yapay Zeka Destekli Otomasyon Sistemimiz ile saniyeler içinde B2B e-ticaret sitenizi kurabilir, ürün fotoğraflarınızı mankenlere giydirebilir ve Instagram paylaşımlarınızı otomatiğe bağlayabilirsiniz.\n\n" +
                "Tüm operasyonunuzu tek panelden yönetip satışlarınızı artırmak için 10 dakikalık bir demo toplantısı organize edelim mi?";
    
    var pitchHtml = rawText.split("\n").join("<br>");

    var modalTitle = document.getElementById('modal-title');
    var modalBody = document.getElementById('modal-body');
    var infoModal = document.getElementById('info-modal');

    if (modalTitle) modalTitle.innerText = title;
    if (modalBody) {
        modalBody.innerHTML = 
            '<div class="pitch-text">' + pitchHtml + '</div>' +
            '<div style="display:flex; justify-content:flex-end; gap:10px;">' +
            '<button id="copy-pitch-btn" class="modal-save-btn" style="background:var(--purple-gradient);">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
            ' Metni Kopyala</button>' +
            '</div>';
        
        var copyBtn = document.getElementById('copy-pitch-btn');
        if (copyBtn) {
            copyBtn.onclick = function() {
                navigator.clipboard.writeText(rawText).then(function() {
                    copyBtn.innerText = "✓ Kopyalandı!";
                    setTimeout(function() { 
                        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Metni Kopyala'; 
                    }, 2000);
                });
            };
        }
    }

    if (infoModal) infoModal.classList.remove('hidden');
}

function showQrModal(name, phone, address, website) {
    var vCard = "BEGIN:VCARD\nVERSION:3.0\nN:;" + name + ";;;\nFN:" + name + "\nORG:" + name + "\nTEL;TYPE=WORK,VOICE:" + phone + "\nADR;TYPE=WORK:;;" + address + "\nURL:" + website + "\nEND:VCARD";
    var qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + encodeURIComponent(vCard);
    
    var modalTitle = document.getElementById('modal-title');
    var modalBody = document.getElementById('modal-body');
    var infoModal = document.getElementById('info-modal');

    if (modalTitle) modalTitle.innerText = name + " — QR vCard";
    if (modalBody) {
        modalBody.innerHTML = 
            '<div style="text-align:center; padding: 15px 0;">' +
            '<div style="background:#ffffff; display:inline-block; padding:12px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.4);">' +
            '<img src="' + qrUrl + '" alt="QR Code" style="display:block; width:200px; height:200px;">' +
            '</div>' +
            '<p style="margin-top:14px; font-size:13px; color:#94a3b8;">Müşteriyi telefon rehberine eklemek için telefonunuzun kamerasını okutun.</p>' +
            '</div>';
    }
    if (infoModal) infoModal.classList.remove('hidden');
}

function showStreetView(lat, lng) {
    if (!map) return;
    var panorama = map.getStreetView();
    var pos = { lat: lat, lng: lng };
    panorama.setPosition(pos);
    panorama.setPov({ heading: 34, pitch: 10 });
    panorama.setVisible(true);
}

// ============================================
// B2B CRM: GÖRÜNÜM, KANBAN, WA VE ROTA
// ============================================
function initCrmFeatures() {
    var viewMapBtn = document.getElementById('view-map-btn');
    var viewKanbanBtn = document.getElementById('view-kanban-btn');
    var mapContainer = document.getElementById('map-view-container');
    var kanbanContainer = document.getElementById('kanban-view-container');

    if (viewMapBtn && viewKanbanBtn && mapContainer && kanbanContainer) {
        viewMapBtn.addEventListener('click', function() {
            viewMapBtn.classList.add('active');
            viewKanbanBtn.classList.remove('active');
            mapContainer.style.display = 'flex';
            kanbanContainer.style.display = 'none';
        });

        viewKanbanBtn.addEventListener('click', function() {
            viewKanbanBtn.classList.add('active');
            viewMapBtn.classList.remove('active');
            mapContainer.style.display = 'none';
            kanbanContainer.style.display = 'flex';
            renderKanbanBoard();
        });
    }

    var waSettingsBtn = document.getElementById('wa-settings-btn');
    var waSettingsModal = document.getElementById('wa-settings-modal');
    var waTemplateInput = document.getElementById('wa-template-text');
    var saveWaBtn = document.getElementById('save-wa-template-btn');

    if (waSettingsBtn && waSettingsModal && waTemplateInput) {
        waSettingsBtn.addEventListener('click', function() {
            waTemplateInput.value = waTemplateText;
            waSettingsModal.classList.remove('hidden');
        });
    }
    if (saveWaBtn && waSettingsModal && waTemplateInput) {
        saveWaBtn.addEventListener('click', function() {
            waTemplateText = waTemplateInput.value;
            localStorage.setItem('waTemplateText', waTemplateText);
            waSettingsModal.classList.add('hidden');
            alert('WhatsApp şablonu kaydedildi!');
        });
    }

    var drawRouteBtn = document.getElementById('draw-route-btn');
    var clearRouteBtn = document.getElementById('clear-route-btn');
    if (drawRouteBtn) drawRouteBtn.addEventListener('click', calculateAndDisplayRoute);
    if (clearRouteBtn) clearRouteBtn.addEventListener('click', clearRoute);
}

// Kanban Render
function renderKanbanBoard() {
    var cols = {
        'Yeni': document.getElementById('kanban-col-yeni'),
        'İletişime Geçildi': document.getElementById('kanban-col-iletisim'),
        'Toplantı Ayarlandı': document.getElementById('kanban-col-toplanti'),
        'Satış Başarılı': document.getElementById('kanban-col-satis'),
        'İlgilenmiyor': document.getElementById('kanban-col-red')
    };

    for (var key in cols) {
        if (cols[key]) {
            cols[key].innerHTML = '';
            var countSpan = cols[key].parentElement.querySelector('.badge');
            if (countSpan) countSpan.innerText = '0';
        }
    }

    var counts = { 'Yeni':0, 'İletişime Geçildi':0, 'Toplantı Ayarlandı':0, 'Satış Başarılı':0, 'İlgilenmiyor':0 };

    allPlaces.forEach(function(place) {
        var crm = crmData[place.place_id];
        if (crm && crm.isFavorite) {
            var st = crm.status || 'Yeni';
            if (st === 'Görüşüldü') st = 'İletişime Geçildi';
            if (st === 'İlgileniyor') st = 'Toplantı Ayarlandı';
            if (!cols[st]) st = 'Yeni';

            counts[st]++;
            
            var card = document.createElement('div');
            card.className = 'kanban-card';
            card.draggable = true;
            card.setAttribute('data-id', place.place_id);
            
            var phoneHtml = place.formatted_phone_number ? '<p style="margin:2px 0;">📞 ' + escapeHTML(place.formatted_phone_number) + '</p>' : '';
            var routeChecked = routePlaces.includes(place.place_id) ? 'checked' : '';
            var cleanPhone = getCleanPhone(place.formatted_phone_number);
            
            card.innerHTML = 
                '<h4>' + escapeHTML(place.name) + '</h4>' +
                phoneHtml +
                '<div class="kanban-actions">' +
                '<a href="https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(waTemplateText) + '" target="_blank" class="wa-btn">' +
                '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>' +
                'Mesaj At' +
                '</a>' +
                '<label class="route-check-label">' +
                '<input type="checkbox" class="route-checkbox" data-id="' + place.place_id + '" ' + routeChecked + '>' +
                'Rotaya Ekle' +
                '</label>' +
                '</div>';
            
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);

            if (cols[st]) cols[st].appendChild(card);
        }
    });

    for (var st in counts) {
        if (cols[st]) {
            var countSpan = cols[st].parentElement.querySelector('.badge');
            if (countSpan) countSpan.innerText = counts[st];
        }
    }
    
    bindRouteCheckboxes();
}

var draggedCard = null;

function handleDragStart(e) {
    draggedCard = this;
    var self = this;
    setTimeout(function() { self.classList.add('dragging'); }, 0);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedCard = null;
}

// Kolonlar için Drag Events
document.querySelectorAll('.kanban-column').forEach(function(col) {
    col.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('drag-over');
    });
    col.addEventListener('dragleave', function(e) {
        this.classList.remove('drag-over');
    });
    col.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (draggedCard) {
            var newStatus = this.getAttribute('data-status');
            var placeId = draggedCard.getAttribute('data-id');
            
            if (crmData[placeId]) {
                crmData[placeId].status = newStatus;
                saveCrmData();
            }
            
            var cardContainer = this.querySelector('.kanban-cards');
            if (cardContainer) cardContainer.appendChild(draggedCard);
            renderKanbanBoard();
        }
    });
});

// WA ve Rota Araçları
function getPlaceCoords(pid) {
    var coords = getCoords(pid);
    if (coords) return new google.maps.LatLng(coords.lat, coords.lng);
    return null;
}

function getCleanPhone(phone) {
    if (!phone) return '';
    var clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) clean = '9' + clean;
    if (!clean.startsWith('90') && clean.length === 10) clean = '90' + clean;
    return clean;
}

function bindRouteCheckboxes() {
    document.querySelectorAll('.route-checkbox').forEach(function(cb) {
        var newCb = cb.cloneNode(true);
        cb.parentNode.replaceChild(newCb, cb);
        
        newCb.addEventListener('change', function() {
            var id = this.getAttribute('data-id');
            if (this.checked) {
                if (!routePlaces.includes(id)) routePlaces.push(id);
            } else {
                routePlaces = routePlaces.filter(function(p) { return p !== id; });
            }
            updateRoutePanel();
            
            document.querySelectorAll('.route-checkbox[data-id="' + id + '"]').forEach(function(el) {
                if (el !== newCb) el.checked = newCb.checked;
            });
        });
    });
}

function updateRoutePanel() {
    var panel = document.getElementById('route-panel');
    var countText = document.getElementById('route-count-text');
    if (!panel || !countText) return;
    
    if (routePlaces.length > 0) {
        panel.classList.remove('hidden');
        countText.innerText = routePlaces.length + ' Nokta Seçili';
    } else {
        panel.classList.add('hidden');
        clearRoute();
    }
}

function calculateAndDisplayRoute() {
    if (routePlaces.length === 0) return;
    if (!selectedLatLng) {
        alert("Lütfen önce bir başlangıç konumu belirleyin.");
        return;
    }

    var waypoints = [];
    var destination = null;

    routePlaces.forEach(function(pid, index) {
        var coords = getPlaceCoords(pid);
        if (coords) {
            if (index === routePlaces.length - 1) {
                destination = coords;
            } else {
                waypoints.push({
                    location: coords,
                    stopover: true
                });
            }
        }
    });
    
    if (!destination && waypoints.length > 0) {
        destination = waypoints.pop().location;
    }

    if (!destination) {
        alert("Konum bilgileri alınamadı.");
        return;
    }

    directionsService.route({
        origin: new google.maps.LatLng(selectedLatLng.lat, selectedLatLng.lng),
        destination: destination,
        waypoints: waypoints,
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING
    }, function(response, status) {
        if (status === 'OK') {
            directionsRenderer.setDirections(response);
            var mapBtn = document.getElementById('view-map-btn');
            if (mapBtn) mapBtn.click();
        } else {
            alert('Rota hesaplanamadı: ' + status);
        }
    });
}

function clearRoute() {
    if (directionsRenderer) directionsRenderer.setDirections({ routes: [] });
    routePlaces = [];
    document.querySelectorAll('.route-checkbox').forEach(function(cb) { cb.checked = false; });
    var panel = document.getElementById('route-panel');
    if (panel) panel.classList.add('hidden');
}

// Başlangıç API'leri
initDashboardApis();

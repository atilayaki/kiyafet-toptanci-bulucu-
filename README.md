# Kıyafet Toptancısı Bulucu

Seçtiğiniz adresin yakınındaki tüm kıyafet toptancılarını harita üzerinde gösteren web uygulaması.

## Özellikler

- Google Places Autocomplete ile adres arama (Türkiye odaklı)
- 1-20 km arası yarıçap ayarı
- 6 farklı anahtar kelime ile kapsamlı arama
- Detaylı iletişim bilgileri (telefon, web sitesi, çalışma saatleri)
- Google değerlendirme puanı ve yorum sayısı
- Açık/Kapalı durumu gösterimi
- Google Maps yol tarifi bağlantısı
- Puan, mesafe veya isme göre sıralama
- CSV olarak dışa aktarma
- Mobil uyumlu tasarım

## Kurulum

### 1. Google Maps API Anahtarı

API anahtarınız index.html dosyasında tanımlıdır. Değiştirmek isterseniz:

`javascript
const GOOGLE_MAPS_API_KEY = 'ANAHTARINIZ';
`

### 2. Google Cloud Console Ayarları

Aşağıdaki API'lerin etkin olduğundan emin olun:
- Maps JavaScript API
- Places API
- Geocoding API

Google Cloud Console > APIs & Services > Library sayfasından etkinleştirebilirsiniz.

### 3. Çalıştırma

index.html dosyasını doğrudan tarayıcıda açın veya yerel bir sunucu kullanın:

`ash
# Python ile
python -m http.server 8080

# Node.js ile
npx serve .

# VS Code Live Server eklentisi ile
# index.html'e sağ tıklayın > "Open with Live Server"
`

## Kullanım

1. Arama çubuğuna bir adres veya konum girin
2. Autocomplete listesinden bir adres seçin
3. Yarıçap slider'ı ile arama yarıçapını ayarlayın (varsayılan: 10 km)
4. "Toptancıları Bul" butonuna tıklayın
5. Sonuçlar sol panelde kart olarak, sağ panelde haritada pin olarak görüntülenir
6. Bir karta tıklayın - haritada ilgili konuma gider
7. Bir pin'e tıklayın - bilgi penceresi açılır
8. "CSV" butonuyla sonuçları dışarı aktarın

## Arama Anahtar Kelimeleri

Uygulama aşağıdaki kelimelerle arama yapar:
- kıyafet toptancısı
- giyim toptancısı
- tekstil toptancısı
- konfeksiyon toptancısı
- toptan giyim
- toptan kıyafet

## Teknolojiler

- HTML5 / CSS3 / Vanilla JavaScript
- Google Maps JavaScript API
- Google Places API
- Inter font (Google Fonts)

## Dosya Yapısı

`
kiyafet-toptanci-bulucu/
  index.html       # Ana sayfa
  css/
    style.css      # Stiller
  js/
    app.js         # Uygulama mantığı
  README.md        # Bu dosya
`

## Notlar

- Google Maps API ücretsiz kotası aylık  kredidir
- Places API Nearby Search, her istek başına maksimum 60 sonuç döndürür (3 sayfa x 20)
- API anahtarınızı açık repoda paylaşmamaya dikkat edin

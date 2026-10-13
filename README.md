# XAU/USD Demo Trading Dashboard

XAU/USD icin Twelve Data verisine dayali analiz ve demo alim-satim dashboard'u.

Bu uygulama gercek broker'a emir gondermez. Piyasa verisi uretmez. Gecmis mumlar Twelve Data `time_series` API'sinden, canli fiyatlar Twelve Data WebSocket akısından gelir. API key yoksa backend hata vererek durur.

## Gereksinimler

- Node.js
- npm
- Twelve Data API key
- MySQL zorunludur. Sadece kayit/persistence icindir, market verisi kaynagi degildir.

## Kurulum

```bash
npm install
cp .env.example .env
```

`.env` icinde en az sunlar olmali:

```env
MARKET_SYMBOL=XAU/USD
MARKET_INTERVAL=1min
MARKET_HISTORY_CANDLES=260
TWELVE_DATA_API_KEY=your_api_key_here
TWELVE_DATA_BASE_URL=https://api.twelvedata.com
TWELVE_DATA_WS_URL=wss://ws.twelvedata.com/v1/quotes/price
TWELVE_DATA_TIMEZONE=UTC
TICK_MS=1000
```

`TWELVE_DATA_API_KEY` bos kalirsa backend hata vererek durur.

## Calistirma

```bash
npm run dev
```

Adresler:

```text
Frontend: http://127.0.0.1:3500/
Backend:  http://127.0.0.1:3501/
WebSocket: ws://127.0.0.1:3500/ws
```

Telefondan ayni Wi-Fi aginda acmak icin Mac'in local IP adresini bul:

```bash
ipconfig getifaddr en0
```

Sonra telefonda su adresi ac:

```text
http://MAC_LOCAL_IP:3500/
```

Backend `.env` icinde `HOST=0.0.0.0` dinlemeli. `VITE_WS_URL` bos birakilirsa frontend WebSocket adresini acilan host uzerinden otomatik kurar.

Web bildirimleri icin ust bardaki `Bildirim ac` butonuna basip tarayici izni ver. Desktop `localhost` uzerinde calisir. Telefonda local agdaki `http://MAC_LOCAL_IP:3500` adresinde bazi tarayicilar HTTPS istemesi nedeniyle native bildirim izni vermeyebilir; bu durumda uygulama ici toast bildirimleri calismaya devam eder.

## iOS WebView App

SwiftUI + WKWebView iskeleti `ios/NizTradeBot.xcodeproj` altinda durur. Calistirmak icin:

1. Mac'te dashboard'u local agdan acilacak sekilde baslat:

```bash
npm run dev
```

2. Xcode ile projeyi ac:

```bash
open ios/NizTradeBot.xcodeproj
```

3. Local IP degistiyse `ios/NizTradeBot/Info.plist` icindeki `DashboardURL` degerini guncelle:

```xml
<key>DashboardURL</key>
<string>http://127.0.0.1:3500</string>
```

Uygulama dashboard'u tam ekran acar ve dashboard host'u disindaki navigasyonlari engeller. Web tarafinda islem eventi geldiginde `window.webkit.messageHandlers.tradingNotification` uzerinden Swift'e mesaj gider. Swift tarafinda bu mesaj local notification olarak gosterilir. Bu cozum app acik/aktifken guvenilirdir; app tamamen background'da uzun sure suspend edilirse WebView JavaScript'i calismayabilir. Gercek arka plan bildirimi icin ileride server push + APNs gerekir.

App tamamen kapaliyken bildirim almak icin APNs remote push kullanilir. Xcode'da Bundle ID icin Push Notifications capability acik olmali. `ios/NizTradeBot/NizTradeBot.entitlements` gelistirme icin `aps-environment=development` olarak gelir; TestFlight/App Store icin production imza ayarina gore Apple tarafini hazirla.

Backend APNs ayarlari:

```env
PUSH_ENABLED=true
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.nizamettin.NizTradeBot
APNS_AUTH_KEY_PATH=/var/www/trade-bot/AuthKey_XXXXXXXXXX.p8
APNS_PRODUCTION=false
```

iOS app izin alinca APNs device token'i `/api/devices` endpoint'ine kaydeder. Bot `entry` veya `exit` eventi urettiginde backend kayitli iOS tokenlara APNs remote push gonderir.

Production build:

```bash
npm run build
```

## Veri Akisi

```text
Twelve Data HTTP time_series
  -> server/src/market/providers/twelveDataMarketDataProvider.ts
  -> ilk gecmis mum seti

Twelve Data WebSocket price stream
  -> server/src/market/providers/twelveDataMarketDataProvider.ts
  -> canli tick'lerden aktif mumu guncelleme
  -> server/src/services/tradingService.ts
  -> strategy + demo broker
  -> dashboard websocket
  -> required MySQL persistence
```

Market verisi icin kullanilan provider:

```text
server/src/market/providers/twelveDataMarketDataProvider.ts
```

Provider secimi:

```text
server/src/market/providers/createMarketDataProvider.ts
```

Bu dosya sadece Twelve Data provider olusturur. Simulator veya MySQL market-data provider yoktur.

Twelve Data `time_series` sadece baslangic gecmis mumlarini almak icin kullanilir. Canli fiyat akisi `TWELVE_DATA_WS_URL` uzerindeki WebSocket baglantisindan gelir. Gelen fiyat tick'leri aktif mumu anlik gunceller.

Twelve Data mum zamanlari backend'de UTC olarak normalize edilir. Frontend grafik saat ekseni `Europe/Istanbul` formatinda gosterilir.

TradingView'da secilen sembolun veri kaynagi farkli olabilir. Ornegin `OANDA:XAUUSD`, `FOREXCOM:XAUUSD` ve Twelve Data `XAU/USD` ayni anda farkli bid/ask/mid fiyatlari gosterebilir. Birebir mum karsilastirmasi icin TradingView tarafinda da ayni veri kaynagini ve ayni intervali kullanmak gerekir.

## Backend Mimarisi

```text
server/
  index.ts
  src/
    broker/               Demo broker and risk management
    config/               .env loader and runtime config
    controllers/           Express request/response layer
    database/              Required MySQL persistence
    domain/               Backend domain types
    http/                 Express app setup
    indicators/           EMA, RSI, ATR, support/resistance
    market/providers/     Twelve Data market data provider
    realtime/             WebSocket broadcaster
    routes/               API route definitions
    services/             Application orchestration
    strategy/             XAU/USD signal engine
    utils/                Shared helpers
```

API:

```text
GET  /api/state       Dashboard state
WS   /ws              Live dashboard stream
```

`GET /api/state` cevabinda veri kaynagi acikca gorunur:

```json
{
  "marketData": {
    "provider": "twelvedata",
    "symbol": "XAU/USD",
    "interval": "1min",
    "isLive": true,
    "source": "https://api.twelvedata.com"
  }
}
```

## Frontend Mimarisi

```text
src/
  api/
  components/
  hooks/
  types/
  utils/
  App.tsx
  main.tsx
  styles.css
```

Onemli dosyalar:

- `src/components/TradingChart.tsx`: Candlestick grafik, EMA, destek/direnc, TP/SL.
- `src/components/TradesTable.tsx`: Acik pozisyon + kapanan islemler.
- `src/hooks/useDashboardSocket.ts`: WebSocket state stream.
- `src/types/trading.ts`: Frontend domain tipleri.

## Analiz Motoru

Dosya:

```text
server/src/strategy/xauUsdStrategy.ts
```

Hesaplananlar:

- EMA50 / EMA200 (trend yonu)
- ATR14 (Wilder)
- 20 mumluk kirilim kanali (Donchian zirve/dip; grafikte destek/direnc olarak cizilir)
- RSI14 (sadece bilgi)

Karar mantigi (trend yonunde momentum kirilimi):

- `buy`: EMA50 > EMA200 ve kapanmis mum son 20 mumun zirvesinin ustunde kapandi.
- `sell`: EMA50 < EMA200 ve kapanmis mum son 20 mumun dibinin altinda kapandi.
- SL 1.5 ATR, TP 2.5 ATR, en fazla 60 dk acik kalir.
- Rollover (20:45-22:15 UTC), Cuma 20:00 UTC sonrasi ve hafta sonu yeni islem acilmaz; Cuma 20:50 UTC'de acik pozisyon kapatilir.
- Sinyal sadece kapanmis mumlarla, mum basina bir kez uretilir. Giris yeni mumun ilk tick'inde yapilir.
- SL/TP sadece giristen sonra gelen tick fiyatlariyla kontrol edilir.

Kapanmis mumlar `MARKET_REST_SYNC_SECONDS` (varsayilan 180 sn) araliklarla Twelve Data REST'ten gelen resmi OHLC ile duzeltilir. WebSocket tick'leri seyrek oldugu icin (mumlarin ~%37'si tek tick) sadece tick'ten kurulan mumlar gercek high/low'u kacirir ve ATR'yi ~2.5 kat kucuk gosterir.

## Demo Trading

Dosya:

```text
server/src/broker/demoBroker.ts
```

Varsayilanlar:

```text
Baslangic bakiye: 100 USD
Islem basi risk: en fazla %2 (8x kaldirac limiti genelde once devreye girer)
Maksimum kaldirac: 8x
Gunluk zarar limiti: %6 (UTC gun sonuna kadar yeni islem yok)
Ayni anda acik pozisyon: 1
```

Acik pozisyon ayri kartta yer kaplamaz. Dashboard'daki `Islem Gecmisi` tablosunun ilk satirinda `ACIK` olarak gorunur.

## MySQL Persistence

MySQL market verisi kaynagi degildir. Sadece sistemin gordugu Twelve Data mumlarini, demo trade'leri, acik pozisyonu, eventleri ve hesap snapshotlarini kaydetmek icin kullanilir. Backend yeniden baslarsa son hesap durumu, islem gecmisi, bot gunlugu ve varsa acik pozisyon MySQL'den geri yuklenir.

`account_snapshots` her fiyat tick'inde yazilmaz. Bakiye/realized PnL/risk limiti gibi kalici hesap durumu degistiginde snapshot alinir; boylece tablo ayni veriyle sismez.

Acik kullanmak icin:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=daytrading
DB_CONNECT_TIMEOUT_MS=5000
DB_AUTO_MIGRATE=true
```

Olusan tablolar:

- `market_candles`
- `demo_trades`
- `open_positions`
- `bot_events`
- `account_snapshots`

MySQL baglanamazsa backend durur. Bu bilincli davranistir.

## Sorun Giderme

Twelve Data key yoksa backend durur. `.env` kontrol et:

```env
TWELVE_DATA_API_KEY=your_api_key_here
```

WebSocket adresi:

```env
VITE_WS_URL=
```

Portlar:

```text
3500 frontend
3501 backend
```

Build kontrol:

```bash
npm run build
```

## Uyari

Bu uygulama egitim ve demo-trading amaclidir. Kaldiracli XAU/USD/forex islemleri yuksek risklidir. Gercek hesaba emir gondermez ve kar garantisi vermez.

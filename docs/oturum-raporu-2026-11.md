# ObiHub Mobil — Oturum Raporu (11–12 Kasım 2026)

Bu rapor, mobil uygulama oturumunda yapılanları, doğrulanmayanları ve sıradaki işleri özetler. Ayrıntılı gerekçeler ve bulgu listeleri için: [mobil-yol-haritasi.md](mobil-yol-haritasi.md).

## 1. Şu anki durum

| Konu | Durum |
|---|---|
| Son sürüm | **1.1.02 (build 53)** — Expo'da derlendi, TestFlight'a yükleme otomatik sıraya alındı. Yüklemenin tamamlandığı ve Apple'ın sürüm numarasını nasıl gösterdiği komut satırından doğrulanmadı. |
| Önceki gönderimler | 1.1.0 (build 50, 51), 1.1.01 (build 52) |
| Kod | Yerel `gorsel-tur` dalında, son commit `b2124ab`. **GitHub'a hiç gönderilmedi** (push istenmedi). `main` dalına dokunulmadı. |
| Cihaz testi | **Yapılmadı.** Tüm doğrulama tip denetimi ve sahte API ile tarayıcı önizlemesinde yapıldı. |
| Sürüm düzeni | Her gönderim: sürüm 1.1.01 → 1.1.02 → 1.1.03…, build numarası +1. Sıradaki: **1.1.03 (build 54)**. |

Dal zinciri (hepsi yerel, her biri bir öncekinden): `main` → `mobil-1.0.15-mevcut-durum` → `faz-0-onarim` → `faz-1-premium-kabuk` → `faz-2-siparis-urun` → `denetim-duzeltmeleri` → `faz-1-eski-ekranlar` → `gorsel-tur`.

## 2. Çalışma kuralları

- Bu oturum yalnızca `obihub-mobile/` altına yazar. `backend/` ve `frontend/` (web) salt okunurdur; sunucu ihtiyaçları listelenir, web oturumu yapar.
- Arayüz yönü: zengin ve görsel "premium". Üst çubukta logo, karşılama, bildirim, tema ve çıkış düğmeleri kalır. Alt çubuk: Panel, Mağaza, Sipariş, Finans, HepsiJet, Menü. Sekme ya da üst çubuk gibi yapısal gezinme değişiklikleri önce sorulur.
- Muhasebe izolasyonu: Paraşüt'e özgü ekran BizimHesap kullanıcısına gösterilmez, tersi de geçerlidir.

## 3. Yapılanlar

### Faz 0 — Onarım
- 1.0.15'teki commit edilmemiş işler güvenle kaydedildi.
- Oturum süresi dolunca girişe yönlendirme, abonelik kilidi ekranı, etiket ve desi düzeltmeleri, çıkışta önbellek temizliği.

### Faz 1 — Premium kabuk
- Ortak bileşen seti (`frontend/src/ui/`): üst çubuklar, düğme, çip, arama, liste satırı, özet kartları, gradyan kart, geri bildirim sayfaları (gömülü rakam tuşlarıyla).
- Yeni Panel, bildirim merkezi (sipariş ve destek yanıtı), ayarlar, role göre ekran gösterimi.
- Eski ekranların tamamı temaya taşındı; sistem uyarı kutusu ve 12 punto altı yazı kalmadı.
- Görsel tur: detay ekranlarında özet kartları, renkli durum şeritleri, ekran geçişleri.

### Faz 2 — Sipariş ve ürün
- Tüm siparişler (arama, durum ve mağaza süzgeci, sayfalama, kaydırarak etiket yazdırma), HepsiJet gönderisi oluşturma.
- Ürün arama, barkod okuma, ana ve kanal bazında stok/fiyat düzenleme, senkron işleri.
- Ürün adı / SKU / barkod düzenleme, stok hareket geçmişi (1.1.02).

### Faz 3 — Finans
- Finans özeti, ObiHub satış faturaları (tahsilat, resmileştirme), Paraşüt/BizimHesap faturaları, teklifler, cari hesaplar ve ekstre, kasa ve bankalar, Paraşüt gider faturaları.
- Virman, yeni kasa/banka hesabı, yeni cari, satış faturası oluşturma — taslak olarak (1.1.02).

### Faz 4 — Gelen faturalar
- Gelen e-fatura listesi (Paraşüt, BenimPOS, Turkcell) ve PDF görüntüleme.

### Faz 5 — Hesap
- Destek talepleri, abonelik durumu, biyometrik kilit.

### 1.1.02'deki veri düzeltmeleri
Kullanıcı bildirimi: Panel'de bugünün sipariş sayısı ve tutarı görünmüyordu. Sunucu özeti kaydın sisteme düştüğü ana ve UTC gece yarısına bakıyor; mobil artık bugünü sipariş tarihine ve telefonun gününe göre kendisi hesaplıyor. Hesabınızdaki kesin neden canlı veriyle doğrulanmadı.

Aynı türden hatalar beş alanda tarandı, bağımsız doğrulandı ve düzeltildi:

- **Panel / Raporlar:** dönem toplamları Raporlar ile aynı kaynaktan; geçmiş aralıkların 500 siparişte kesilmesi; önceki dönem sıfırken uydurma +%100.
- **Sipariş / Mağaza:** sipariş numarasının takip numarası diye gösterilmesi; mağaza sayaçlarının son 200 kayıttan hesaplanması; durum etiketleri.
- **Ürün:** fiyat isteği hatasında 0,00 TL; toplu fiyat gönderiminde Trendyol liste fiyatını ezen ikinci istek.
- **Finans:** taslak dışı faturada "Resmileştir" düğmesi; dövizli cari gösterimi; yerel güne göre vade.
- **Fatura / Teklif:** listelerin ilk sayfada kesilmesi; sunucu hatasının "kayıt yok" diye görünmesi.

## 4. Doğrulanmayanlar — TestFlight'ta denenmeli

Sırayla denenmesi önerilir; para yazan işlemler önce küçük tutarla ya da deneme kaydıyla.

1. Panel: bugünün cirosu ve sipariş sayısı web ve sipariş listesiyle tutuyor mu.
2. Stok/fiyat girişi: gömülü rakam tuşları, klavyenin sayfayı örtmemesi.
3. Virman, yeni hesap, yeni cari, fatura oluşturma: kayıt web'de doğru görünüyor mu.
4. Ürün adı/SKU/barkod düzenleme ve stok hareketleri.
5. Etiket yazdırma, kaydırarak yazdırma, barkod okuma, Face ID kilidi.
6. Bildirimler (yeni sipariş, soğuk açılışta doğru siparişe gitme).
7. Koyu tema ve ekran geçişleri.

Bilinen riskler:

- Yanıt gelmeden bağlantı koparsa ve işlem yeniden gönderilirse mükerrer virman/fatura/cari oluşabilir (sunucuda tekrar anahtarı yok).
- Fatura oluştururken katalog fiyatı "KDV hariç birim fiyat" alanına olduğu gibi önerilir; fiyatlar KDV dahil tutuluyorsa elle düzeltilmelidir.
- Çok yüksek sipariş hacminde Panel'in dönem rakamı yanlış göstermek yerine "—" gösterir.
- Cari bakiyesinde artı değer alacak, eksi değer borç olarak yorumlandı; gerçek veriyle teyit edilmeli.

## 5. Yapılmayanlar

| İş | Neden |
|---|---|
| Davet et, kazan | Ekran yazıldı (`frontend/app/invite.tsx`) ama menüye bağlanmadı: sunucunun ürettiği `/davet/<kod>` bağlantısının web'de rotası yok, ödülü işleyen kod bulunamadı. |
| Dövizli caride tahsilat | Mobilde kapatıldı: sunucu tutarı para birimine bakmadan TL kasasına yazıyor. |
| BizimHesap gider faturaları | Sunucu ucu güvenilir değil; web de bilerek kullanmıyor. |
| İçeri Al (gelen faturayı gidere işleme) | Web tarafındaki çalışma sürüyor; tamamlanınca mobile alınacak. |
| Taslak faturayı düzenleme, iskonto, dövizli fatura, tarih seçimi | Fatura oluşturmanın ilk sürümünde kapsam dışı. |
| Android yayını | Karar bekliyor. |
| Otomatik testler | Yapılmadı. |
| Kargo hatası bildirimi | Sunucunun push göndermesi gerekir. |

## 6. Sunucu oturumuna iletilecekler

Mobilde geçici çözüm uygulananlar dahil; kalıcı çözüm sunucudadır.

| # | İhtiyaç | Etki |
|---|---|---|
| 1 | `/dashboard/stats` ve `/dashboard/sales-chart` sipariş tarihine ve Türkiye gününe göre hesaplasın | Web panelinde de "bugün" yanlış ya da sıfır görünebilir |
| 2 | Finans ve yerel fatura uçlarında Türkiye günü kullanılsın | 00:00–03:00 arası vade geçmişliği yanlış |
| 3 | `/reports/overview` 5000 kayıt sınırı yerine tarih süzgeci | Yüksek hacimde dönem toplamı eksik |
| 4 | `/orders` aramasına `trendyol_order_number` | Trendyol siparişi görünen numarayla bulunamıyor |
| 5 | n11'de `order_date` oluşturma tarihinden gelsin, eşitlemede ezilmesin | Eski siparişler bugüne sayılıyor |
| 6 | `/price/adjust` kanala özel fiyat kaydını da eşitlesin; kanala son gönderilen değer saklansın | Kanal satırı gerçek pazaryeri değerini göstermiyor |
| 7 | Para yazan POST uçlarında tekrar anahtarı | Yanıt kaybında mükerrer kayıt |
| 8 | Tahsilatta para birimi denetimi | Dövizli cari tahsilatı TL kasasına yazılıyor |
| 9 | `/davet/<kod>` rotası ve ödül işleme | Davet özelliği uçtan uca çalışmıyor |
| 10 | Push kaydını silme ucu | Çıkıştan sonra cihaz bildirim almaya devam ediyor |
| 11 | Oturum yenileme ya da mobil için daha uzun oturum | 24 saatte bir yeniden giriş |
| 12 | Kargo hatası ve destek yanıtı için push | Bildirim merkezi yalnızca uygulama açıkken besleniyor |
| 13 | Sipariş yanıtında kanal durumu, paket no ve takip no alanları korunsun | Doğru durum ve takip gösterimi |

## 7. Sıradaki adımlar

1. **TestFlight geri bildirimi:** build 53'ü 4. bölümdeki sırayla deneyin; bulunan sorunlar 1.1.03 (build 54) olarak toplanır.
2. **GitHub'a gönderim kararı:** kod yalnızca bu bilgisayarda. Yedek için en azından dalların push edilmesi önerilir.
3. **Sunucu ihtiyaçları:** 6. bölümdeki liste web oturumuna verilmeli; 1, 7 ve 8 numaralar veri doğruluğunu etkiliyor.
4. **İçeri Al:** web tarafı tamamlanınca mobil ekranı.
5. **Fatura oluşturmanın ikinci turu:** taslak düzenleme, iskonto, tarih seçimi.
6. **Karar bekleyenler:** Android yayını; muhasebeci rolünün cari ekleyebilmesi; ürün bilgisi düzenlemede hangi yetkinin aranacağı.
7. **Otomatik testler:** en azından tutar ayrıştırma ve tarih hesapları için.

## 8. Yerel deneme düzeni

- Sahte API: `dev/mock-api.js` (8799). Oturum durumu için `GET /__mode?session=ok|expired|locked&parasut=1|0`.
- Tarayıcı önizlemesi: `frontend` içinde `expo start --web` (8081); giriş `test@example.test`, herhangi bir parola.
- Gönderim: `frontend/app.json` içinde `expo.version` ve `expo.ios.runtimeVersion` yeni sürüme çekilir, ardından `eas build --platform ios --profile production --non-interactive --no-wait --auto-submit`. Build numarasını EAS artırır.

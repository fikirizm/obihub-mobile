# ObiHub Mobil — Yol Haritası

Tarih: 11 Kasım 2026 · Kapsam: `obihub-mobile` reposu (Expo 54 / React Native 0.81, sürüm 1.0.15)

Bu belge kod okunarak hazırlandı. Uygulama cihazda çalıştırılıp denenmedi; aşağıdaki hatalar kaynak koddan tespit edildi, ikisi (etiket ve desi) backend koduyla karşılaştırılarak doğrulandı.

## 1. Çalışma kuralları

Web/backend geliştirmesi başka bir oturumda sürüyor. Çakışmamak için:

- Bu çalışmada yalnızca `obihub-mobile` reposuna yazılır. Ana repo (`backend/`, `frontend/`) yalnızca okunur.
- Mobilin backend'den ihtiyaç duyduğu değişiklikler 7. bölümde liste olarak tutulur ve web oturumuna iletilir; buradan backend'e dokunulmaz.
- Mobil, backend'in bayrakla açılan uçlarına (İçeri Al, kalıcı gelen kutusu, finans okuma modeli) web pilotu tamamlanmadan bağlanmaz.
- Her faz kendi dalında ilerler; mağazaya gönderim ayrı onayla yapılır.

## 2. Mevcut durum

Ekranlar: giriş, şifre sıfırlama, panel, mağazalar ve mağaza siparişleri, sipariş detayı (etiket yazdırma), bekleyen/kargodaki siparişler, Paraşüt faturaları, Paraşüt teklifleri, raporlar, HepsiJet manuel gönderi.

Altyapı: çevrimdışı önbellek, açık/koyu tema, yeni sipariş bildirimi (sunucu push'u + uygulama içi yoklama).

Eksik temel parçalar:

- Mayıs'tan beri yapılan işler commit edilmemiş (25 dosya değişmiş, yeni ekranlar git'te yok).
- Otomatik test yok.
- Kullanıcı modeli yalnızca ad, e-posta ve firma tutuyor; rol, paket ve muhasebe programı bilgisi kullanılmıyor.

## 3. Bulunan hatalar (Faz 0'da düzeltilecek)

| # | Sorun | Etki | Çözüm yeri |
|---|---|---|---|
| 1 | Trendyol/Hepsiburada dışındaki siparişlerde etiket yazdırma `data` alanı bekliyor; backend bu alanı döndürmüyor | Her denemede "Etiket bulunamadı" | Mobil |
| 2 | HepsiJet manuel gönderide desi `total_desi` adıyla gidiyor; backend `desi` bekliyor | Her gönderi 1 desi olarak açılıyor | Mobil |
| 3 | HepsiJet müşteri formu yalnızca ad ve telefonu denetliyor; backend il, ilçe, mahalle ve adres de istiyor | Kullanıcı sunucu hatası görüyor | Mobil |
| 4 | Oturum anahtarı 24 saatte doluyor, yenileme yok; uygulama bunu yalnızca açılışta denetliyor | Açık kalan uygulamada tüm ekranlar hata veriyor | Mobil (401'de girişe yönlendirme) |
| 5 | Aboneliği kilitli kullanıcı girişte kalıyor ama her veri çağrısı 403 dönüyor | Boş ekranlar, açıklama yok | Mobil (kilit ekranı) |
| 6 | Yeni sipariş bildirimi hem sunucudan hem uygulamanın kendi yoklamasından geliyor | Aynı sipariş için çift bildirim olasılığı | Mobil |
| 7 | Çıkışta push kaydı silinmiyor; silme ucu da yok | Cihaz önceki kullanıcının bildirimlerini almaya devam eder | Backend + mobil |
| 8 | Sipariş yanıtı bazı alanları ayıklıyor (WooCommerce/Hepsiburada durumu, paket no, takip no çeşitleri) | Durum ve takip bilgisi eksik görünebilir | Backend veya mobil uyarlama |
| 9 | Panel, son 500 siparişi indirip ciroyu telefonda hesaplıyor | Ayda 500'den fazla siparişi olan satıcıda rakam yanlış, açılış yavaş | Mobil (`/dashboard/*` uçlarına geçiş) |
| 10 | BizimHesap kullanan firmada Fatura ve Teklif sekmeleri boş veya hatalı | Yanıltıcı ekran | Mobil (muhasebe programına göre gizleme) |
| 11 | Mobil `.gitignore` Metro önbelleğini kapsamıyor | 6000+ gereksiz izlenmeyen dosya | Mobil |

### Faz 0 durumu (11 Kasım 2026, `faz-0-onarim` dalı)

- Düzeltildi: 1, 2, 3, 4, 5, 10, 11. Madde 6 kısmen: uygulama açıkken ve arka plan yoklamasında aynı sipariş ikinci kez bildirilmiyor; toplu siparişlerde sunucu yalnızca ilk siparişin kimliğini gönderdiği için tam çözüm backend ister.
- Tarayıcıda sahte API ile (`dev/mock-api.js`) denendi: oturum süresi dolunca girişe dönüş, abonelik kilit ekranı, Paraşüt bağlı değilken Fatura/Teklif sekmelerinin gizlenmesi.
- Cihazda denenmedi: etiket yazdırma, HepsiJet desi ve müşteri formu, bildirim tekilleştirme.
- Ertelendi: 9 (Panel rakamları) Faz 1'e alındı; sunucudaki panel uçları tarih ve durum mantığında mobilden farklı, körlemesine geçiş rakamları değiştirir. 7 ve 8 backend değişikliği bekliyor.

## 4. Web'de olup mobilde olmayanlar

Öncelik, özelliğin telefonda ne kadar işe yaradığına göre verildi.

### Yüksek — telefonda günlük kullanılır

| Özellik | Web'deki yeri | Mobil durumu |
|---|---|---|
| Tüm siparişler listesi (arama, durum ve kanal filtresi) | Siparişler | Yok; siparişlere yalnızca mağaza üzerinden veya panelden ulaşılıyor |
| Bildirim merkezi (yeni sipariş, kargo hatası, destek yanıtı) | Üst çubuktaki zil | Zil yalnızca sayacı sıfırlıyor |
| Akıllı uyarılar ve etkinlik akışı | Panel | Yok |
| Ürün arama ve ürün detayı | Ürünler | Yok |
| Kanal bazında stok ve fiyat güncelleme | Ürün Stok / Ürün Fiyat | Yok |
| Finans özeti (alacak, borç, vadesi gelen/geçen) | Finans Merkezi | Yok |
| Cari hesaplar, ekstre ve tahsilat | Cari Hesaplar | Yok |
| Profil ve ayarlar | Ayarlar | Yok; çıkış ve tema üst çubukta |

### Orta — faydalı, ikinci dalga

| Özellik | Web'deki yeri | Not |
|---|---|---|
| Kasa ve bankalar (bakiye, hareket, virman) | Kasa | |
| ObiHub satış faturaları (oluştur, resmileştir, tahsilat) | Fatura Oluştur | BizimHesap ve Paraşüt'süz firmalar için tek fatura yolu |
| BizimHesap faturaları | Satış Faturaları | Muhasebe izolasyonu kuralına göre ayrı ekran |
| Gider faturaları (okuma) | Gider Faturaları | |
| Gelen e-faturalar: liste, PDF, durum | Gelen Faturalar | Önce yalnızca okuma |
| İçeri Al (gelen faturayı gidere işleme) | Gelen Faturalar | Web pilotu tamamlanınca; bayraklı uçlara bağlı |
| Senkron işleri ve yeniden deneme | İşlemler | |
| Destek talepleri | Destek Taleplerim | |
| Abonelik durumu (yalnızca görüntüleme) | Abonelik | Uygulama içinden satış App Store kurallarına takılır; yalnızca durum gösterilmeli |
| Barkod okutarak ürün bulma | (web'de POS'ta) | Telefon kamerasıyla; mobilde web'den daha iyi olabilecek tek alan |

### Mobilde yapılmamalı — web'de kalsın

Entegrasyon kimlik bilgileri ve ayarları, ürün eşleştirme, kategori yönetimi, toplu işlemler, POS (tablet/masaüstü tasarımı), ilk kurulum sihirbazı, muhasebe programı bağlama, faturalandırma/ödeme, Super Admin.

## 5. Arayüz değerlendirmesi

Mevcut arayüz derli toplu: tutarlı boşluklar, koyu tema, iskelet yükleme, yumuşak animasyonlar var. Premium hissini düşüren noktalar şunlar:

1. **Altı sekmeli alt çubuk.** iOS'ta beşten fazla sekme sıkışık durur. Ayrıca en çok kullanılan şey olan "Siparişler" sekme değil; "Mağaza" sekmesinin içinde.
2. **Her sekmenin ayrı vurgu rengi** (lacivert, mavi, yeşil, turuncu, mor, turuncu). Marka tek renk gibi durmuyor.
3. **Üst çubukta tek dokunuşla çıkış**, onaysız. Yanlışlıkla çıkış kolay. Tema düğmesi de her ekranda yer kaplıyor.
4. **"Hoş geldin + ad" her ekranda tekrar ediyor**; ekran başlığı için yer kalmıyor, her sayfada aynı 60 piksel harcanıyor.
5. **Koyu gradyanlı "hero" kartı hem Panel'de hem Mağazalar'da.** Mağazalar'daki kart bilgi taşımıyor ("Hepsi tek panelde"), listeyi aşağı itiyor.
6. **Renkler dosyalara elle yazılmış** (tema dosyası dışında yaklaşık 150 renk kodu). Koyu temada tutarsızlığa yol açar.
7. **10–11 punto, büyük harfli etiketler çok yaygın.** Okunması zor; premium uygulamalar bunu az kullanır.
8. **Onay ve hata mesajları sistem uyarı kutusuyla** (30'dan fazla yerde). Alt sayfa (bottom sheet) ve kısa bildirim (toast) daha rafine durur.
9. **Erişilebilirlik etiketi hiç yok.** VoiceOver kullanılamaz; App Store incelemesinde de eksi.
10. **Listeler tek seferde 200–500 kayıt çekiyor**, sayfalama yok. İskelet yükleme yalnızca Panel'de.
11. **Para tutarlarında rakamlar eş genişlikte değil**; listelerde sütunlar hizalanmıyor.

### Önerilen premium yön

Mevcut tasarım dili (lacivert/mavi, Stripe–Linear sadeliği) korunur; yeniden tasarım değil, sadeleştirme ve tutarlılık.

- **Gezinme:** dört sekme + menü.

  | Sekme | İçerik |
  |---|---|
  | Panel | Bugün, uyarılar, bekleyen işler |
  | Siparişler | Tüm siparişler; kanal ve durum filtresi, arama |
  | Finans | Faturalar, teklifler, cari, kasa (muhasebe programına göre) |
  | Raporlar | Gelir/gider, kanal ve ürün analizi |
  | Menü | Ürünler ve stok, mağazalar, kargo (HepsiJet), destek, ayarlar, çıkış |

- **Tek vurgu rengi** (mevcut mavi); kanal renkleri yalnızca kanal logolarında.
- **Üst çubuk:** solda büyük ekran başlığı, sağda zil (bildirim merkezini açar) ve profil. Çıkış ve tema profil ekranına taşınır.
- **Panel:** "bugün ne yapmalıyım" odaklı. Üstte bugünün cirosu ve siparişi, altında eyleme dönük kartlar (bekleyen sipariş, kargo hatası, vadesi geçen alacak), sonra aylık grafik.
- **Ortak bileşen seti:** liste satırı, kart, filtre çipi, alt sayfa, toast, boş durum, iskelet. Tüm ekranlar bu setten kurulur; elle renk yazımı kalkar.
- **Ayrıntılar:** para tutarlarında eş genişlikli rakam, en küçük yazı 12 punto, dokunma geri bildirimi (haptik) yalnızca tamamlanan işlemlerde, kaydırarak hızlı eylem (siparişte "etiket yazdır").
- **Güven:** Face ID / parmak izi kilidi (finans verisi telefonda duruyor).

## 6. Fazlar

### Faz 0 — Güvence ve onarım
- Mevcut işlerin commit edilmesi, `.gitignore` düzeltmesi.
- 3. bölümdeki 1–6 ve 9–11 numaralı hatalar.
- Uygulamanın simülatörde çalıştırılıp mevcut ekranların tek tek denenmesi.
- Çıktı: 1.0.16 düzeltme sürümü.

### Faz 1 — Premium kabuk
- Yeni gezinme (dört sekme + menü), yeni üst çubuk, profil/ayarlar ekranı.
- Ortak bileşen seti ve renklerin temaya taşınması.
- Ortak veri katmanı: sayfalama, önbellek, oturum süresi dolunca girişe yönlendirme.
- Kullanıcı rolü ve muhasebe programına göre ekran gösterme/gizleme.
- Bildirim merkezi.
- Panel'in sunucu uçlarına geçmesi; akıllı uyarılar.

### Faz 2 — Sipariş ve ürün operasyonu
- Tüm siparişler ekranı (arama, filtre, sonsuz kaydırma).
- Sipariş detayından HepsiJet gönderisi oluşturma.
- Ürün arama, ürün detayı, barkod okutma.
- Kanal bazında stok ve fiyat güncelleme.
- Senkron işleri.

### Faz 3 — Finans
- Finans özeti, cari hesaplar, ekstre, tahsilat.
- Kasa ve bankalar.
- ObiHub satış faturaları; BizimHesap faturaları.
- Gider faturaları (okuma).

### Faz 4 — Gelen faturalar
- Gelen e-fatura listesi, PDF, durum.
- İçeri Al (web pilotu tamamlandıktan sonra).

### Faz 5 — Hesap ve yayın
- Destek talepleri, abonelik durumu, davet et.
- Biyometrik kilit.
- Android yayını (yapılandırma var, mağaza kaydı görünmüyor).
- Temel otomatik testler.

## 7. Backend'den gerekecekler (web oturumuna iletilecek)

| İhtiyaç | Neden | Faz |
|---|---|---|
| Push kaydını silme ucu | Çıkışta cihazın bildirim almayı bırakması | 0 |
| Sipariş yanıtında kanal durumu, paket no ve takip no alanlarının korunması | Doğru durum ve takip gösterimi | 0–2 |
| Oturum yenileme (refresh) veya mobil için daha uzun oturum | 24 saatte bir yeniden giriş istememek | 1 |
| `/auth/me` yanıtında rol, paket ve muhasebe programı | Ekranları doğru göstermek | 1 |
| Kargo hatası, destek yanıtı gibi olaylar için push | Bildirim merkezinin sunucudan beslenmesi | 1–2 |

Bunlar olmadan da ilerlenebilir; mobil tarafta geçici çözümler mümkün (örneğin muhasebe programını `/settings/accounting` üzerinden okumak).

## 8. Açık kararlar

1. BizimHesap kullanan firmalar mobil kapsamında mı? (Faz 3'ün büyüklüğünü belirler.)
2. Android yayını hedef mi, yoksa şimdilik yalnızca iOS mu?
3. Faz 1'deki gezinme değişikliği (dört sekme + menü) onaylanıyor mu?

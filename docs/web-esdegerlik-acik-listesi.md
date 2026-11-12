# Mobil ↔ Web Eşdeğerlik Açık Listesi

- **Tarih:** 12 Kas 2026
- **Mobil taban:** `surum-1.1.03` dalı, `1001309`. Bu taban, 1.1.04 (build 55) ve henüz gönderilmemiş 1.1.05 adaylarını içerir.
- **Yöntem:**
  - Web tarafı: `frontend/src/App.js` rotaları ile sayfa ve bileşenlerdeki tüm `api.*` çağrıları sayfa sayfa çıkarıldı.
  - Mobil tarafı: `obihub-mobile/frontend/app/**` ekranları ile `src/api*.ts` uçları karşılaştırıldı.
  - Arka plan: `docs/mobil-web-esitleme-raporu.md` ve `docs/mobil-oturum-icin-notlar.md`.
- **Durum kodları:**
  - **Var:** web'deki işlem mobilde de yapılabiliyor.
  - **Kısmi:** okuma var, işlemlerin bir kısmı yok.
  - **Yok:** mobilde karşılığı yok.
- **Büyüklük:**
  - **S:** yarım gün ve altı.
  - **M:** 1–2 gün.
  - **L:** 3 gün ve üstü.
  - Bu tahminlere sahte API ile deneme ve iskelet, boş ve hata durumları dahildir.
- **Sunucu sütunu:**
  - "Mevcut": web'in kullandığı uç canlıda var, yeni sunucu işi gerekmez.
  - "Gerekli": PM'den istenecek iş.

---

## 1. Önerilen öncelik sırası (PM onayına)

Sıralama günlük kullanım sıklığına ve iş değerine göre yapıldı. Her dalga ayrı bir sürüm (1.1.0X) olabilir.

| Sıra | Madde | Büyüklük | Neden önce |
|---|---|---|---|
| 1 | **A1** Siparişten fatura kes + mağazaya paylaş | M | Pazaryeri satıcısının her gün her siparişte yaptığı iş; mobilde hiç yok. |
| 2 | **A2** Trendyol/Idefix "İşleme al" | S | Siparişin kargoya hazırlanmasının ilk adımı. |
| 3 | **A3** Etiket kenar çubuğu farkları (HepsiJet barkodu sil/yenile) | S | Yanlış barkodu mobilde düzeltememe sorunu. |
| 4 | **B1** Ürün eşleştirme (kanal / muhasebe bağla-çöz) | L | Stok/fiyat gönderiminin önkoşulu; Trendyol barkod sorununun kalıcı çözümü kullanıcının elinde olmalı. |
| 5 | **C1** Gelen e-fatura "İçeri Al" + PDF | L | Alış faturasının stok ve borca girdiği tek yol; günlük. |
| 6 | **C2** Gider detayı + borç ödeme | M | Gider listesi var, ama satıra dokununca bir şey yapılamıyor. |
| 7 | **B2** Stok ekranı (tüm hareketler + stok özeti) | M | Web'deki "Stok" sayfası; muhasebe farkları zaten mobilde. |
| 8 | **C3** Elle alış/gider faturası (ürün satırlı) | L | P3 ile stok girişine de dönüştü. |
| 9 | **D1** Hızlı satış (POS) | L | Mağazası olan firmalar için günlük. Mobilde kamera barkod okuyucu avantajı var. |
| 10 | **B3** Yeni ürün + görseller + satışa aç/kapa | M | Katalog büyütme. |
| 11 | **C4** Satış faturası düzenle/sil | M | Yanlış kesilen taslağı düzeltme. |
| 12 | **C5** Cari düzenle/sil, cari siparişleri | S | |
| 13 | **E1** HepsiJet manuel gönderi farkları | M | İl/ilçe listeleri, toplu oluşturma, silme. |
| 14 | **F1** Rapor ve pano farkları | M | |
| 15 | **G** Cila turu (eski ekranlar) | M+ | Her dalgaya bir ekran grubu olarak dağıtılabilir. |
| — | **H** Web'de kalması önerilenler | — | PM kararı. |

---

## 2. Siparişler

| # | Web'de | Mobil | Önerilen mobil karşılığı | Sunucu | Büyüklük |
|---|---|---|---|---|---|
| A1 | Fatura kes: `POST /orders/{id}/create-invoice` (eşzamanlıda `{success:false,in_progress:true}`). Faturayı aç: `parasut_invoice_url`. Mağazaya paylaş: `POST /orders/{id}/share-invoice-to-store`. | Yok | Sipariş detayında "Fatura" bölümü: "Fatura kes", sonra "Faturayı aç" ve "Mağazaya gönder". Listede faturalı/faturasız rozeti. | Mevcut | M |
| A2 | İşleme al: `POST /trendyol/orders/{id}/take-in-processing`, `/idefix/…` | Yok | Sipariş detayında, durum "Bekleyen" iken birincil düğme. | Mevcut | S |
| A3 | HepsiJet barkodunu sil: `DELETE /hepsijet/shipment/{barcode}`, ardından yeni barkod oluştur. | Kısmi: oluşturma var, silme yok. | Sipariş detayındaki kargo kartında "Barkodu iptal et", onay sayfasıyla. | Mevcut | S |
| A4 | Toplu silme ("Silinmiş" durumundakiler): `POST /orders/bulk-delete` | Yok | Siparişler sekmesinde "Silinmiş" süzgeci ve "Tümünü temizle". **Gezinme değil, liste içi.** | Mevcut | S |
| A5 | Hepsiburada siparişini numarayla çek: `POST /hepsiburada/{id}/sync-order-by-number`. Senkronda tarih aralığı ve tam senkron seçenekleri. | Kısmi: düz "Senkronize et" var. | Mağaza sipariş ekranında "Sipariş no ile getir" girişi. | Mevcut | S |
| A6 | Toplu HepsiJet gönderisi (çoklu seçim) | Yok | Sipariş listesinde çoklu seçim modu. Haptics + alt eylem çubuğu. | Mevcut | M |
| A7 | Durum sekmeleri: pending / processing ("Gönderime hazır") / shipped / delivered / cancelled / deleted | Kısmi: Bekleyen, Kargoda, Tamamlandı, İptal | "Gönderime hazır" ve "Silinmiş" sekmeleri eklenmeli. | Mevcut | S |
| — | Durum değiştir, etiketler (HepsiJet/HB/Trendyol/ürünlü), uzaktan yazdır, mağaza senkronu, tarih düzeltme | **Var** | — | — | — |

## 3. Ürün, stok, fiyat

| # | Web'de | Mobil | Önerilen mobil karşılığı | Sunucu | Büyüklük |
|---|---|---|---|---|---|
| B1 | Kanal eşleştirme: `GET /integrations/{id}/source-products`, `POST /products/{id}/link-channel` (`integration_id`, Trendyol `barcode`) / `unlink-channel`. Muhasebe eşleştirme: `GET /parasut/products`, `POST /products/{id}/link-parasut` / `unlink-parasut`. | Yok. Not metni "Ürün eşleştirme web panelinden yapılır" diyor. | Ürün detayında eşleşmemiş kanal satırına dokununca alt sayfa açılır: kanal ürünlerinde arama → seç → bağla. Eşleşmiş satırda "Eşleşmeyi kaldır". Barkod uyuşmazlığı varsa uyarı. | Mevcut. Mağaza ürün listesinde arama parametresi doğrulanmalı. | L |
| B2 | Stok sayfası: tüm ürünlerin hareketleri (`GET /stock/movements` ürün süzgeçsiz), `GET /stock/summary` (elde / ayrılmış / satılabilir toplamları), hareket ekle. | Kısmi: hareketler yalnız ürün detayında; muhasebe farkları Ürünler ekranında. | Ürünler ekranının başında özet kartı ve "Son hareketler" bölümü (liste içi). Yeni sekme gerekmiyor. | Mevcut | M |
| B3 | Yeni ürün: `POST /products`. Görseller: `PATCH /products/{id}` `{image_url, images}`. Tüm kanallarda satışa aç/kapa: `POST /products/{id}/bulk-sales-status`. Kategori seçimi. | Kısmi: ad/SKU/barkod düzenleme var; oluşturma, görsel ve satış durumu yok. | Ürünler ekranında "+" (başlıkta). Detayda görsel galerisi (kamera/galeri). Web URL ile ekliyor; mobilden yükleme için sunucu ucu gerekir. "Satışa kapat" anahtarı. | Görsel **yükleme** için **gerekli** (ör. `POST /products/{id}/images` çok parçalı). URL ile ekleme mevcut. | M (+ sunucu) |
| B4 | Kanalda ürün oluştur: `POST /products/{id}/create-channel-product` (Trendyol marka/kategori/özellik formu) | Yok | Web'de kalması önerilir (H): uzun özellik formu. | Mevcut | L |
| B5 | Ürün içgörüleri / satış raporu sekmesi: `GET /products/{id}/insights` | Yok | Ürün detayında "Satış" kartı (son 30 gün adet/ciro, kanal kırılımı). | Mevcut | S |
| B6 | Toplu ürün işlemleri: muhasebeden içe aktar, BizimHesap/BenimPOS toplu eşleştir, Woo'ya gönder/sil, toplu sil | Yok | Web'de kalması önerilir (H). | — | — |
| — | Ana stok Ekle/Çıkart/Eşitle, ana fiyat, kanal stok/fiyat (bekleyen değer, push rozeti), hareketler, muhasebe farkları, Elde/Ayrılmış/Satılabilir, barkod okutma, iş kuyruğu + yeniden dene | **Var** | — | — | — |

## 4. Finans ve muhasebe

| # | Web'de | Mobil | Önerilen mobil karşılığı | Sunucu | Büyüklük |
|---|---|---|---|---|---|
| C1 | Gelen e-fatura **İçeri Al**: `GET /incoming-invoices/quick-import/capability`, `POST …/{id}/quick-import/preview` → `…/confirm`, `GET …/status`, gider kategorileri, depo seçimi. PDF: `GET …/pdf` + `POST /documents/signed-url`. Gelen kutusunu yenile: `POST /incoming-inbox/refresh`. | Kısmi: liste ve içeri alma durumu var; işlem yok. | Gelen fatura satırına dokununca detay alt ekranı açılır: PDF önizleme, "İçeri Al" sihirbazı (tek soru + dolu form, web'deki Paraşüt modeli). 500 → "sonuç bilinmiyor" durumu sorgulanır. | Mevcut | L |
| C2 | Gider detayı: `GET /accounting/expense-invoices/{ref}`. Borç ödeme: `GET/POST /accounting/payables/{ref}/payments` (`idempotency_key`; 4xx sonrası yeni anahtar, ağ hatasında aynı anahtar). | Kısmi: liste + özet var. | Gider satırına dokununca detay ekranı açılır, "Ödeme ekle" mevcut tahsilat sayfa düzeniyle (hesap süzgeci, kalan kontrolü). | Mevcut | M |
| C3 | Elle alış/gider: `POST /accounting/manual-purchases/preview` (ürün satırı, depo) → `…/{draft}/confirm` `{decision_digest, idempotency_key}`. Cari ve kategori seçimi. `ui-capabilities.expense_manual_entry` kapısı. | Yok | Giderler ekranında "+ Gider/alış ekle" formu: tedarikçi, satırlar (ürün ya da kategori), önizleme, onay. Satış faturası formunun bileşenleri yeniden kullanılır. | Mevcut | L |
| C4 | Satış faturası düzenle (`PUT /local-invoices/{id}`) ve sil (`DELETE`). Paraşüt tahsilat senkronu (`…/payments/{pid}/parasut-sync`, `parasut-resolve`). Paraşüt'ten içe aktarma. | Kısmi: oluştur, tahsilat, resmileştir, durum sorgula var. | Detayda "Düzenle" (taslak/resmîleşmemiş) ve "Sil". Tahsilat satırında senkron durumu ve "Yeniden gönder". İçe aktarma web'de kalabilir. | Mevcut | M |
| C5 | Cari düzenle (`PUT /customers/{id}`), sil (`DELETE`), cari siparişleri (`GET /customers/{id}/orders`), siparişlerden cari oluştur (`POST /customers/sync-from-orders`). Rol süzgeci (müşteri/tedarikçi). | Kısmi: liste, ekstre, tahsilat, yeni cari var. | Cari detayında "Düzenle / Sil" ve "Siparişler" sekmesi. Listede rol çipleri. | Mevcut | S |
| C6 | Kasa hareketine kategori (`category`) | Kısmi: gövdede yok | Kasa giriş/çıkış formuna kategori çipleri. | Mevcut | S |
| C7 | Gider kategorileri yönetimi | Yok | Web'de kalması önerilir (H); C3'te yalnız seçim. | — | — |
| C8 | Teklif oluşturma formu (`POST /parasut/sales-offers`, cari/ürün arama) | Kısmi: liste, detay, onay/red, ödeme linki, kopyala var; sıfırdan form doğrulanmalı. | Teklif listesinde "+ Yeni teklif". Fatura formu bileşenleri kullanılır. | Mevcut | M |
| — | Finans panosu, kasa/banka hesapları + hareket + transfer + yeni hesap, muhasebe faturaları + PDF + resmileştir, teklifler, gider listesi (ObiHub/Paraşüt sekmeleri) | **Var** | — | — | — |

## 5. Satış noktası (POS)

| # | Web'de | Mobil | Önerilen mobil karşılığı | Sunucu | Büyüklük |
|---|---|---|---|---|---|
| D1 | `POST /pos/sales` `{items, customer_*, payment_type: nakit/kart/acik_hesap, subtotal, discount_amount, vat_amount, total}`. Katalog `GET /products`, cari arama. | Yok | "Hızlı satış" ekranı: kamera barkodla sepete ekle, adet/indirim, ödeme tipi, açık hesapta cari seç, satış sonrası makbuz özeti. **Girişi yeni sekme ya da pano kısayolu olacağı için gezinme önerisi PM'e ayrıca sunulacak.** | Mevcut. `Idempotency-Key` desteği önerilir (çift dokunuşta çift satış riski). | L (+ S sunucu) |

## 6. Kargo ve HepsiJet

| # | Web'de | Mobil | Önerilen mobil karşılığı | Sunucu | Büyüklük |
|---|---|---|---|---|---|
| E1 | Manuel gönderi: il/ilçe/mahalle seçicileri (`GET /hepsijet/cities`, `/towns/{id}`, `/districts/{id}`); toplu oluşturma (`…/shipments/bulk`); tekli/toplu silme; alıcı düzenle/sil. | Kısmi: liste, oluştur, takip, etiket, uzaktan yazdır, alıcılar var; il/ilçe serbest metin. | HepsiJet sekmesinde aranabilir il/ilçe seçici, "Adet" alanı, kaydırarak sil. | Mevcut | M |
| E2 | Woo siparişlerinde varsayılan özgün HepsiJet etiketi | Ertelenmiş | Etiket seçicide varsayılanı web'le eşitle. | Mevcut | S |

## 7. Rapor, pano, bildirim

| # | Web'de | Mobil | Önerilen mobil karşılığı | Sunucu | Büyüklük |
|---|---|---|---|---|---|
| F1 | Rapor: kanal çoklu seçimi (`integration_id` virgüllü), "Bu ay", gelir-gider özeti (Paraşüt fatura sayfaları). | Kısmi: dönem ve kanal raporu var. | Raporlar ekranında kanal çipleri (çoklu), "Bu ay" ön ayarı, gelir-gider kartı. Gelir-gider için mobilde sayfa sayfa çekim ağır; **sunucuda özet uç önerilir**. | Gelir-gider için **gerekli** (ör. `GET /reports/income-expense?period=`) | M (+ sunucu) |
| F2 | Pano: `GET /dashboard/recent-orders`, `/dashboard/overview` | Kısmi | Panoda "Son siparişler" şeridi. | Mevcut | S |
| F3 | Bildirim okundu: `POST /support/notifications/mark-read` | Kısmi: liste var | Bildirimler ekranında okundu işareti ve rozet sayısı. | Mevcut | S |

## 8. Cila turu (eski ekranlar)

Ölçüm (41 ekran):
- İskelet yükleme 14 ekranda var.
- Haptics yalnız 3 ekranda var: sipariş listesi, sipariş detayı, barkod.
- `EmptyState` 22 ekranda kullanılıyor.
- Bazı listeler `ListBody` üzerinden iskelet alıyor olabilir; madde madde doğrulanacak.

| # | Kapsam | Yapılacak | Büyüklük |
|---|---|---|---|
| G1 | Ortak dil | Boşluk, tipografi ve renk belirteçlerinin denetimi. Başlık + büyük sayı + alt metin hiyerarşisini tek `HeroStat` bileşenine toplama. İkon boyutlarını eşitleme. | M |
| G2 | Haptics | Tüm birincil eylemlere (kaydet, tahsilat, stok, durum değiştir), başarı/hata bildirimlerine, çekip yenilemeye ve seçim çiplerine tek `haptic()` yardımcısı. | S |
| G3 | İskelet yükleme | İskeleti olmayan liste ve detay ekranları: ürün detayı, müşteriler, giderler, faturalar, teklifler, destek, finans sekmesi, HepsiJet. | M |
| G4 | Boş ve hata durumları | Her listeye görselli boş durum ve yönlendirme (ör. "Henüz gider yok, + Gider ekle"); hata durumunda "Yeniden dene". | M |
| G5 | Geçişler | Liste → detay paylaşımlı başlık geçişi, sayıların sayaç animasyonu, alt sayfa yay eğrileri; "hareketi azalt" ayarına uyum. | M |
| G6 | Karanlık mod | Tüm ekranların karanlık modda ekran görüntüsü turu: kontrast, gölge yerine kenar, rozet renkleri. | S |
| G7 | Erişilebilirlik | Dokunma hedefi ≥44 pt, VoiceOver etiketleri, dinamik yazı boyutu taşmaları. | S |

> Yeni ekranlar (A–F) ilk günden G1–G7 çıtasıyla yapılır; G maddeleri yalnız mevcut ekranlar için.

## 9. Web'de kalması önerilenler (PM kararı)

| Madde | Gerekçe |
|---|---|
| Entegrasyon ayarları, kimlik bilgisi gösterme (OTP), mağaza ekleme/silme, Amazon OAuth | Uzun yapılandırma formları, gizli bilgi. Mobilde yalnız durum ve senkron. |
| Kargo ayarları (HepsiJet, Yurtiçi), ürün ayarları, stok sahibi seçimi, muhasebe bağlantıları, gelen fatura kaynağı | Yönetim ayarı; PM kararıyla stok sahibi web'de. |
| Abonelik satın alma, paket yükseltme, ödeme (PayTR) | App Store kuralları (uygulama içi dijital satın alma); mobilde yalnız durum + web'e yönlendirme (bugünkü hâli). |
| Toplu ürün işlemleri (B6), kanalda ürün oluşturma (B4), kategori yönetimi, AI zenginleştirme | Masaüstü iş akışları; mobilde değer düşük. |
| Paraşüt'ten satış faturası içe aktarma, gider kategorisi yönetimi (C7) | Seyrek, yönetimsel. |
| Profil ve e-posta değişikliği | Mobilde salt okuma; istenirse S. |

## 10. Sunucudan istenecekler (özet)

1. **Ürün görseli yükleme ucu** (B3): çok parçalı yükleme → R2 → `images[]`. Bugün web yalnız URL ile ekliyor.
2. **POS satışında `Idempotency-Key`** (D1): mobil ağda çift satış koruması.
3. **Gelir-gider özet ucu** (F1): istemcide sayfa sayfa Paraşüt fatura çekmek yerine.
4. Mağaza kaynak ürün listesinde (`/integrations/{id}/source-products`) sunucu tarafı arama ve sayfalama doğrulaması (B1): büyük katalogda mobil bellek.

## 11. Doğrulama düzeni

- Her madde: sahte API (`dev/mock-api.js`) ile tarayıcıda mobil görünüm, `tsc` temiz, karanlık mod ekran görüntüsü.
- Yazma işlemlerinde belirsiz yazım (ağ hatası / 5xx) uyarısı ve işlem anahtarı, mevcut stok/tahsilat düzenindeki gibi.
- Sürüm öncesi PM'e rapor; sonra EAS + TestFlight. Gerçek hesapla deneme kullanıcıda.

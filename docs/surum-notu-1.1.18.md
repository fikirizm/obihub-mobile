# ObiHub mobil 1.1.18 (build 75) — sürüm notu taslağı

Durum: hazır, yüklenmedi. TestFlight'a yalnız kullanıcının "TestFlight'a yükle" sözüyle gönderilir.
Kapsam: 1.1.17 (c1a5e79) sonrası, dal `surum-1.1.03` ucu (bu not güncellenirken 3218a4f). Yayın anında dal ucunun tamamı gider.

## TestFlight "Neler yeni" metni (kullanıcıya)

- Giriş güvenliği: yeni şifreler en az 12 karakter, büyük/küçük harf, rakam ve özel karakter içermeli. Şifresinin süresi dolan kullanıcı "Şifremi unuttum" ile hemen yeni şifre belirleyebilir.
- Satış faturası: yarım kalan yeni fatura ve yeni ürün formu taslak olarak saklanır ("Devam et / At").
- Fatura yazarken müşteriye ya da ürün kalemine dokunarak hızlı bakış: bakiye, son hareketler, siparişler; ürünün fiyatı, depo stoğu, son alış ve satışları.
- E-belge: e-belgesi düşen faturada "E-belgeyi yeniden dene" (eksik il/ilçe/VKN tamamlanır, yeni fatura açılmaz); aynı faturaya ikinci e-belge gönderimi engellendi.
- EDM e-Fatura ve Trendyol E-Faturam: fatura detayında e-belge kartı (durum, resmî numara, ETTN, önceki ETTN'ler, "Test ortamı" etiketi); EDM'de başarısız gönderimi aynı numarayla yeniden gönderme.
- Kategori ve etiketler: cari, fatura, gider ve kasa kayıtlarında görünür; cari ve fatura listelerinde kategori/etiket filtresi.
- Toplu SMS: cariler, tüm kanal sipariş müşterileri ve web üyeleri tek listede; arama ve filtreler.
- Bildirimler: türe göre çipler ve Bugün / Dün / Bu hafta / Daha eski grupları.
- Amazon: stok gönderim durumu, FBA ürünlerinde stok girişi kapalı, ilk eşitleme onayı; Amazon logosu.
- Finans: bekleyen işler sayaçları, gönderilmemiş fatura filtresi, etiket bazında kârlılık, KDV ve gelir-gider raporları, dövizli borç ödemesi.
- Siparişler: Sipariş Raporu kısayolu, kanaldan ürün çekme ve eşleştirme kuyruğu, Yurtiçi Kargo gönderisi, sipariş faturası ve resmileştirme, iade talepleri.
- Abonelik: web'de seçilen sonraki dönem paketi görünür.
- Menü: Ayarlar · Abonelik · Destek Taleplerim · Bildirimler sırası.
- Çok sayıda görsel düzeltme ve hız iyileştirmesi.

## Teknik özet (PM için)

1.1.17 sonrası commit'ler (eskiden yeniye özet): Netgsm SMS ekranı; %0 KDV istisna kodu; iade talepleri; elle/gelen irsaliye;
finans raporları ve KDV devri; dövizli borç ödemesi; Yurtiçi Kargo; çalışanlar; elle gider (çalışan cebinden); sipariş faturalandırma
(C4) ve kanal fatura ayarı; kanaldan ürün çekme (C5); P6.3 finans eşdeğerliği; Sipariş Raporu düğmesi; Amazon FBM; DPP giriş
güvenliği; sonraki dönem paketi; e-belge koruması ve yeniden deneme; Toplu SMS birleşik liste; bildirim grupları; menü sırası;
form taslakları; cari/ürün hızlı bakışı; HB il/ilçe adres düzeltmesi; Paraşüt sınıflandırma uyarısı; kategori/etiket
çipleri (A) ve filtre (B); EDM e-Fatura / Trendyol E-Faturam e-belge kartı (Test ortamı, önceki ETTN, yeniden gönder).

## Yayın adımları (kullanıcı sözü gelince)

1. `frontend/app.json` → `"version": "1.1.18"`, commit "Sürüm 1.1.18".
2. Yerel EAS build (production, iOS); build numarası 75.
3. `node dev/check-ios-build.mjs <ipa>` → UYGUN olmalı.
4. Dalı GitHub'a gönder (`surum-1.1.03`), `eas submit` ile TestFlight.
5. PM'e dal ucu, build numarası ve test sonucu bildirilir.

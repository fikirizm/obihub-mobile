// Kamera barkod koruması (saf modül; birim testi dev/test-scan-guard.mjs).
// Kamera, barkod çerçevede kaldıkça her karede onu yeniden okur. Eski kural ilk okumadan 1,5 sn sonra aynı barkodu yeniden
// saydığından barkod tutuldukça ürün 5, 6, 7 adet ekleniyordu. Yeni kural: aynı barkod her okunduğunda "son görülme" yenilenir;
// barkod ancak çerçeveden çıkıp en az GAP_MS boyunca görülmedikten sonra yeniden sayılır. Farklı barkod hemen sayılır.

export const SCAN_GAP_MS = 1000;

export function createScanGuard(gapMs = SCAN_GAP_MS) {
  let lastCode = "";
  let lastSeen = -Infinity;
  return {
    accept(code: string, now: number): boolean {
      if (!code) return false;
      const fresh = code !== lastCode || now - lastSeen > gapMs;
      lastCode = code;
      lastSeen = now;
      return fresh;
    },
  };
}

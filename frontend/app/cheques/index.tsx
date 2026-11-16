// Dalga 3 (P3.1): Çekler — GET /cheques?direction=received|issued&status=. Portföy, vadesi yaklaşan, tahsil edilen, ciro, verilen.
// Eylemler sunucunun `actions`'ına göre: tahsil et (hesaba), ciro et (tedarikçiye), karşılıksız/iade, ödendi, makbuz, sil (ters kayıt).
// detached:true çekte yalnız Sil. Para birimleri asla tek sayıya inmez. "Satış" yetkili üye çekleri göremez (403).
import React, { useCallback, useEffect, useState } from "react";
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { useAuth } from "../../src/auth/AuthProvider";
import { canManage } from "../../src/auth/permissions";
import { API_BASE_URL, getPickableAccounts, newIdempotencyKey, request } from "../../src/api";
import { bytesToBase64 } from "../../src/inbox-ui";
import { printOrShare } from "../../src/pdf";
import { ACTION_LABEL, chequeActions, chequeErrorText, chequesPath, dueText, FILTERS, readError, totalsOf, type ChequeAction, type Direction } from "../../src/cheques";
import { useTheme } from "../../src/theme/ThemeProvider";
import { spacing, tabular, type } from "../../src/theme/tokens";
import { formatDate, formatMoney } from "../../src/utils";
import { EmptyState } from "../../src/components/EmptyState";
import { AlertIcon, WalletIcon } from "../../src/components/Icons";
import { StatusBadge } from "../../src/components/StatusBadge";
import { Button } from "../../src/ui/Button";
import { Chip, ChipRow, SegmentedControl } from "../../src/ui/Chip";
import { useFeedback } from "../../src/ui/Feedback";
import { StackHeader } from "../../src/ui/Header";
import { Card } from "../../src/ui/ListRow";

const TONE: Record<string, "info" | "success" | "neutral" | "error" | "warning"> = {
  portfoy: "info",
  verildi: "info",
  tahsil_edildi: "success",
  odendi: "success",
  ciro_edildi: "neutral",
  karsiliksiz: "error",
  iade_edildi: "warning",
  silindi: "neutral",
};
const money = (amount: unknown, cur?: string) => formatMoney(Number(amount) || 0, cur || "TRY");

export default function ChequesScreen() {
  const { token, user } = useAuth();
  const { colors } = useTheme();
  const { toast, confirm, choose } = useFeedback();
  const mayWrite = canManage(user, "billing");
  const [direction, setDirection] = useState<Direction>("received");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await request<any>(chequesPath(direction, status), { method: "GET" }, token));
      setError("");
    } catch (e: any) {
      setError(readError(e));
    } finally {
      setRefreshing(false);
    }
  }, [token, direction, status]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const pickAccount = async (cur: string) => {
    const list = (await getPickableAccounts(token as string)).filter((a) => String(a.currency || "TRY").toUpperCase() === (cur || "TRY"));
    if (!list.length) {
      toast(`${cur || "TRY"} para biriminde kullanılabilir kasa/banka hesabı yok.`, "error");
      return null;
    }
    return choose<string>({ title: "Hangi hesaba?", message: "Çek tutarı bu hesaba girer.", options: list.map((a) => ({ value: a.id, label: a.name })) });
  };

  const run = async (c: any, action: ChequeAction) => {
    if (!token || busy) return;
    const base = `/cheques/${encodeURIComponent(c.id)}`;
    let path = `${base}/${action}`;
    let method = "POST";
    let body: Record<string, unknown> = {};
    if (action === "receipt") {
      setBusy(c.id);
      try {
        const res = await fetch(`${API_BASE_URL}${base}/receipt.pdf`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw { status: res.status };
        const b64 = bytesToBase64(new Uint8Array(await res.arrayBuffer()));
        if (Platform.OS === "web") toast("Makbuz hazır (web önizlemesinde açılmaz).", "info");
        else {
          const file = `${FileSystem.cacheDirectory}cek-makbuz-${String(c.cheque_no || c.id).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
          await FileSystem.writeAsStringAsync(file, b64, { encoding: FileSystem.EncodingType.Base64 });
          await printOrShare(file);
        }
      } catch {
        toast("Makbuz alınamadı.", "error");
      } finally {
        setBusy("");
      }
      return;
    }
    if (action === "collect" || action === "pay") {
      const acc = await pickAccount(c.currency);
      if (!acc) return;
      body = { account_id: acc };
    } else if (action === "return") {
      const reason = await choose<string>({
        title: "Çek neden döndü?",
        message: "Carinin alacağı yeniden açılır.",
        options: [
          { value: "bounced", label: "Karşılıksız" },
          { value: "returned", label: "Müşteriye iade edildi" },
        ],
      });
      if (!reason) return;
      body = { reason };
    } else if (action === "endorse") {
      let suppliers: any[] = [];
      try {
        suppliers = (await request<any>("/cheques/suppliers", { method: "GET" }, token))?.items || [];
      } catch {
        suppliers = [];
      }
      if (!suppliers.length) return toast("Ciro için tedarikçi bulunamadı.", "error");
      const sp = await choose<string>({ title: "Hangi tedarikçiye ciro?", message: `${money(c.amount, c.currency)} · kasa hareketi olmaz`, options: suppliers.slice(0, 30).map((s) => ({ value: s.party_id, label: s.name })) });
      if (!sp) return;
      body = { supplier_party_id: sp };
    } else if (action === "delete") {
      const ok = await confirm({ title: "Çek silinsin mi?", message: "Ters kayıt yazılır; çekle kapanan alacak yeniden açılır.", confirmLabel: "Sil", destructive: true });
      if (!ok) return;
      path = base;
      method = "DELETE";
    } else {
      const ok = await confirm({ title: `${ACTION_LABEL[action]}?`, message: money(c.amount, c.currency), confirmLabel: ACTION_LABEL[action] });
      if (!ok) return;
    }
    setBusy(c.id);
    const key = newIdempotencyKey("chq");
    try {
      await request<any>(path, method === "DELETE" ? { method, headers: { "Idempotency-Key": key } } : { method, body: JSON.stringify({ ...body, idempotency_key: key }), headers: { "Idempotency-Key": key } }, token);
      toast(
        { collect: "Çek tahsil edildi; hesaba girdi.", endorse: "Çek ciro edildi.", return: "Çek geri döndü; alacak yeniden açıldı.", pay: "Çek ödendi.", delete: "Çek silindi.", receipt: "" }[action],
        "success"
      );
    } catch (e: any) {
      toast(chequeErrorText(e), "error");
    } finally {
      setBusy("");
      load();
    }
  };

  const t = data?.totals || {};
  const figs =
    direction === "received"
      ? [
          ["Portföyde", t.portfoy],
          ["Vadesi 7 gün içinde", data?.due_soon],
          ["Tahsil edilen", t.tahsil_edildi],
        ]
      : [
          ["Ödenecek", t.verildi],
          ["Vadesi 7 gün içinde", data?.due_soon],
          ["Ödenen", t.odendi],
        ];
  const items: any[] = Array.isArray(data?.items) ? data.items : [];
  const overdue = totalsOf(data?.overdue).count;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background }]} testID="cheques-screen">
      <StackHeader title="Çekler" subtitle="Portföy ve vadeler" />
      <View style={styles.block}>
        <SegmentedControl
          options={[
            { value: "received", label: "Alınan" },
            { value: "issued", label: "Verilen" },
          ]}
          value={direction}
          onChange={(v) => {
            setDirection(v);
            setStatus("");
          }}
        />
      </View>
      <ChipRow>
        {FILTERS[direction].map(([k, l]) => (
          <Chip key={k || "all"} testID={`cheque-filter-${k || "all"}`} label={l} selected={status === k} onPress={() => setStatus(k)} />
        ))}
      </ChipRow>
      {error ? (
        <EmptyState icon={<AlertIcon size={30} color={colors.error} />} title="Çekler okunamadı" description={error} actionLabel="Tekrar dene" onAction={load} />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.huge, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), load())} tintColor={colors.primary} />}
        >
          {data ? (
            <View style={[styles.block, styles.figs]}>
              {figs.map(([label, rows]) => {
                const tt = totalsOf(rows);
                return (
                  <Card key={String(label)} padded style={styles.fig}>
                    <Text style={[type.caption, { color: colors.textTertiary }]}>{String(label)}</Text>
                    {(tt.lines.length ? tt.lines : [{ currency: "TRY", amount: 0 }]).map((l) => (
                      <Text key={l.currency} style={[type.bodyStrong, tabular, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                        {money(l.amount, l.currency)}
                      </Text>
                    ))}
                    <Text style={[type.caption, { color: colors.textTertiary }]}>{`${tt.count} çek`}</Text>
                  </Card>
                );
              })}
            </View>
          ) : null}
          {overdue ? <Text style={[type.footnote, styles.block, { color: colors.error }]}>{`${overdue} çekin vadesi geçti.`}</Text> : null}
          {data && !items.length ? (
            <EmptyState icon={<WalletIcon size={30} color={colors.textTertiary} />} title="Çek yok" description={direction === "received" ? "Çekle tahsilat faturadan ya da cari kartından alınır." : "Verilen çek yok."} />
          ) : null}
          {items.map((c) => {
            const acts = mayWrite ? chequeActions(c) : chequeActions(c).filter((a) => a === "receipt");
            const due = dueText(c);
            const late = typeof c.days_to_due === "number" && c.days_to_due < 0 && (c.status === "portfoy" || c.status === "verildi");
            return (
              <View key={c.id} testID={`cheque-${c.id}`}>
              <Card padded style={[styles.block, { gap: spacing.xs }]}>
                <View style={styles.row}>
                  <Text style={[type.bodyStrong, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                    {direction === "received" ? c.customer_name || c.drawer || "Müşteri" : c.supplier_name || "Tedarikçi"}
                  </Text>
                  <Text style={[type.bodyStrong, tabular, { color: colors.textPrimary }]}>{money(c.amount, c.currency)}</Text>
                </View>
                <View style={styles.row}>
                  <StatusBadge label={c.status_label || c.status} kind={TONE[c.status] || "neutral"} size="sm" />
                  <Text style={[type.caption, { color: late ? colors.error : colors.textTertiary, flex: 1 }]} numberOfLines={1}>
                    {[`Vade ${formatDate(c.due_date)}`, due, c.cheque_no ? `No ${c.cheque_no}` : null, c.bank_name || null].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                {c.invoices?.length ? (
                  <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                    {c.invoices.map((x: any) => `${x.invoice_number || "Fatura"} ${money(x.amount, c.currency)}`).join(" · ")}
                  </Text>
                ) : null}
                {c.detached ? <Text style={[type.caption, { color: colors.amber }]}>Faturadaki tahsilat satırı değişmiş; çek yalnız silinebilir.</Text> : null}
                {acts.length ? (
                  <View style={styles.acts}>
                    {acts.map((a) => (
                      <Button
                        key={a}
                        testID={`cheque-${a}-${c.id}`}
                        size="sm"
                        variant={a === "delete" ? "ghost" : "secondary"}
                        label={ACTION_LABEL[a]}
                        busy={busy === c.id && a !== "delete"}
                        disabled={Boolean(busy) || c.busy}
                        onPress={() => run(c, a)}
                      />
                    ))}
                  </View>
                ) : null}
              </Card>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  block: { marginHorizontal: spacing.lg },
  figs: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.sm },
  fig: { flex: 1, gap: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  acts: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
});

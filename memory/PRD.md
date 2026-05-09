# ObiHub Mobile — Premium Redesign

## Goal
Transform the existing functional ObiHub mobile app from "amateur looking" to **Linear/Stripe-quality premium SaaS** while preserving 100% of existing functionality and integrations.

## Scope (this iteration)
- All 9 screens redesigned end-to-end with light + dark theme support and rich micro-animations.
- Reports screen rebuilt as the centerpiece with multi-layer analytics.
- Brand colors preserved (cobalt blue #2563EB primary, channel-specific accents).
- API base URL still points to user's production backend (`api.obihub.app/api`) — overridable via `EXPO_PUBLIC_OBIHUB_API_URL`.

## Architecture
- Expo SDK 54 + expo-router (file-based routing)
- React Native + react-native-reanimated 4 + react-native-svg
- Theme tokens in `src/theme/tokens.ts`, `ThemeProvider` with light/dark toggle persisted in SecureStore (native) / localStorage (web)
- AuthProvider with cross-platform Storage abstraction
- All entering animations use a `SafeAnimatedView` wrapper that no-ops on web SSR (avoids visibility:hidden hydration glitch)

## Screens
1. **Login** — Glass-card form with animated gradient orbs, brand pill, theme toggle, "Connect. Sync. Scale." chip
2. **Dashboard** — Hero spark-card (30d revenue + trend %), 4 KPI cards (orders, revenue, low stock, pending), recent orders list, quick actions
3. **Integrations** — Per-channel summary tiles + connection cards with platform logos and accent strips
4. **Integration Orders** — Premium header with platform logo, sync button with cooldown timer, search, animated list
5. **Order Detail** — Hero summary card, status badge, dual action (Print / Cloud Print), itemized list with images and qty pills, total row
6. **Invoices** — Month chip selector, summary row (this month total / count / officialized), search, animated rows
7. **Invoice Detail** — Hero amount, dual action (PDF / Officialize), customer card, line items
8. **Reports (FLAGSHIP)** — Dark hero ciro card with sparkline + trend, period pills (1/7/30 days), KPI grid, Smart Insights, Channel donut + legend, Daily revenue bars, Top products with revenue bars, Status breakdown grid
9. **HepsiJet Manual** — Customer create form with floating-label inputs, customer chip selector, shipment form, recent shipments list with print

## Design language
- 8pt spacing system, 12-28px radii, shadow tiers (sm / md / lg / primary)
- Cobalt primary, channel accents (Trendyol, Hepsiburada, n11, WooCommerce), HepsiJet orange
- Animated number ticker on hero KPIs, fade-in-down list entrance, pressable scale feedback (97% on press)
- Custom floating bottom tab bar with active pill background per tab accent

## Decisions
- Theme: dual (light + dark) with toggle and OS preference fallback
- Charts: pure react-native-svg (no chart library) for full theming control and bundle size
- Brand colors: kept user's existing palette, repurposed as semantic tokens

## Notes
- Web preview shows the login screen rendering correctly. Real production usage runs on iOS/Android with the user's existing api.obihub.app backend.
- All previously functional flows (sync, label print, cloud print, officialize, manual HepsiJet) wired to identical endpoints.

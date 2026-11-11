import React, { useMemo } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop, G, Text as SvgText } from "react-native-svg";
import { useSharedValue, withTiming, Easing } from "react-native-reanimated";
import { useTheme } from "../theme/ThemeProvider";
import { tabular, type } from "../theme/tokens";

// Eksen etiketleri için en küçük yazı boyutu.
const AXIS_FONT = type.caption.fontSize;

// ---------- Sparkline ----------
export function Sparkline({
  data,
  width = 240,
  height = 64,
  color: colorProp,
  fillOpacity = 0.18,
  showDots = false,
  showAxis = false,
  axisFormatter,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  showDots?: boolean;
  showAxis?: boolean;
  axisFormatter?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.heroAccent;
  const padX = 4;
  const padY = 6;
  const w = Math.max(1, width - padX * 2);
  const h = Math.max(1, height - padY * 2);

  const { line, area, dots, minVal, maxVal } = useMemo(() => {
    const list = (data || []).filter((n) => Number.isFinite(n));
    if (list.length < 2) return { line: "", area: "", dots: [] as { x: number; y: number }[], minVal: 0, maxVal: 0 };
    const min = Math.min(...list);
    const max = Math.max(...list);
    const range = Math.max(0.0001, max - min);
    const step = w / (list.length - 1);
    const pts = list.map((v, i) => ({ x: padX + i * step, y: padY + h - ((v - min) / range) * h }));
    const line = pts
      .map((p, i) => (i === 0 ? `M${p.x.toFixed(2)},${p.y.toFixed(2)}` : `L${p.x.toFixed(2)},${p.y.toFixed(2)}`))
      .join(" ");
    const area =
      `M${pts[0].x.toFixed(2)},${(padY + h).toFixed(2)} ` +
      pts.map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") +
      ` L${pts[pts.length - 1].x.toFixed(2)},${(padY + h).toFixed(2)} Z`;
    return { line, area, dots: pts, minVal: min, maxVal: max };
  }, [data, w, h, padX, padY]);

  if (!line) {
    return <View style={{ width, height }} />;
  }

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={fillOpacity * 1.6} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#sparkfill)" />
      <Path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {showDots
        ? dots.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={2.4} fill={color} />
          ))
        : null}
      {showAxis && line ? (
        <>
          <SvgText x={width - 2} y={padY + AXIS_FONT - 2} fill={color} fontSize={AXIS_FONT} fontWeight="700" textAnchor="end" opacity={0.75}>
            {axisFormatter ? axisFormatter(maxVal) : maxVal >= 1000 ? `${(maxVal / 1000).toFixed(0)}k` : String(Math.round(maxVal))}
          </SvgText>
          <SvgText x={width - 2} y={height - 2} fill={color} fontSize={AXIS_FONT} fontWeight="700" textAnchor="end" opacity={0.55}>
            {axisFormatter ? axisFormatter(minVal) : minVal >= 1000 ? `${(minVal / 1000).toFixed(0)}k` : String(Math.round(minVal))}
          </SvgText>
        </>
      ) : null}
    </Svg>
  );
}

// ---------- Bar Chart (vertical) ----------
export function BarChart({
  data,
  width = 320,
  height = 160,
  color: colorProp,
  highlightIndex,
  highlightColor: highlightColorProp,
  axisColor: axisColorProp,
  gridColor: gridColorProp,
  valueFormatter,
}: {
  data: { label: string; value: number }[];
  width?: number;
  height?: number;
  color?: string;
  highlightIndex?: number;
  highlightColor?: string;
  axisColor?: string;
  gridColor?: string;
  valueFormatter?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const color = colorProp ?? colors.primary;
  const highlightColor = highlightColorProp ?? colors.heroAccent;
  const axisColor = axisColorProp ?? colors.textTertiary;
  const gridColor = gridColorProp ?? colors.chartGrid;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);
  const max = Math.max(1, ...data.map((d) => d.value));
  const barCount = Math.max(1, data.length);
  const barGap = barCount > 1 ? 6 : 0;
  const barW = Math.max(4, (innerW - barGap * (barCount - 1)) / barCount);

  // 3 horizontal grid lines
  const gridLines = [0.25, 0.5, 0.75].map((t) => padT + innerH * (1 - t));

  return (
    <Svg width={width} height={height}>
      {gridLines.map((y, i) => (
        <Path key={i} d={`M${padL},${y} L${width - padR},${y}`} stroke={gridColor} strokeWidth={1} strokeDasharray="3,5" />
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const x = padL + i * (barW + barGap);
        const y = padT + innerH - h;
        const isHi = highlightIndex === i;
        return (
          <G key={`${d.label}-${i}`}>
            <Rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(2, h)}
              fill={isHi ? highlightColor : color}
              opacity={isHi ? 1 : 0.9}
              rx={Math.min(6, barW / 2)}
            />
          </G>
        );
      })}
      {data.map((d, i) => {
        const x = padL + i * (barW + barGap) + barW / 2;
        const y = height - 8;
        return (
          <SvgText key={`lbl-${i}`} x={x} y={y} fill={axisColor} fontSize={AXIS_FONT} textAnchor="middle">
            {d.label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ---------- Donut Chart ----------
type DonutSlice = { label: string; value: number; color: string };

export function DonutChart({
  size = 180,
  strokeWidth = 22,
  data,
  centerLabel,
  centerValue,
}: {
  size?: number;
  strokeWidth?: number;
  data: DonutSlice[];
  centerLabel?: string;
  centerValue?: string;
}) {
  const { colors } = useTheme();
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * r;

  const total = Math.max(0.0001, data.reduce((a, b) => a + Math.max(0, b.value), 0));
  let acc = 0;
  const slices = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const frac = d.value / total;
      const startFrac = acc;
      acc += frac;
      return { ...d, frac, startFrac };
    });

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.borderSubtle} strokeWidth={strokeWidth} fill="none" />
        {slices.map((s, i) => {
          const dash = c * s.frac;
          const offset = -c * s.startFrac;
          return (
            <Circle
              key={`${s.label}-${i}`}
              cx={cx}
              cy={cy}
              r={r}
              stroke={s.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${c}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        {centerLabel ? (
          <Text style={[type.caption, { color: colors.textTertiary }]} numberOfLines={1}>
            {centerLabel}
          </Text>
        ) : null}
        {centerValue ? (
          <Text style={[tabular, { fontSize: 18, color: colors.textPrimary, fontWeight: "800", marginTop: 2 }]} numberOfLines={1}>{centerValue}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ---------- Animated stat number ticker ----------
export function AnimatedNumber({
  value,
  duration = 700,
  format,
  style,
  testID,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  style?: any;
  testID?: string;
}) {
  const sv = useSharedValue(0);
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    sv.value = 0;
    sv.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration, sv]);
  React.useEffect(() => {
    let raf: any;
    const tick = () => {
      setShown(sv.value);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sv]);
  return (
    <Text testID={testID} style={style}>
      {format ? format(shown) : Math.round(shown).toString()}
    </Text>
  );
}

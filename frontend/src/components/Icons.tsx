import React from "react";
import Svg, { Path, Circle, Rect, Line, G } from "react-native-svg";

type IconProps = { size?: number; color?: string; strokeWidth?: number };

export const HomeIcon = ({ size = 24, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 11.2 12 4l9 7.2V20a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H4.5A1.5 1.5 0 0 1 3 20v-8.8Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </Svg>
);

export const PlugIcon = ({ size = 24, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 8.5 5.5 12 8 14.5l-3 3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="m15 9.5 3.5-3.5L21 8.5l-3.5 3.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 15 15 9m-3 6 5 5m-9-5 4 4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ReceiptIcon = ({ size = 24, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6 3.5h9l3 3V21l-2.5-1.5L13.5 21l-2.5-1.5L8.5 21 6 19.5z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path d="M9 9h6M9 12.5h6M9 16h4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const ChartIcon = ({ size = 24, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 20h16" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Path d="M7 17v-5M12 17V7M17 17v-9" stroke={color} strokeWidth={strokeWidth + 0.2} strokeLinecap="round" />
    <Path d="m4 12 4-2.5 4 1.8 6-4.3" stroke={color} strokeWidth={strokeWidth - 0.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.5} />
  </Svg>
);

export const TruckIcon = ({ size = 24, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 7h11v9H3zM14 10h3.6l2.4 2.3V16H14z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    <Circle cx={7} cy={18} r={1.6} stroke={color} strokeWidth={strokeWidth} />
    <Circle cx={17.5} cy={18} r={1.6} stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const SearchIcon = ({ size = 20, color = "#94A3B8", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={11} cy={11} r={7} stroke={color} strokeWidth={strokeWidth} />
    <Path d="m20 20-3.2-3.2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const ArrowRightIcon = ({ size = 20, color = "#94A3B8", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12h14m-5-5 5 5-5 5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ArrowLeftIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M19 12H5m5-5-5 5 5 5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const RefreshIcon = ({ size = 18, color = "#FFFFFF", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3.5 12a8.5 8.5 0 0 1 14.6-6L21 9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M21 4v5h-5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M20.5 12A8.5 8.5 0 0 1 5.9 18L3 15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M3 20v-5h5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const PrinterIcon = ({ size = 22, color = "#FFFFFF", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M7 9V4h10v5" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    <Rect x={4} y={9} width={16} height={8} rx={2} stroke={color} strokeWidth={strokeWidth} />
    <Rect x={7} y={14} width={10} height={6} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
    <Circle cx={17} cy={12} r={1} fill={color} />
  </Svg>
);

export const CloudIcon = ({ size = 22, color = "#FFFFFF", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7 18a4 4 0 0 1-.5-7.97 6 6 0 0 1 11.69 1.31A4 4 0 0 1 17 18Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
    <Path d="M12 12v6m0 0-2-2m2 2 2-2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const DownloadIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 4v12m0 0-4-4m4 4 4-4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M5 20h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const CheckIcon = ({ size = 18, color = "#16A34A", strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M5 12.5 9.7 17 19 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ClockIcon = ({ size = 18, color = "#F59E0B", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={strokeWidth} />
    <Path d="M12 7v5l3.2 1.9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrendUpIcon = ({ size = 16, color = "#16A34A", strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m4 17 6-6 4 4 7-8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 7h7v7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrendDownIcon = ({ size = 16, color = "#EF4444", strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m4 7 6 6 4-4 7 8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M14 17h7v-7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SunIcon = ({ size = 20, color = "#F59E0B", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={4.5} stroke={color} strokeWidth={strokeWidth} />
    <Path
      d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  </Svg>
);

export const MoonIcon = ({ size = 20, color = "#94A3B8", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 13.4A8.5 8.5 0 0 1 10.6 3a8.5 8.5 0 1 0 10.4 10.4Z"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinejoin="round"
    />
  </Svg>
);

export const LogoutIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M16 8l4 4-4 4M20 12H10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const PackageIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    <Path d="M4 7l8 4 8-4M12 11v10M8 5l8 4" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
  </Svg>
);

export const ZapIcon = ({ size = 18, color = "#F59E0B", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" fill="none" />
  </Svg>
);

export const WalletIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    <Path d="M21 11h-4.5a2.5 2.5 0 1 0 0 5H21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Circle cx={16.5} cy={13.5} r={1} fill={color} />
  </Svg>
);

export const InboxIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 13.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4.5l-3.5-7A2 2 0 0 0 14.7 5H9.3a2 2 0 0 0-1.8 1.5z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    <Path d="M4 13.5h5l1 2h4l1-2h5" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </Svg>
);

export const FilterIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 5h16l-6 8v6l-4-2v-4Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </Svg>
);

export const PlusIcon = ({ size = 20, color = "#FFFFFF", strokeWidth = 2.4 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const CloseIcon = ({ size = 20, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 6l12 12M18 6 6 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const TagIcon = ({ size = 18, color = "#0F172A", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="m4 13 9-9 7 .5.5 7-9 9z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    <Circle cx={15.5} cy={8.5} r={1.4} stroke={color} strokeWidth={strokeWidth} />
  </Svg>
);

export const SparkleIcon = ({ size = 16, color = "#60A5FA", strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3v4M12 17v4M3 12h4M17 12h4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Path d="M12 8a4 4 0 0 0 4 4 4 4 0 0 0-4 4 4 4 0 0 0-4-4 4 4 0 0 0 4-4Z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
  </Svg>
);

export { Svg, Path, Circle, Rect, Line, G };

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export const SearchIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const CloseIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const BackIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);

export const SwapIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
  </svg>
);

export const BusIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <rect x="4" y="3" width="16" height="15" rx="3" />
    <path d="M4 11h16M8 18v3M16 18v3" />
    <circle cx="8" cy="14.5" r="0.5" fill="currentColor" />
    <circle cx="16" cy="14.5" r="0.5" fill="currentColor" />
  </svg>
);

export const AlertIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

export const LocateIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    <circle cx="12" cy="12" r="7" />
  </svg>
);

export const WalkIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <circle cx="13" cy="4" r="1.6" />
    <path d="m9 21 2.5-6.5L14 17v4M7 12l3-4 3 1.5 2.5 3M11.5 14.5 10 8" />
  </svg>
);

export const SwapVerticalIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4" />
  </svg>
);

export const ChevronRightIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const PlusIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const GripIcon = (props: IconProps) => (
  <svg {...base} {...props} fill="currentColor" stroke="none">
    {[6, 12, 18].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.6" />
        <circle cx="15" cy={y} r="1.6" />
      </g>
    ))}
  </svg>
);

/** isFilled：已收藏 */
export const StarIcon = ({ isFilled = false, ...props }: IconProps & { isFilled?: boolean }) => (
  <svg {...base} {...props} fill={isFilled ? "currentColor" : "none"}>
    <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </svg>
);

export const ShareIcon = (props: IconProps) => (
  <svg {...base} {...props}>
    <path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

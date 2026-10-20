type Props = {
  name: string;
  /** route：目前選定的路線（藍）；sign：一般路線牌（深色） */
  variant?: "route" | "sign";
  size?: "md" | "lg";
};

const VARIANTS = {
  route: "bg-route text-route-ink",
  sign: "bg-fg text-surface-solid",
};

const SIZES = {
  md: "min-w-[3.25rem] px-2 text-[17px] leading-7 rounded-[7px]",
  lg: "min-w-[4.5rem] px-3 text-[30px] leading-[2.6rem] rounded-[10px]",
};

/** 仿站牌路線牌：窄體粗字 */
export function RouteBadge({ name, variant = "sign", size = "md" }: Props) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-sign font-bold tracking-tight whitespace-nowrap ${VARIANTS[variant]} ${SIZES[size]}`}
    >
      {name}
    </span>
  );
}

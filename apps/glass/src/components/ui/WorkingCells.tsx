import { cn } from "~/lib/cn";

// Delay per cell, row by row, so the wave runs diagonally across the grid.
const CELLS = [0, 0.15, 0.3, 0.15, 0.3, 0.45, 0.3, 0.45, 0.6].map((delay, index) => ({
  id: `cell-${index}`,
  delay,
}));

/**
 * The 3×3 matrix spinner for running agents. Opacity-only and stepped, so it
 * composites a handful of times per second instead of every frame.
 */
export function WorkingCells({
  size = "sm",
  className,
}: {
  readonly size?: "xs" | "sm" | "md";
  readonly className?: string;
}) {
  const cell = size === "xs" ? 2 : size === "sm" ? 3 : 4;
  const gap = size === "md" ? 1.5 : 1;
  return (
    <span
      aria-hidden
      className={cn("working-cells inline-grid shrink-0", className)}
      style={{ gridTemplateColumns: `repeat(3, ${cell}px)`, gap }}
    >
      {CELLS.map(({ id, delay }) => (
        <span
          key={id}
          className="rounded-[1px] bg-current"
          style={{ width: cell, height: cell, animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

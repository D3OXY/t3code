import { type RefObject, useLayoutEffect, useRef } from "react";

const GLIDE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Glides rows to their new positions when a list re-sorts (FLIP). Rows opt in
 * with `data-flip-key`; positions are compared after every render. Each move is a one-shot transform animation, so an
 * idle list costs nothing; reduced-motion users get the instant reorder.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>) {
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, number>();
    for (const element of container.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = element.dataset.flipKey;
      if (!key) continue;
      const top = element.offsetTop;
      next.set(key, top);
      const previous = positions.current.get(key);
      if (reduceMotion || previous === undefined || previous === top) continue;
      element.animate([{ transform: `translateY(${previous - top}px)` }, { transform: "none" }], {
        duration: 260,
        easing: GLIDE,
      });
    }
    positions.current = next;
  });
}

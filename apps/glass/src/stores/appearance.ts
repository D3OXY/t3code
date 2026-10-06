import { create } from "zustand";
import { persist } from "zustand/middleware";

export const WALLPAPERS = [
  { id: "dusk", label: "Dusk" },
  { id: "meadow", label: "Meadow" },
  { id: "ember", label: "Ember" },
  { id: "ocean", label: "Ocean" },
  { id: "aurora", label: "Aurora" },
  { id: "graphite", label: "Graphite" },
  { id: "custom", label: "Custom" },
] as const;

export type WallpaperId = (typeof WALLPAPERS)[number]["id"];
export type AppearanceMode = "light" | "dark" | "system";
export type SurfaceMode = "frost" | "opaque";

interface AppearanceState {
  readonly mode: AppearanceMode;
  readonly wallpaper: WallpaperId;
  readonly surface: SurfaceMode;
  /** A data URL for the custom wallpaper; kept local to this browser. */
  readonly customWallpaper: string | null;
  readonly setMode: (mode: AppearanceMode) => void;
  readonly setWallpaper: (wallpaper: WallpaperId) => void;
  readonly setSurface: (surface: SurfaceMode) => void;
  readonly setCustomWallpaper: (dataUrl: string | null) => void;
}

/**
 * Device-local appearance. The storage key and shape are read by the boot
 * script in index.html, so the first paint already matches; keep them in sync.
 */
export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      mode: "dark",
      wallpaper: "dusk",
      surface: "frost",
      customWallpaper: null,
      setMode: (mode) => set({ mode }),
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setSurface: (surface) => set({ surface }),
      setCustomWallpaper: (customWallpaper) =>
        set(
          customWallpaper === null
            ? { customWallpaper, wallpaper: "dusk" }
            : { customWallpaper, wallpaper: "custom" },
        ),
    }),
    { name: "glass:appearance:v1" },
  ),
);

/** Mirrors the appearance store onto <html> so CSS tokens follow it. */
export function syncAppearanceToDocument(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const { mode, wallpaper, surface, customWallpaper } = useAppearance.getState();
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark" || (mode === "system" && media.matches));
    root.dataset.wallpaper =
      wallpaper === "custom" && customWallpaper === null ? "dusk" : wallpaper;
    root.dataset.surface = surface;
    if (wallpaper === "custom" && customWallpaper !== null) {
      root.style.setProperty("--wallpaper-image", `url("${customWallpaper}")`);
    } else {
      root.style.removeProperty("--wallpaper-image");
    }
  };
  apply();
  const unsubscribe = useAppearance.subscribe(apply);
  media.addEventListener("change", apply);
  return () => {
    unsubscribe();
    media.removeEventListener("change", apply);
  };
}

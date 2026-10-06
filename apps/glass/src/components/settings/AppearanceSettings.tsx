import { Check, ImagePlus, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "~/components/ui/Button";
import { Segmented } from "~/components/ui/Segmented";
import { cn } from "~/lib/cn";
import { useAppearance, WALLPAPERS, type WallpaperId } from "~/stores/appearance";
import { SettingsGroup, SettingsPage, SettingsRow } from "./SettingsLayout";
import { encodeWallpaper, hasStorageRoomFor } from "./wallpaperImage";

/** Theme, wallpaper and surface treatment; all device-local. */
export function AppearanceSettings() {
  const mode = useAppearance((state) => state.mode);
  const setMode = useAppearance((state) => state.setMode);
  const surface = useAppearance((state) => state.surface);
  const setSurface = useAppearance((state) => state.setSurface);

  return (
    <SettingsPage title="Appearance" description="These preferences stay on this device.">
      <SettingsGroup>
        <SettingsRow label="Theme" description="System follows your operating system.">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              {
                value: "light",
                label: (
                  <>
                    <Sun className="size-3.5" />
                    Light
                  </>
                ),
              },
              {
                value: "dark",
                label: (
                  <>
                    <Moon className="size-3.5" />
                    Dark
                  </>
                ),
              },
              {
                value: "system",
                label: (
                  <>
                    <Monitor className="size-3.5" />
                    System
                  </>
                ),
              },
            ]}
          />
        </SettingsRow>
        <SettingsRow
          label="Surfaces"
          description="Frosted panels blur the wallpaper behind them. Opaque is calmer and cheaper to draw."
        >
          <Segmented
            value={surface}
            onChange={setSurface}
            options={[
              { value: "frost", label: "Frosted" },
              { value: "opaque", label: "Opaque" },
            ]}
          />
        </SettingsRow>
      </SettingsGroup>
      <WallpaperPicker />
    </SettingsPage>
  );
}

function WallpaperPicker() {
  const wallpaper = useAppearance((state) => state.wallpaper);
  const setWallpaper = useAppearance((state) => state.setWallpaper);
  const customWallpaper = useAppearance((state) => state.customWallpaper);
  const setCustomWallpaper = useAppearance((state) => state.setCustomWallpaper);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await encodeWallpaper(file);
      if (!hasStorageRoomFor(dataUrl)) {
        throw new Error("Not enough browser storage for this image. Try a smaller one.");
      }
      setCustomWallpaper(dataUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't use this image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-2 flex items-end gap-3 px-1">
        <div className="min-w-0 flex-1">
          <h2 className="text-[12.5px] font-medium text-muted">Wallpaper</h2>
          <p className="mt-0.5 text-[12px] text-faint">
            Shown behind the floating panels and on the new session canvas.
          </p>
        </div>
        {customWallpaper !== null ? (
          <Button size="xs" variant="ghost" onClick={() => setCustomWallpaper(null)}>
            <Trash2 className="size-3" />
            Remove image
          </Button>
        ) : null}
      </div>
      <div
        className="grid grid-cols-3 gap-3 sm:grid-cols-4"
        role="radiogroup"
        aria-label="Wallpaper"
      >
        {WALLPAPERS.filter((option) => option.id !== "custom").map((option) => (
          <WallpaperTile
            key={option.id}
            id={option.id}
            label={option.label}
            selected={wallpaper === option.id}
            onSelect={() => setWallpaper(option.id)}
          />
        ))}
        {customWallpaper !== null ? (
          <WallpaperTile
            id="custom"
            label="Your image"
            image={customWallpaper}
            selected={wallpaper === "custom"}
            onSelect={() => setWallpaper("custom")}
          />
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex aspect-[16/10] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-[12px] text-muted outline-none transition-colors duration-150 hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
        >
          <ImagePlus className="size-4" />
          {busy ? "Processing…" : customWallpaper !== null ? "Replace image" : "Upload image"}
        </button>
      </div>
      {error ? <p className="mt-2 px-1 text-[12px] text-danger">{error}</p> : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </section>
  );
}

function WallpaperTile({
  id,
  label,
  image,
  selected,
  onSelect,
}: {
  readonly id: WallpaperId;
  readonly label: string;
  readonly image?: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className="group flex flex-col gap-1.5 text-left outline-none"
    >
      <span
        data-wallpaper={id}
        className={cn(
          "relative block aspect-[16/10] w-full overflow-hidden rounded-xl border transition-shadow duration-150 group-focus-visible:ring-2 group-focus-visible:ring-accent/60",
          selected
            ? "border-transparent ring-2 ring-fg"
            : "border-line group-hover:border-line-strong",
        )}
      >
        <span
          className="wallpaper"
          style={image === undefined ? undefined : { backgroundImage: `url("${image}")` }}
        />
        {/* A miniature glass panel, so the tile previews how surfaces sit on it. */}
        <span className="glass absolute top-[18%] bottom-[14%] left-[8%] w-[26%] rounded-md border border-line" />
        <span className="absolute top-[18%] right-[8%] bottom-[14%] left-[38%] rounded-md border border-line bg-surface/70" />
        {selected ? (
          <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-fg text-bg">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className={cn("px-0.5 text-[12px]", selected ? "font-medium text-fg" : "text-muted")}>
        {label}
      </span>
    </button>
  );
}

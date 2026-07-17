import type { EnvironmentId } from "@t3tools/contracts";
import { isProjectFaviconFallbackUrl } from "@t3tools/shared/projectFavicon";
import { FolderIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAssetUrl } from "../assets/assetUrls";
import { cn } from "../lib/utils";

const loadedProjectFaviconSrcs = new Set<string>();

export function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  className?: string | undefined;
  fallback?: ReactNode | undefined;
}) {
  const src = useAssetUrl(input.environmentId, {
    _tag: "project-favicon",
    cwd: input.cwd,
  });

  if (!src || isProjectFaviconFallbackUrl(src)) {
    return <ProjectFaviconFallback className={input.className} fallback={input.fallback} />;
  }

  return (
    <ProjectFaviconImage
      key={src}
      src={src}
      className={input.className}
      fallback={input.fallback}
    />
  );
}

function ProjectFaviconFallback({
  className,
  fallback,
}: {
  readonly className?: string | undefined;
  readonly fallback?: ReactNode | undefined;
}) {
  if (fallback !== undefined) return fallback;
  return <FolderIcon className={cn("size-3.5 shrink-0 text-muted-foreground/50", className)} />;
}

function ProjectFaviconImage({
  src,
  className,
  fallback,
}: {
  readonly src: string;
  readonly className?: string | undefined;
  readonly fallback?: ReactNode | undefined;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(() =>
    loadedProjectFaviconSrcs.has(src) ? "loaded" : "loading",
  );

  return (
    <>
      {status !== "loaded" ? (
        <ProjectFaviconFallback className={className} fallback={fallback} />
      ) : null}
      <img
        src={src}
        alt=""
        className={cn(
          "size-3.5 shrink-0 rounded-sm object-contain",
          status !== "loaded" && "hidden",
          className,
        )}
        onLoad={() => {
          loadedProjectFaviconSrcs.add(src);
          setStatus("loaded");
        }}
        onError={() => setStatus("error")}
      />
    </>
  );
}

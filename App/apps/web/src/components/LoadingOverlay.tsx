"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingOverlay({
  open,
  title = "Working…",
  detail,
  className,
}: {
  open: boolean;
  title?: string;
  detail?: string;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 w-full max-w-sm rounded-lg border bg-card px-6 py-8 text-center shadow-lg">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
            <span className="absolute inset-0 animate-spin-slow rounded-full border-2 border-transparent border-t-primary" />
            <BeanMark className="h-7 w-7 text-primary animate-pulse-soft" />
          </span>
        </div>
        <div className="font-display text-lg font-semibold tracking-tight">{title}</div>
        {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Please wait
        </div>
      </div>
    </div>
  );
}

export function InlineBusy({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card/80 px-4 py-6 text-sm text-muted-foreground",
        className,
      )}
      role="status"
    >
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-spin-slow rounded-full border-2 border-transparent border-t-primary" />
        <BeanMark className="h-4 w-4 text-primary" />
      </span>
      {label}
    </div>
  );
}

export function BeanMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M16 3c-4.8 0-9 5.2-9 13s4.2 13 9 13 9-5.2 9-13S20.8 3 16 3zm0 2.2c1.1 2.8 1.7 6.4 1.7 10.8S17.1 24 16 26.8C14.9 24 14.3 20.4 14.3 16S14.9 8 16 5.2z" />
    </svg>
  );
}

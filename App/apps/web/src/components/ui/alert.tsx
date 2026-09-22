import { cn } from "@/lib/utils";

export function Alert({
  className,
  variant = "default",
  children,
}: {
  className?: string;
  variant?: "default" | "destructive" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-md border px-3 py-2 text-sm animate-fade-in",
        variant === "default" && "border-border bg-muted/60 text-foreground",
        variant === "destructive" && "border-red-200 bg-red-50 text-red-900",
        variant === "warn" && "border-amber-200 bg-amber-50 text-amber-950",
        className,
      )}
    >
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Network, ScanSearch, Warehouse } from "lucide-react";
import type { SessionInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("ankuaru_session");
    if (!raw) {
      router.replace("/");
      return;
    }
    setSession(JSON.parse(raw) as SessionInfo);
  }, [router]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Restoring session…
      </div>
    );
  }

  const roleLabel =
    session.actor.capacity === "Aggregator" ? "Aggregator" : session.actor.capacity;

  const nav = [
    { href: "/workspace", label: "Workspace", icon: Warehouse },
    { href: "/network", label: "My Network", icon: Network },
    { href: "/inspector", label: "Inspector", icon: ScanSearch },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-display text-lg font-semibold tracking-tight">Ankuaru</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {roleLabel}
            </Badge>
            <span className="hidden truncate text-sm text-muted-foreground md:inline">
              {session.actor.displayName}
            </span>
          </div>
          <nav className="ml-auto flex items-center gap-1">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem("ankuaru_session");
                router.push("/");
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Switch role</span>
            </Button>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}

export function useSession(): SessionInfo | null {
  const [session, setSession] = useState<SessionInfo | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem("ankuaru_session");
    if (raw) setSession(JSON.parse(raw) as SessionInfo);
  }, []);
  return session;
}

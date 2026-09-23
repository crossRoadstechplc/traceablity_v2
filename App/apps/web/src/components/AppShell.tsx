"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, ClipboardList, CloudOff, LogOut, Network, RefreshCw, ScanSearch, Warehouse } from "lucide-react";
import { cachedApi, flushQueue, readQueue, type SessionInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const CHAIN_ROLES = ["Farmer", "Collector", "Aggregator", "Exporter", "Importer"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(true);
  const [unread, setUnread] = useState(0);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);

  useEffect(() => {
    const h = (e: Event) => setRevalidating(((e as CustomEvent<number>).detail ?? 0) > 0);
    window.addEventListener("ankuaru-syncing", h);
    return () => window.removeEventListener("ankuaru-syncing", h);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("ankuaru_session");
    if (!raw) {
      router.replace("/");
      return;
    }
    setSession(JSON.parse(raw) as SessionInfo);
  }, [router]);

  const sync = useCallback(async () => {
    const r = await flushQueue();
    if (r.synced || r.failed.length) {
      setSyncMsg(
        `${r.synced} synced${r.failed.length ? ` · ${r.failed.length} rejected: ${r.failed.map((f) => f.error).join("; ")}` : ""}`,
      );
      window.dispatchEvent(new Event("ankuaru-refresh"));
    }
  }, []);

  useEffect(() => {
    const update = () => {
      setQueued(readQueue().length);
      setOnline(navigator.onLine);
    };
    update();
    const goOnline = () => {
      update();
      void sync();
    };
    window.addEventListener("ankuaru-queue", update);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("ankuaru-queue", update);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", update);
    };
  }, [sync]);

  useEffect(() => {
    if (!session) return;
    const load = () =>
      cachedApi<{ notifications: unknown[] }>("/v1/notifications", session.sessionId, (r) =>
        setUnread(r.notifications.length),
      ).catch(() => undefined);
    void load();
    window.addEventListener("ankuaru-refresh", load);
    return () => window.removeEventListener("ankuaru-refresh", load);
  }, [session]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Restoring session…
      </div>
    );
  }

  const isChain = CHAIN_ROLES.includes(session.actor.capacity);
  const nav = [
    { href: "/workspace", label: "Workspace", icon: Warehouse },
    ...(isChain ? [{ href: "/network", label: "My Network", icon: Network }] : []),
    { href: "/inspector", label: "Inspector", icon: ScanSearch },
    { href: "/records", label: "Records", icon: ClipboardList },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="font-display text-lg font-semibold tracking-tight">Ankuaru</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {session.actor.capacity}
            </Badge>
            <span className="hidden truncate text-sm text-muted-foreground md:inline">
              {session.actor.displayName}
            </span>
            {revalidating && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Updating…</span>
              </span>
            )}
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
            <Link
              href="/records?tab=notifications"
              className="relative inline-flex items-center rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent"
              title="Action notifications"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {unread}
                </span>
              )}
            </Link>
            {(queued > 0 || !online) && (
              <Button variant="outline" size="sm" onClick={() => void sync()} disabled={!online} title="Offline queue">
                {online ? <RefreshCw className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{online ? `Sync ${queued}` : `Offline · ${queued} queued`}</span>
              </Button>
            )}
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
        {syncMsg && (
          <div className="border-t bg-accent/40 px-4 py-1.5 text-center text-xs">
            Offline sync: {syncMsg}{" "}
            <button type="button" className="underline" onClick={() => setSyncMsg(null)}>
              dismiss
            </button>
          </div>
        )}
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

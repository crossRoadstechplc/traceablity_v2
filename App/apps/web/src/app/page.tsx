"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bean,
  ChevronRight,
  Loader2,
  Sprout,
  Truck,
  Warehouse,
} from "lucide-react";
import { api, type SessionInfo } from "@/lib/api";
import { seedWorld } from "@/lib/seed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { InlineBusy, LoadingOverlay } from "@/components/LoadingOverlay";
import { cn } from "@/lib/utils";

type Role = {
  actorId: string;
  actorType: string;
  displayName: string;
  capacities: string[];
  legalIdentityRef?: string;
};

const CAP_FOR: Record<string, string> = {
  farmer: "Farmer",
  collector: "Collector",
  akrabi: "Aggregator",
  exporter: "Exporter",
  importer: "Importer",
  transporter: "Transporter",
  driver: "Driver",
  regulator: "Regulator",
  verifier: "Verifier",
  warehouse_operator: "WarehouseOperator",
  facility_operator: "FacilityOperator",
  platform_admin: "PlatformAdmin",
};

const ROLE_META: Record<
  string,
  { label: string; blurb: string; icon: typeof Sprout; order: number }
> = {
  farmer: {
    label: "Farmer",
    blurb: "Create origin harvest lots at the farm gate.",
    icon: Sprout,
    order: 1,
  },
  collector: {
    label: "Collector",
    blurb: "Receive from farmers; hold and send upstream.",
    icon: Truck,
    order: 2,
  },
  akrabi: {
    label: "Aggregator",
    blurb: "Combine, process, and move coffee toward export.",
    icon: Warehouse,
    order: 3,
  },
  exporter: {
    label: "Exporter",
    blurb: "Own the network; close lots at FOB.",
    icon: Bean,
    order: 4,
  },
};

type Step = "booting" | "pick-role" | "pick-actor";

export default function HomePage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [binding, setBinding] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("booting");
  const [bootMessage, setBootMessage] = useState("Preparing seed world…");
  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setStep("booting");
      setError(null);
      try {
        setBootMessage("Checking for a seeded world…");
        let list = await api<Role[]>("/v1/roles");
        if (cancelled) return;
        if (list.length === 0) {
          setBootMessage("Seeding eight Ethiopian sites…");
          await seedWorld();
          if (cancelled) return;
          list = await api<Role[]>("/v1/roles");
        }
        if (cancelled) return;
        setRoles(list);
        setStep(list.length ? "pick-role" : "booting");
        if (!list.length) {
          setError("Seed completed but no demo roles appeared.");
        }
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "API unreachable — start the simulator with npm run dev",
        );
        setStep("booting");
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function bind(role: Role) {
    const capacity = (CAP_FOR[role.actorType] ?? role.capacities[0]) as string;
    setBinding(role.actorId);
    setError(null);
    try {
      const info = await api<SessionInfo>("/v1/session/bind", {
        method: "POST",
        body: JSON.stringify({ actorId: role.actorId, capacity }),
      });
      localStorage.setItem("ankuaru_session", JSON.stringify(info));
      router.push("/workspace");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enter workspace");
      setBinding(null);
    }
  }

  const byType = useMemo(() => {
    const map = new Map<string, Role[]>();
    for (const r of roles) {
      const list = map.get(r.actorType) ?? [];
      list.push(r);
      map.set(r.actorType, list);
    }
    return map;
  }, [roles]);

  const playableTypes = ["farmer", "collector", "akrabi", "exporter"].filter((t) =>
    byType.has(t),
  );

  const actorsForType = selectedType ? byType.get(selectedType) ?? [] : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-10 md:py-16">
      <div className="mb-10 animate-fade-in">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Ankuaru
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          Coffee ledger simulator
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          One shared event-sourced world. Enter as a User bound to an Actor and Capacity —
          Farmer → Collector → Aggregator → Exporter. Use <strong>Reseed</strong> in the nav
          anytime to reset the ledger.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {[
          { id: "booting", label: "1 · Auto-seed" },
          { id: "pick-role", label: "2 · Choose role" },
          { id: "pick-actor", label: "3 · Enter as actor" },
        ].map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-3 w-3" />}
            <span
              className={cn(
                "rounded-full px-2.5 py-1",
                step === s.id && "bg-primary text-primary-foreground",
                step !== s.id &&
                  ((step === "pick-actor" && s.id !== "pick-actor") ||
                    (step === "pick-role" && s.id === "booting")) &&
                  "bg-accent text-accent-foreground",
              )}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {step === "booting" ? (
        <InlineBusy label={bootMessage} className="py-10" />
      ) : step === "pick-role" ? (
        <div className="animate-fade-in space-y-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Choose your capacity</h2>
            <p className="text-sm text-muted-foreground">
              {roles.length} demo actors ready · world auto-seeded
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {playableTypes.map((type) => {
              const meta = ROLE_META[type]!;
              const Icon = meta.icon;
              const count = byType.get(type)?.length ?? 0;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
                    setStep("pick-actor");
                  }}
                  className="group rounded-lg border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-lg font-semibold">{meta.label}</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{meta.blurb}</p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="animate-fade-in space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStep("pick-role");
                setSelectedType(null);
              }}
            >
              ← Back
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <h2 className="font-display text-xl font-semibold">
              Enter as {ROLE_META[selectedType!]?.label}
            </h2>
          </div>
          <div className="grid gap-2">
            {actorsForType.map((r) => (
              <button
                key={r.actorId}
                type="button"
                disabled={binding === r.actorId}
                onClick={() => void bind(r)}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left shadow-sm transition hover:border-primary/40 disabled:opacity-60"
              >
                <div>
                  <div className="font-medium">{r.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.legalIdentityRef ?? r.actorId.slice(0, 8)} · {CAP_FOR[r.actorType]}
                  </div>
                </div>
                {binding === r.actorId ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Badge>Enter workspace</Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {step === "booting" && (
        <LoadingOverlay
          open
          title="Preparing the ledger"
          detail={bootMessage}
        />
      )}

      {binding && (
        <LoadingOverlay
          open
          title="Entering workspace"
          detail="Binding your user to actor and capacity…"
        />
      )}
    </main>
  );
}

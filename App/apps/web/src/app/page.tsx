"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bean,
  ChevronRight,
  Factory,
  Landmark,
  Loader2,
  ShieldCheck,
  Ship,
  Sprout,
  Truck,
  Warehouse,
} from "lucide-react";
import { api, cachedApi, readCache, type SessionInfo } from "@/lib/api";
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
    blurb: "Run aggregator sites; ship greens to your importer.",
    icon: Bean,
    order: 4,
  },
  washing_station: {
    label: "Washing station",
    blurb: "Where cherry is pulped and washed into parchment. Named on every processing event; never owns coffee.",
    icon: Factory,
    order: 5,
  },
  mill: {
    label: "Mill",
    blurb: "Dries and hulls naturals into green. Named on every processing event; raises equipment flags.",
    icon: Factory,
    order: 6,
  },
  transporter: {
    label: "Transporter",
    blurb: "Trucks greens to Addis and the port with a Shinto pass. Custody stays with the sender until receipt.",
    icon: Truck,
    order: 7,
  },
  importer: {
    label: "Importer",
    blurb: "Own the network: sponsor exporters, receive their greens.",
    icon: Ship,
    order: 8,
  },
  verifier: {
    label: "Verifier",
    blurb: "Independent certifier: verifies or rejects evidence and runs deforestation checks on farm maps.",
    icon: BadgeCheck,
    order: 9,
  },
  regulator: {
    label: "Regulator",
    blurb: "ECTA: sees the whole ledger, issues licences, investigates and sanctions. Every read is logged.",
    icon: Landmark,
    order: 10,
  },
  platform_admin: {
    label: "Platform admin",
    blurb: "Runs the ledger: BLOCK-rule and AI-model registries, external data claims, hash-chain integrity.",
    icon: ShieldCheck,
    order: 11,
  },
};

const SERVICE_TYPES = ["washing_station", "mill", "transporter", "verifier", "regulator", "platform_admin"];

type Step = "booting" | "pick-role" | "pick-actor";

export default function HomePage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [binding, setBinding] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("booting");
  const [bootMessage, setBootMessage] = useState("Preparing seed world…");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [servicesOpen, setServicesOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (localStorage.getItem("ankuaru_session")) {
      router.replace("/workspace");
      return;
    }
    async function boot() {
      setError(null);
      const cached = readCache<Role[]>("/v1/roles");
      setStep(cached?.length ? "pick-role" : "booting");
      try {
        setBootMessage("Loading actors from the database…");
        const list = await cachedApi<Role[]>("/v1/roles", undefined, (l) => {
          if (!cancelled && l.length) setRoles(l);
        });
        if (cancelled) return;
        if (!list?.length) {
          setError(
            "No demo actors in the database. On Vercel set DATABASE_URL + DIRECT_URL, redeploy, then run npm run db:seed.",
          );
          setStep("pick-role");
          return;
        }
        setStep("pick-role");
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "API unreachable — start the simulator with npm run dev",
        );
        setStep("pick-role");
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function bind(role: Role) {
    const preferred = CAP_FOR[role.actorType];
    const capacity = (preferred && role.capacities.includes(preferred) ? preferred : role.capacities[0]) as string;
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

  const playableTypes = ["farmer", "collector", "akrabi", "exporter", "importer"].filter((t) =>
    byType.has(t),
  );

  const serviceTypes = SERVICE_TYPES.filter((t) => byType.has(t));

  const actorsForType = selectedType ? byType.get(selectedType) ?? [] : [];

  const roleCard = (type: string) => {
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
  };

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
          Farmer → Collector → Aggregator → Exporter → Importer. Seed the database once with{" "}
          <code className="text-xs">npm run db:seed</code>, then enter any role.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {[
          { id: "booting", label: "1 · Load world" },
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
              {roles.length} demo actors ready · loaded from database
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{playableTypes.map(roleCard)}</div>
          {serviceTypes.length > 0 && (
            <div className="pt-4">
              <button
                type="button"
                aria-expanded={servicesOpen}
                aria-controls="service-roles"
                onClick={() => setServicesOpen((o) => !o)}
                className="group flex w-full items-start gap-2 rounded-md py-1 text-left"
              >
                <ChevronRight
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-primary",
                    servicesOpen && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-lg font-semibold">Service &amp; oversight roles</span>
                    <Badge variant="outline">{serviceTypes.length}</Badge>
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    They don&apos;t buy or sell coffee. They process it, carry it, check the paperwork, enforce the
                    rules, or run the platform, and each comes with seeded demo work.
                  </span>
                </span>
              </button>
              {servicesOpen && (
                <div id="service-roles" className="mt-3 grid animate-fade-in gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {serviceTypes.map(roleCard)}
                </div>
              )}
            </div>
          )}
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
                    {r.legalIdentityRef ?? r.actorId.slice(0, 8)} · {r.capacities.join(", ")}
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

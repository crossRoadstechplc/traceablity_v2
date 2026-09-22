"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bean,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sprout,
  Truck,
  Warehouse,
} from "lucide-react";
import { api, type SessionInfo } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
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

type Step = "boot" | "pick-role" | "pick-actor";

export default function HomePage() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [binding, setBinding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("boot");
  const [selectedType, setSelectedType] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const list = await api<Role[]>("/v1/roles");
      setRoles(list);
      setStep(list.length ? "pick-role" : "boot");
    } catch (e) {
      setError(e instanceof Error ? e.message : "API unreachable — start the simulator with npm run dev");
      setStep("boot");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function seed() {
    setSeeding(true);
    setError(null);
    try {
      await api("/v1/seed", { method: "POST", body: "{}" });
      await refresh();
      setStep("pick-role");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

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
          Farmer → Collector → Aggregator → Exporter.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          {error}
        </Alert>
      )}

      {/* Progress */}
      <ol className="mb-8 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {[
          { id: "boot", label: "1 · Prepare world" },
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
                    (step === "pick-role" && s.id === "boot")) &&
                  "bg-accent text-accent-foreground",
              )}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking for a seeded world…
          </CardContent>
        </Card>
      ) : step === "boot" || roles.length === 0 ? (
        <Card className="animate-fade-in overflow-hidden">
          <CardHeader>
            <CardTitle>Prepare the seed world</CardTitle>
            <CardDescription>
              Boots eight Ethiopian sites, three coffee cycles, and a multi-farm washed blend
              ready for lineage tracing. No OTP — this is a simulator bind, not a marketing login.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button onClick={() => void seed()} disabled={seeding}>
              {seeding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Seeding eight sites…
                </>
              ) : (
                "Seed world & continue"
              )}
            </Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={seeding}>
              <RefreshCw className="h-4 w-4" />
              Recheck
            </Button>
          </CardContent>
        </Card>
      ) : step === "pick-role" ? (
        <div className="animate-fade-in space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-semibold">Choose your capacity</h2>
              <p className="text-sm text-muted-foreground">
                {roles.length} demo actors ready · world already seeded
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void seed()} disabled={seeding}>
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reseed
            </Button>
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
    </main>
  );
}

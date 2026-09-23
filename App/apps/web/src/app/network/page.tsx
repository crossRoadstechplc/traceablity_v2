"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { AppShell, useSession } from "@/components/AppShell";
import { cachedApi, readCache } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatKg, formatState } from "@/lib/utils";
import { LoadingOverlay } from "@/components/LoadingOverlay";

type Counts = {
  collectors: number;
  farmers: number;
  processingSites: number;
  aggregators: number;
  exporters?: number;
};

type Node = {
  actorId: string;
  actorType: string;
  displayName: string;
  displayLabel: string;
  legalIdentityRef?: string;
  metadata?: Record<string, string>;
  counts?: Counts;
  children?: Node[];
};

type Profile = {
  actor: {
    actorId: string;
    actorType: string;
    displayName: string;
    legalIdentityRef: string;
  };
  displayLabel: string;
  relation: string;
  metadata: Record<string, string>;
  legalIdentityRef: string;
  counts: Counts;
  networkMembers: Array<{
    actorId: string;
    actorType: string;
    displayLabel: string;
  }>;
  deliveries: Array<{
    lotId: string;
    displayCode: string;
    form: string;
    weightKg: number;
    receivedAt: string;
  }>;
};

const META_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  akrabi: [
    { key: "region", label: "Region" },
    { key: "zone", label: "Zone" },
    { key: "woreda", label: "Woreda" },
    { key: "registrationNo", label: "Registration no." },
    { key: "license", label: "License" },
    { key: "warehouseLocation", label: "Warehouse location" },
    { key: "yearsOperating", label: "Years operating" },
  ],
  collector: [
    { key: "region", label: "Region" },
    { key: "zone", label: "Zone" },
    { key: "woreda", label: "Woreda" },
    { key: "kebele", label: "Kebele" },
    { key: "phone", label: "Phone" },
    { key: "coverageArea", label: "Coverage area" },
    { key: "yearsCollecting", label: "Years collecting" },
  ],
  farmer: [
    { key: "region", label: "Region" },
    { key: "zone", label: "Zone" },
    { key: "woreda", label: "Woreda" },
    { key: "kebele", label: "Kebele" },
    { key: "phone", label: "Phone" },
    { key: "farmSizeHa", label: "Farm size (ha)" },
    { key: "variety", label: "Variety" },
    { key: "yearsFarming", label: "Years farming" },
  ],
  washing_station: [
    { key: "region", label: "Region" },
    { key: "zone", label: "Zone" },
    { key: "woreda", label: "Woreda" },
    { key: "kebele", label: "Kebele" },
    { key: "registrationNo", label: "Registration no." },
    { key: "capacityKgPerDay", label: "Capacity (kg/day)" },
    { key: "operator", label: "Operator" },
  ],
  mill: [
    { key: "region", label: "Region" },
    { key: "zone", label: "Zone" },
    { key: "woreda", label: "Woreda" },
    { key: "kebele", label: "Kebele" },
    { key: "registrationNo", label: "Registration no." },
    { key: "capacityKgPerDay", label: "Capacity (kg/day)" },
    { key: "operator", label: "Operator" },
  ],
  exporter: [
    { key: "companyName", label: "Company" },
    { key: "region", label: "Region" },
    { key: "zone", label: "Zone" },
    { key: "woreda", label: "Woreda" },
    { key: "address", label: "Address" },
    { key: "exportLicense", label: "Export license" },
    { key: "nbeRegistration", label: "NBE registration" },
    { key: "contactPerson", label: "Contact" },
    { key: "contactPhone", label: "Phone" },
    { key: "warehouse", label: "Warehouse" },
    { key: "yearsOperating", label: "Years operating" },
    { key: "primaryDestinations", label: "Primary destinations" },
    { key: "annualVolumeBags", label: "Annual volume (bags)" },
    { key: "certifications", label: "Certifications" },
    { key: "bank", label: "Bank" },
    { key: "tin", label: "TIN" },
  ],
  importer: [
    { key: "companyName", label: "Company" },
    { key: "country", label: "Country" },
    { key: "market", label: "Market" },
    { key: "address", label: "Address" },
    { key: "contactPerson", label: "Contact" },
    { key: "contactPhone", label: "Phone" },
    { key: "warehouse", label: "Warehouse" },
    { key: "yearsOperating", label: "Years operating" },
  ],
};

function typeLabel(t: string): string {
  if (t === "akrabi") return "Aggregator";
  if (t === "washing_station") return "Washing station";
  return formatState(t).replace(/\b\w/g, (c) => c.toUpperCase());
}

function coffeeForm(state: string): string {
  if (state === "green_washed") return "Green (washed)";
  if (state === "green_natural") return "Green (natural)";
  return formatState(state).replace(/\b\w/g, (c) => c.toUpperCase());
}

function countsSummary(c?: Counts): string {
  if (!c) return "";
  const parts: string[] = [];
  if (c.exporters) parts.push(`${c.exporters} exporter${c.exporters === 1 ? "" : "s"}`);
  if (c.aggregators) parts.push(`${c.aggregators} aggregator${c.aggregators === 1 ? "" : "s"}`);
  if (c.collectors) parts.push(`${c.collectors} collector${c.collectors === 1 ? "" : "s"}`);
  if (c.processingSites)
    parts.push(`${c.processingSites} processing site${c.processingSites === 1 ? "" : "s"}`);
  if (c.farmers) parts.push(`${c.farmers} farm${c.farmers === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function formatReceived(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function NetworkPage() {
  return (
    <AppShell>
      <NetworkInner />
    </AppShell>
  );
}

function NetworkInner() {
  const session = useSession();
  const [tree, setTree] = useState<{ self?: Node; children: Node[] } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let expandedOnce = false;
    cachedApi<{ self: Node; children: Node[] }>("/v1/network", session.sessionId, (data) => {
      setTree(data);
      if (!expandedOnce) {
        expandedOnce = true;
        setExpanded(new Set(data.children.map((c) => c.actorId)));
      }
    }).catch((e) => setError(String(e.message ?? e)));
  }, [session]);

  const openProfile = async (actorId: string) => {
    if (!session) return;
    const path = `/v1/network/${actorId}`;
    setProfileLoading(readCache(path, session.sessionId) === undefined);
    setError(null);
    try {
      await cachedApi<Profile>(path, session.sessionId, (p) => {
        setProfile(p);
        setProfileLoading(false);
      });
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setProfileLoading(false);
    }
  };

  const allIds = useMemo(() => {
    const ids: string[] = [];
    for (const c of tree?.children ?? []) {
      ids.push(c.actorId);
      for (const gc of c.children ?? []) ids.push(gc.actorId);
    }
    return ids;
  }, [tree]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold">My Network</h1>
        <p className="text-sm text-muted-foreground">
          Parties you sponsor. Open a profile for CORE metadata and deliveries that reached you.
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {tree && (
        <Card>
          <CardHeader className="space-y-3">
            <div>
              <CardTitle className="text-base">
                {tree.self?.displayName ?? session?.actor.displayName}&apos;s network
              </CardTitle>
              <CardDescription className="capitalize">
                {typeLabel(tree.self?.actorType ?? session?.actor.actorType ?? "")}
                {tree.self?.counts ? ` · ${countsSummary(tree.self.counts)}` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExpanded(new Set(allIds))}
              >
                Expand all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setExpanded(new Set())}>
                Collapse all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tree.children.length === 0 ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {tree.self?.actorType === "farmer"
                    ? "Farmers see their own farm profile here (no sponsored parties)."
                    : "No sponsored parties yet."}
                </p>
                {tree.self && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openProfile(tree.self!.actorId)}
                  >
                    Open your profile
                  </Button>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {tree.children.map((c) => {
                  const open = expanded.has(c.actorId);
                  const hasKids = (c.children?.length ?? 0) > 0;
                  return (
                    <li key={c.actorId} className="rounded-md border bg-background/60">
                      <div className="flex items-start gap-2 p-3">
                        <button
                          type="button"
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
                          disabled={!hasKids}
                          onClick={() => hasKids && toggle(c.actorId)}
                          aria-label={open ? "Collapse" : "Expand"}
                        >
                          {hasKids ? (
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform",
                                !open && "-rotate-90",
                              )}
                            />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            className="text-left font-medium text-sky-800 underline-offset-2 hover:underline"
                            onClick={() => openProfile(c.actorId)}
                          >
                            {c.displayLabel}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{typeLabel(c.actorType)}</Badge>
                            {c.counts && (
                              <span className="text-xs text-muted-foreground">
                                {countsSummary(c.counts)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {open && hasKids && (
                        <ul className="space-y-1 border-t bg-muted/20 px-3 py-2 pl-10">
                          {c.children!.map((gc) => (
                            <li key={gc.actorId} className="flex flex-wrap items-center gap-2 py-1 text-sm">
                              <button
                                type="button"
                                className="font-medium text-sky-800 underline-offset-2 hover:underline"
                                onClick={() => openProfile(gc.actorId)}
                              >
                                {gc.displayLabel}
                              </button>
                              <Badge variant="secondary">{typeLabel(gc.actorType)}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {(profile || profileLoading) && (
        <ProfileModal
          profile={profile}
          loading={profileLoading}
          onClose={() => setProfile(null)}
          onOpenMember={openProfile}
        />
      )}
      <LoadingOverlay
        open={profileLoading && !profile}
        title="Loading profile"
        detail="Fetching metadata and delivery history…"
      />
    </div>
  );
}

function ProfileModal({
  profile,
  loading,
  onClose,
  onOpenMember,
}: {
  profile: Profile | null;
  loading: boolean;
  onClose: () => void;
  onOpenMember: (id: string) => void;
}) {
  const fields = profile
    ? META_FIELDS[profile.actor.actorType] ?? [
        { key: "region", label: "Region" },
        { key: "zone", label: "Zone" },
        { key: "woreda", label: "Woreda" },
      ]
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-card shadow-xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && !profile ? (
          <div className="p-6 text-sm text-muted-foreground">Loading profile…</div>
        ) : profile ? (
          <>
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card px-4 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {typeLabel(profile.actor.actorType)}
                </div>
                <div className="font-display text-xl font-semibold">{profile.displayLabel}</div>
                <p className="text-sm text-muted-foreground">
                  {profile.legalIdentityRef} · {profile.relation}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 px-4 py-4">
              <dl className="space-y-2">
                {fields.map(({ key, label }) => {
                  const value = profile.metadata[key];
                  if (!value) return null;
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[1fr_1.2fr] gap-3 border-b border-border/60 py-1.5 text-sm last:border-0"
                    >
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium text-right">{value}</dd>
                    </div>
                  );
                })}
              </dl>

              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Historical supplies to you
                </h3>
                {profile.deliveries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed deliveries yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[28rem] text-left text-sm">
                      <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-2 py-2 font-medium">Lot</th>
                          <th className="px-2 py-2 font-medium">Form</th>
                          <th className="px-2 py-2 font-medium">Weight</th>
                          <th className="px-2 py-2 font-medium">Received</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profile.deliveries.map((d) => (
                          <tr key={d.lotId + d.receivedAt} className="border-t">
                            <td className="px-2 py-2 font-medium">{d.displayCode}</td>
                            <td className="px-2 py-2">{coffeeForm(d.form)}</td>
                            <td className="px-2 py-2 font-semibold tabular-nums">
                              {formatKg(d.weightKg)}
                            </td>
                            <td className="px-2 py-2 text-muted-foreground">
                              {formatReceived(d.receivedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  In {profile.displayLabel}&apos;s network
                </h3>
                {profile.networkMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sponsored parties.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {profile.networkMembers.map((m) => (
                      <li key={m.actorId} className="flex flex-wrap items-baseline gap-2">
                        <span className="text-muted-foreground">{typeLabel(m.actorType)}:</span>
                        <button
                          type="button"
                          className="font-medium text-sky-800 underline underline-offset-2"
                          onClick={() => onOpenMember(m.actorId)}
                        >
                          {m.displayLabel}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="sticky bottom-0 border-t bg-card px-4 py-3">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

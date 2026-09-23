"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Scale, AlertTriangle } from "lucide-react";
import { AppShell, useSession } from "@/components/AppShell";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatKg, formatState } from "@/lib/utils";
import { LoadingOverlay, InlineBusy } from "@/components/LoadingOverlay";

type Lot = {
  lotId: string;
  displayCode: string;
  processingState: string;
  processingRoute: string;
  canonicalMassKg: number;
  status: string;
  ownerActorId?: string;
  custodianActorId?: string;
  cropYear?: string;
  originStatus?: string;
};

type TraceNode = {
  lotId: string;
  displayCode: string;
  title: string;
  summary: string;
  kind: "origin" | "aggregate" | "process" | "split" | "other";
  massKg: number;
  processingState: string;
  processingRoute: string;
  status: string;
  cropYear?: string;
  originStatus?: string;
  yieldPct?: number;
  parentLotIds: string[];
  parentCount: number;
  ownerLabel: string;
  custodianLabel: string;
  locationId?: string;
  originLocationId?: string;
  cropYearComposition: Record<string, number>;
  provenance: Record<string, number>;
  contributions: Array<{
    parentLotId: string;
    contributionKg: number;
    proportion: number;
  }>;
};

type LineageResp = {
  origins: string[];
  forward: string[];
  forwardLots?: Array<{
    lotId: string;
    displayCode: string;
    form: string;
    status: string;
  }>;
  farmCount?: number;
  lot?: Lot;
  edges: Array<{
    parentLotId: string;
    childLotId: string;
    contributionKg: number;
    proportion: number;
  }>;
  nodes: TraceNode[];
};

type Integrity = {
  traceability: { ok: boolean; farmerVerified: number; counterparty: number };
  weightBalance: {
    ok: boolean;
    minted: number;
    active: number;
    closed: number;
    rejectLoss: number;
  };
  discrepancies: { open: number };
};

type ActivityEvent = {
  eventId: string;
  eventType: string;
  eventTime: string;
  actorLabel: string;
  affectedObjectIds: string[];
};

export default function InspectorPage() {
  return (
    <AppShell>
      <InspectorInner />
    </AppShell>
  );
}

function InspectorInner() {
  const session = useSession();
  const [tab, setTab] = useState("lineage");
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState("");
  const [lineage, setLineage] = useState<LineageResp | null>(null);
  const [accordion, setAccordion] = useState<string>("");
  const [breakdown, setBreakdown] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<string>>(new Set());
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [lineageBusy, setLineageBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    setBooting(true);
    Promise.all([
      api<{ lots: Lot[] }>("/v1/inspector/lots", { sessionId: session.sessionId }),
      api<Integrity>("/v1/inspector/integrity", { sessionId: session.sessionId }),
      api<{ events: ActivityEvent[] }>("/v1/inspector/activity", {
        sessionId: session.sessionId,
      }).catch(() => ({ events: [] as ActivityEvent[] })),
    ])
      .then(([l, integ, act]) => {
        setLots(l.lots);
        setIntegrity(integ);
        setActivity(act.events);
        const preferred = localStorage.getItem("ankuaru_preferred_lot");
        const pick =
          (preferred && l.lots.find((x) => x.lotId === preferred)?.lotId) ||
          l.lots.find((x) => x.status === "active")?.lotId ||
          l.lots[0]?.lotId ||
          "";
        if (pick) setLotId(pick);
      })
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setBooting(false));
  }, [session]);

  useEffect(() => {
    if (!session || !lotId) return;
    // CORE §8: changing lot resets accordion/tree state
    setAccordion("");
    setBreakdown(false);
    setExpanded(new Set());
    setMore(new Set());
    setLineageBusy(true);
    api<LineageResp>(`/v1/inspector/lineage?lotId=${lotId}`, {
      sessionId: session.sessionId,
    })
      .then(setLineage)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLineageBusy(false));
  }, [session, lotId]);

  const nodeMap = useMemo(() => {
    const m = new Map<string, TraceNode>();
    for (const n of lineage?.nodes ?? []) m.set(n.lotId, n);
    return m;
  }, [lineage]);

  const selected = lots.find((l) => l.lotId === lotId) ?? lineage?.lot;
  const rootNode = nodeMap.get(lotId);
  const farmCount = lineage?.farmCount ?? lineage?.origins.length ?? 0;
  const immediateParents = lineage?.edges.filter((e) => e.childLotId === lotId).length ?? 0;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMore = (id: string) => {
    setMore((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeLots = lots.filter((l) => l.status === "active").length;
  const closedLots = lots.filter((l) => l.status !== "active").length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold">Ledger inspector</h1>
        <p className="text-sm text-muted-foreground">
          Lots you touched, lineage trace, and full-ledger integrity checks.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {booting ? (
        <InlineBusy label="Loading inspector lots, activity, and integrity…" />
      ) : (
      <>
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile value={String(activeLots)} label="Active lots" />
        <StatTile value={String(closedLots)} label="Closed lots" />
        <StatTile value={String(activity.length)} label="Ledger events" />
        <StatTile
          value={String(integrity?.discrepancies.open ?? 0)}
          label="Open discrepancies"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
          <TabsTrigger value="lots" className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none bg-transparent px-3">
            All lots
          </TabsTrigger>
          <TabsTrigger value="activity" className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none bg-transparent px-3">
            Activity
          </TabsTrigger>
          <TabsTrigger value="lineage" className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none bg-transparent px-3">
            Lineage trace
          </TabsTrigger>
          <TabsTrigger value="integrity" className="data-[state=active]:border-b-2 data-[state=active]:border-foreground rounded-none bg-transparent px-3">
            Integrity checks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lots" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visible lots</CardTitle>
              <CardDescription>Owned, held, or on a movement you were party to.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Lot</th>
                    <th className="pb-2 pr-3 font-medium">Form</th>
                    <th className="pb-2 pr-3 font-medium">Mass</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.lotId} className="border-t">
                      <td className="py-2 pr-3 font-medium">{l.displayCode}</td>
                      <td className="py-2 pr-3">{formatCoffeeState(l.processingState)}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatKg(l.canonicalMassKg)}</td>
                      <td className="py-2 pr-3 capitalize">{l.status}</td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setLotId(l.lotId);
                            setTab("lineage");
                          }}
                        >
                          Trace
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
              <CardDescription>Events on lots you can see (newest first).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              ) : (
                activity.slice(0, 50).map((e) => (
                  <div
                    key={e.eventId}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded border bg-background/50 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{formatState(e.eventType)}</span>
                      <span className="text-muted-foreground"> · {e.actorLabel}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {e.eventTime ? new Date(e.eventTime).toLocaleString() : "—"}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lineage" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lineage trace</CardTitle>
              <CardDescription>Trace a lot back to origin farms.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Select a lot</label>
                <Select value={lotId} onValueChange={setLotId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a lot" />
                  </SelectTrigger>
                  <SelectContent>
                    {lots.map((l) => (
                      <SelectItem key={l.lotId} value={l.lotId}>
                        {l.displayCode} · {formatCoffeeState(l.processingState)}
                        {l.status !== "active" ? " · closed" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selected && (
                <div className="overflow-hidden rounded-md border bg-card">
                  <div className="border-b px-4 py-4">
                    <div className="text-xs font-medium text-muted-foreground">
                      {selected.displayCode}
                    </div>
                    <div className="font-display text-2xl font-semibold tracking-tight">
                      {formatCoffeeState(selected.processingState)}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatState(selected.processingRoute)} · {formatKg(selected.canonicalMassKg)} ·{" "}
                      {selected.status === "active" ? "Active" : "Closed"}
                    </p>
                  </div>

                  <Accordion
                    type="single"
                    collapsible
                    value={accordion}
                    onValueChange={(v) => {
                      setAccordion(v);
                      if (v !== "trace") setBreakdown(false);
                    }}
                  >
                    <AccordionItem value="trace" className="border-b-0">
                      <AccordionTrigger className="bg-muted/50 px-4 hover:no-underline">
                        <span className="flex w-full items-center gap-3 pr-2 text-left">
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            Traceability
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {farmCount} farm{farmCount === 1 ? "" : "s"}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-4 pt-3 sm:px-4">
                        {!breakdown ? (
                          <div className="space-y-3">
                            <dl className="grid grid-cols-2 gap-2 text-sm">
                              <SummaryCell k="Lot" v={selected.displayCode} />
                              <SummaryCell
                                k="State"
                                v={`${formatCoffeeState(selected.processingState)} · ${formatState(selected.processingRoute)}`}
                              />
                              <SummaryCell k="Mass" v={formatKg(selected.canonicalMassKg)} />
                              <SummaryCell
                                k="Owner"
                                v={rootNode?.ownerLabel ?? "—"}
                              />
                              <SummaryCell
                                k="Custodian"
                                v={rootNode?.custodianLabel ?? "—"}
                              />
                              <SummaryCell
                                k="Origin basis"
                                v={formatState(selected.originStatus ?? rootNode?.originStatus ?? "—")}
                              />
                            </dl>
                            <p className="text-sm text-muted-foreground">
                              This lot traces to {farmCount} farmer harvest batch
                              {farmCount === 1 ? "" : "es"}
                              {rootNode && rootNode.parentCount === 0
                                ? " (this is an origin parcel)."
                                : immediateParents > 0
                                  ? ` via ${immediateParents} immediate upstream lot(s).`
                                  : "."}
                            </p>
                            <Button
                              size="sm"
                              onClick={() => {
                                setBreakdown(true);
                                setExpanded(new Set((lineage?.nodes ?? []).map((n) => n.lotId)));
                              }}
                            >
                              View Breakdown
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setExpanded(new Set((lineage?.nodes ?? []).map((n) => n.lotId)))
                                }
                              >
                                Expand all
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExpanded(new Set([lotId]))}
                              >
                                Collapse to this lot
                              </Button>
                            </div>
                            {rootNode ? (
                              <LineageSeed
                                node={rootNode}
                                nodeMap={nodeMap}
                                expanded={expanded}
                                more={more}
                                onToggle={toggleExpand}
                                onMore={toggleMore}
                                depth={0}
                              />
                            ) : (
                              <p className="text-sm text-muted-foreground">No lineage nodes.</p>
                            )}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="forward" className="border-t">
                      <AccordionTrigger className="px-4 hover:no-underline">
                        <span className="flex w-full items-center gap-3 pr-2 text-left">
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            Forward visibility
                          </span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {(lineage?.forwardLots?.length ?? lineage?.forward.length ?? 0) > 0
                              ? `${lineage!.forwardLots?.length ?? lineage!.forward.length} next hop(s)`
                              : "End of chain"}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <p className="mb-2 text-sm text-muted-foreground">
                          Shows the next hop only. Open a child lot to continue.
                        </p>
                        {(lineage?.forwardLots?.length ?? 0) === 0 &&
                        (lineage?.forward.length ?? 0) === 0 ? (
                          <p className="text-sm">No further lots recorded.</p>
                        ) : (
                          <p className="text-sm">
                            <span className="font-medium">{selected.displayCode}</span>
                            {" → "}
                            {(lineage?.forwardLots ?? []).map((f, i) => (
                              <span key={f.lotId}>
                                {i > 0 && ", "}
                                <button
                                  type="button"
                                  className="text-sky-800 underline-offset-2 hover:underline"
                                  onClick={() => setLotId(f.lotId)}
                                >
                                  {f.displayCode}
                                </button>
                              </span>
                            ))}
                          </p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrity" className="mt-4">
          {integrity ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard
                title="Weight balance"
                ok={integrity.weightBalance.ok}
                icon={Scale}
                lines={[
                  `Minted ${formatKg(integrity.weightBalance.minted)}`,
                  `Active ${formatKg(integrity.weightBalance.active)}`,
                  `Closed ${formatKg(integrity.weightBalance.closed)}`,
                  `Reject + loss ${formatKg(integrity.weightBalance.rejectLoss)}`,
                ]}
              />
              <MetricCard
                title="Traceability"
                ok={integrity.traceability.ok}
                icon={CheckCircle2}
                lines={[
                  `Farmer verified ${integrity.traceability.farmerVerified}`,
                  `Counterparty recorded ${integrity.traceability.counterparty}`,
                ]}
              />
              <MetricCard
                title="Discrepancies"
                ok={integrity.discrepancies.open === 0}
                icon={AlertTriangle}
                lines={[`${integrity.discrepancies.open} open shipment variance(s)`]}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading integrity…</p>
          )}
        </TabsContent>
      </Tabs>
      </>
      )}
      <LoadingOverlay
        open={lineageBusy}
        title="Tracing lineage"
        detail="Walking ancestry and building seed cards…"
      />
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border bg-background/50 px-2 py-1.5">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div>{v}</div>
    </div>
  );
}

function LineageSeed({
  node,
  nodeMap,
  expanded,
  more,
  onToggle,
  onMore,
  depth,
}: {
  node: TraceNode;
  nodeMap: Map<string, TraceNode>;
  expanded: Set<string>;
  more: Set<string>;
  onToggle: (id: string) => void;
  onMore: (id: string) => void;
  depth: number;
}) {
  const parents = node.parentLotIds
    .map((id) => nodeMap.get(id))
    .filter((n): n is TraceNode => !!n);
  const isLeaf = parents.length === 0;
  const isOpen = expanded.has(node.lotId);
  const showMore = more.has(node.lotId);

  return (
    <div
      className={cn(
        "rounded-md border border-border/80 bg-background",
        depth > 0 && "mt-2",
      )}
    >
      <div className="p-3 sm:p-3.5">
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground"
            disabled={isLeaf}
            aria-label={isLeaf ? "Origin lot" : isOpen ? "Collapse" : "Expand"}
            onClick={() => {
              if (!isLeaf) onToggle(node.lotId);
            }}
          >
            {isLeaf ? (
              <span className="block h-1.5 w-1.5 rounded-full bg-foreground" />
            ) : (
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")}
              />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex rounded bg-slate-600 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white">
                {node.displayCode}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {formatKg(node.massKg)}
              </span>
            </div>
            <div className="mt-1.5 text-[15px] font-semibold leading-snug tracking-tight">
              {node.title}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{node.summary}</p>

            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-800"
              onClick={(e) => {
                e.stopPropagation();
                onMore(node.lotId);
              }}
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", !showMore && "-rotate-90")}
              />
              {showMore ? "Hide" : "More"}
            </button>

            {showMore && (
              <div className="mt-2 space-y-1.5 rounded border border-border/70 bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
                <DetailRow label="Owner" value={node.ownerLabel} />
                <DetailRow label="Custodian" value={node.custodianLabel} />
                <DetailRow
                  label="Origin plot"
                  value={node.originLocationId?.replace(/_/g, " ") ?? "—"}
                />
                <DetailRow
                  label="Current location"
                  value={node.locationId?.replace(/_/g, " ") ?? "—"}
                />
                <DetailRow label="Crop year" value={node.cropYear ?? "mix"} />
                <DetailRow label="Route" value={formatState(node.processingRoute)} />
                <DetailRow
                  label="Origin basis"
                  value={
                    node.originStatus === "farmer_verified"
                      ? "Farmer verified"
                      : node.originStatus
                        ? "Recorded by counterparty"
                        : "—"
                  }
                />
                <DetailRow
                  label="Status"
                  value={node.status === "active" ? "Active" : "Closed"}
                />
                {node.yieldPct != null && (
                  <DetailRow label="Process yield" value={`${node.yieldPct.toFixed(1)}%`} />
                )}
                {node.contributions.length > 0 && (
                  <div>
                    <div className="mb-1 font-medium text-foreground/80">Parent lots</div>
                    <ul className="space-y-0.5">
                      {node.contributions.map((c) => {
                        const p = nodeMap.get(c.parentLotId);
                        return (
                          <li key={c.parentLotId}>
                            {p?.displayCode ?? c.parentLotId.slice(0, 8)} ·{" "}
                            {formatKg(c.contributionKg)} · {(c.proportion * 100).toFixed(1)}%
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {Object.keys(node.cropYearComposition ?? {}).length > 0 && (
                  <div>
                    <div className="mb-1 font-medium text-foreground/80">Crop-year mix</div>
                    <ul className="space-y-0.5">
                      {Object.entries(node.cropYearComposition).map(([y, kg]) => (
                        <li key={y}>
                          {y}: {formatKg(kg)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isOpen && parents.length > 0 && (
        <div className="relative space-y-2 border-t border-border/60 bg-muted/20 px-2 py-2 sm:px-3 sm:py-2.5">
          <div
            className="pointer-events-none absolute bottom-2 left-[18px] top-2 w-px bg-border sm:left-[22px]"
            aria-hidden
          />
          {parents.map((p) => (
            <div key={p.lotId} className="relative pl-3 sm:pl-4">
              <LineageSeed
                node={p}
                nodeMap={nodeMap}
                expanded={expanded}
                more={more}
                onToggle={onToggle}
                onMore={onMore}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 font-medium text-foreground/70">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function formatCoffeeState(state: string): string {
  if (state === "green_washed") return "Green (washed)";
  if (state === "green_natural") return "Green (natural)";
  if (state === "wet_parchment") return "Wet parchment";
  if (state === "dry_parchment") return "Dry parchment";
  return formatState(state).replace(/\b\w/g, (c) => c.toUpperCase());
}

function MetricCard({
  title,
  ok,
  icon: Icon,
  lines,
}: {
  title: string;
  ok: boolean;
  icon: typeof Scale;
  lines: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className={cn("h-4 w-4", ok ? "text-emerald-700" : "text-amber-700")} />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <Badge variant={ok ? "success" : "warn"}>{ok ? "OK" : "Attention"}</Badge>
        {lines.map((l) => (
          <p key={l} className="text-xs text-muted-foreground">
            {l}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

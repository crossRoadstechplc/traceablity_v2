"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Scale, AlertTriangle } from "lucide-react";
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
import { cn, formatKg, formatState, shortId } from "@/lib/utils";

type Lot = {
  lotId: string;
  displayCode: string;
  processingState: string;
  processingRoute: string;
  canonicalMassKg: number;
  status: string;
  ownerActorId: string;
  custodianActorId: string;
  cropYear?: string;
  originStatus?: string;
  locationId?: string;
  provenance: Record<string, number>;
};

type LineageResp = {
  origins: string[];
  forward: string[];
  lot?: Lot;
  edges: Array<{
    parentLotId: string;
    childLotId: string;
    contributionKg: number;
    proportion: number;
  }>;
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

export default function InspectorPage() {
  return (
    <AppShell>
      <InspectorInner />
    </AppShell>
  );
}

function InspectorInner() {
  const session = useSession();
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotId, setLotId] = useState("");
  const [lineage, setLineage] = useState<LineageResp | null>(null);
  const [accordion, setAccordion] = useState<string>("");
  const [breakdown, setBreakdown] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<string>>(new Set());
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [allLots, setAllLots] = useState<Lot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    Promise.all([
      api<{ lots: Lot[] }>("/v1/inspector/lots", { sessionId: session.sessionId }),
      api<Integrity>("/v1/inspector/integrity", { sessionId: session.sessionId }),
    ])
      .then(([l, integ]) => {
        setLots(l.lots);
        setAllLots(l.lots);
        setIntegrity(integ);
        if (l.lots[0]) setLotId(l.lots[0].lotId);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [session]);

  useEffect(() => {
    if (!session || !lotId) return;
    setAccordion("");
    setBreakdown(false);
    setExpanded(new Set());
    setMore(new Set());
    api<LineageResp>(`/v1/inspector/lineage?lotId=${lotId}`, {
      sessionId: session.sessionId,
    })
      .then(setLineage)
      .catch((e) => setError(String(e.message ?? e)));
  }, [session, lotId]);

  const lotMap = useMemo(() => {
    const m = new Map<string, Lot>();
    for (const l of allLots) m.set(l.lotId, l);
    return m;
  }, [allLots]);

  const selected = lots.find((l) => l.lotId === lotId) ?? lineage?.lot;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold">Ledger inspector</h1>
        <p className="text-sm text-muted-foreground">
          Lots you touched, lineage trace, and full-ledger integrity checks.
        </p>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {integrity && (
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
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lineage trace</CardTitle>
          <CardDescription>Trace a lot back to origin farms.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Lot</label>
            <Select value={lotId} onValueChange={setLotId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a lot" />
              </SelectTrigger>
              <SelectContent>
                {lots.map((l) => (
                  <SelectItem key={l.lotId} value={l.lotId}>
                    {l.displayCode} · {formatState(l.processingState)}
                    {l.status !== "active" ? " · closed" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <>
              <div className="rounded-md border bg-background/60 px-3 py-3">
                <div className="font-display text-lg font-semibold">
                  {selected.displayCode} · {formatState(selected.processingState)}
                </div>
                <p className="text-sm text-muted-foreground">
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
                <AccordionItem value="trace">
                  <AccordionTrigger>
                    <span className="flex w-full items-center justify-between pr-2">
                      <span>Traceability</span>
                      <Badge variant="outline">
                        {lineage?.origins.length ?? 0} farm
                        {(lineage?.origins.length ?? 0) === 1 ? "" : "s"}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {!breakdown ? (
                      <div className="space-y-3">
                        <dl className="grid grid-cols-2 gap-2 text-sm">
                          <Row k="Lot" v={selected.displayCode} />
                          <Row
                            k="State"
                            v={`${formatState(selected.processingState)} · ${formatState(selected.processingRoute)}`}
                          />
                          <Row k="Mass" v={formatKg(selected.canonicalMassKg)} />
                          <Row k="Origin basis" v={formatState(selected.originStatus ?? "—")} />
                        </dl>
                        <p className="text-sm text-muted-foreground">
                          This lot traces to {lineage?.origins.length ?? 0} farmer harvest
                          batch(es)
                          {lineage && lineage.origins.includes(lotId)
                            ? " (this is an origin parcel)."
                            : "."}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => {
                            setBreakdown(true);
                            const exp = new Set<string>([lotId, ...(lineage?.origins ?? [])]);
                            for (const e of lineage?.edges ?? []) {
                              exp.add(e.parentLotId);
                              exp.add(e.childLotId);
                            }
                            setExpanded(exp);
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
                            variant="secondary"
                            onClick={() => setExpanded(new Set(allLots.map((l) => l.lotId)))}
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
                        <TraceNode
                          lotId={lotId}
                          lotMap={lotMap}
                          edges={lineage?.edges ?? []}
                          expanded={expanded}
                          setExpanded={setExpanded}
                          more={more}
                          setMore={setMore}
                        />
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="forward">
                  <AccordionTrigger>
                    <span className="flex w-full items-center justify-between pr-2">
                      <span>Forward visibility</span>
                      <Badge variant="outline">
                        {(lineage?.forward.length ?? 0) > 0
                          ? `${lineage!.forward.length} next hop(s)`
                          : "End of chain"}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="mb-2 text-sm text-muted-foreground">
                      Shows the next hop only. Open a child lot to continue.
                    </p>
                    {(lineage?.forward.length ?? 0) === 0 ? (
                      <p className="text-sm">No further lots recorded.</p>
                    ) : (
                      <p className="text-sm">
                        <span className="font-medium">{selected.displayCode}</span>
                        {" → "}
                        {lineage!.forward
                          .map((id) => lotMap.get(id)?.displayCode ?? shortId(id))
                          .join(", ")}
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border bg-background/50 px-2 py-1.5">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="capitalize">{v}</div>
    </div>
  );
}

function TraceNode({
  lotId,
  lotMap,
  edges,
  expanded,
  setExpanded,
  more,
  setMore,
}: {
  lotId: string;
  lotMap: Map<string, Lot>;
  edges: LineageResp["edges"];
  expanded: Set<string>;
  setExpanded: (s: Set<string>) => void;
  more: Set<string>;
  setMore: (s: Set<string>) => void;
}) {
  const lot = lotMap.get(lotId);
  const parents = edges.filter((e) => e.childLotId === lotId).map((e) => e.parentLotId);
  const isOrigin = parents.length === 0;
  const isOpen = expanded.has(lotId);

  return (
    <div className="ml-2 border-l border-border pl-3">
      <div className="flex flex-wrap items-center gap-2 py-1">
        <button
          type="button"
          className="text-left text-sm disabled:cursor-default"
          disabled={isOrigin}
          onClick={() => {
            if (isOrigin) return;
            const next = new Set(expanded);
            if (next.has(lotId)) next.delete(lotId);
            else next.add(lotId);
            setExpanded(next);
          }}
        >
          <span className="mr-1 text-muted-foreground">{isOrigin ? "●" : isOpen ? "▼" : "▶"}</span>
          <Badge variant="outline" className="mr-1">
            {lot?.displayCode ?? shortId(lotId)}
          </Badge>
          <span>
            {isOrigin
              ? shortId(Object.keys(lot?.provenance ?? {})[0] ?? "Origin")
              : formatState(lot?.processingState ?? "")}
          </span>
          <span className="ml-2 text-muted-foreground">{formatKg(lot?.canonicalMassKg)}</span>
        </button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => {
            const next = new Set(more);
            if (next.has(lotId)) next.delete(lotId);
            else next.add(lotId);
            setMore(next);
          }}
        >
          {more.has(lotId) ? "Hide" : "More"}
        </Button>
      </div>
      {more.has(lotId) && lot && (
        <div className="mb-2 rounded border bg-muted/40 px-2 py-2 text-xs text-muted-foreground">
          Owner {shortId(lot.ownerActorId)} · Custodian {shortId(lot.custodianActorId)} ·{" "}
          {lot.locationId ?? "—"} · {lot.cropYear ?? "mix"} ·{" "}
          {formatState(lot.originStatus ?? "—")} · {lot.status}
        </div>
      )}
      {isOpen &&
        parents.map((p) => (
          <TraceNode
            key={p}
            lotId={p}
            lotMap={lotMap}
            edges={edges}
            expanded={expanded}
            setExpanded={setExpanded}
            more={more}
            setMore={setMore}
          />
        ))}
    </div>
  );
}

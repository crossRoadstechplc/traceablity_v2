"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Combine,
  FileCheck2,
  GitBranch,
  PackagePlus,
  Send,
  Settings2,
  Split,
  UserPlus,
  UserRoundPen,
  XCircle,
} from "lucide-react";
import { AppShell, CHAIN_ROLES, useSession } from "@/components/AppShell";
import { cachedApi, command } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatKg, formatState } from "@/lib/utils";
import { LoadingOverlay } from "@/components/LoadingOverlay";

type Lot = {
  lotId: string;
  displayCode: string;
  processingState: string;
  processingRoute: string;
  canonicalMassKg: number;
  ownerActorId: string;
  custodianActorId: string;
  ownerLabel?: string;
  cropYear?: string;
  originStatus?: string;
  inTransit: boolean;
  status: string;
};

type Movement = {
  movementId: string;
  lotId: string;
  fromActorId: string;
  fromLabel?: string;
  lotDisplayCode?: string;
  form?: string;
  senderDeclaredKg: number;
  state: string;
  requiresSealCheck?: boolean;
  shinto?: { weightKg: number; volumeBags: number; grade: string; sealStatusOrigin: string };
  contracts?: Array<{ contractId: string; priceEtbPerKg: number }>;
};

type Target = { actorId: string; displayName: string; actorType?: string };

type Issue = {
  issueId: string;
  lifecycle: string;
  intervention: "BLOCK" | "WARN" | "FLAG";
  subjectType: string;
  subjectId: string;
  summary: string;
  disposition?: string;
  authorityTag?: string;
};

type LotDetail = {
  ownerLabel: string;
  custodianLabel: string;
  priorSupplier: string;
  requiresShinto: boolean;
  createdBy: string;
  issues: Issue[];
  evidence: Array<{ evidenceId: string; documentType: string; status: string; evidenceClass: string }>;
};

type Facility = { actorId: string; displayName: string; capabilities: string[] };

type Dashboard = {
  overdueReceipts: unknown[];
  openIssues: unknown[];
  openObligations: unknown[];
  stockByState: Record<string, number>;
};

type FormKind =
  | null
  | "origin"
  | "intake"
  | "onboard"
  | "send"
  | "split"
  | "combine"
  | "process"
  | "transfer"
  | "close"
  | "evidence"
  | "issue";

const LOSS_CATEGORIES = ["processing_loss", "moisture_loss", "handling_loss", "spillage", "theft", "other"];
const CHANNELS = ["primary_transaction_center", "direct_linkage", "ecx"];
const DISPOSITIONS = ["Resolved", "Explained", "Accepted", "Unresolved", "Escalated"];

export default function WorkspacePage() {
  return (
    <AppShell>
      <WorkspaceInner />
    </AppShell>
  );
}

function WorkspaceInner() {
  const session = useSession();
  const [lots, setLots] = useState<Lot[]>([]);
  const [pending, setPending] = useState<Movement[]>([]);
  const [selected, setSelected] = useState<Lot | null>(null);
  const [form, setForm] = useState<FormKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [transferTargets, setTransferTargets] = useState<Target[]>([]);
  const [intakeTargets, setIntakeTargets] = useState<Target[]>([]);
  const [transporters, setTransporters] = useState<Target[]>([]);
  const [importers, setImporters] = useState<Target[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [assistable, setAssistable] = useState<Target[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [lotDetail, setLotDetail] = useState<LotDetail | null>(null);
  const [massKg, setMassKg] = useState("100");
  const [recv, setRecv] = useState<Record<string, { kg: string; seal: string; channel: string; contractId: string }>>({});
  const [toActorId, setToActorId] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [shinto, setShinto] = useState({ volumeBags: "", grade: "", sealStatusOrigin: "sealed" });
  const [channel, setChannel] = useState("");
  const [contractId, setContractId] = useState("");
  const [childMasses, setChildMasses] = useState("50,50");
  const [rejectKg, setRejectKg] = useState("0");
  const [lossKg, setLossKg] = useState("0");
  const [lossCategory, setLossCategory] = useState("processing_loss");
  const [moisturePct, setMoisturePct] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [byProductKind, setByProductKind] = useState("");
  const [byProductKg, setByProductKg] = useState("");
  const [outputState, setOutputState] = useState("dry_parchment");
  const [impurityPct, setImpurityPct] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [onboardName, setOnboardName] = useState("");
  const [facilityName, setFacilityName] = useState("");
  const [facilityType, setFacilityType] = useState<"washing_station" | "mill">("washing_station");
  const [onboardMeta, setOnboardMeta] = useState<Record<string, string>>({
    region: "South Ethiopia",
    zone: "Gedeo",
    woreda: "Yirgacheffe",
  });
  const [facilityMeta, setFacilityMeta] = useState<Record<string, string>>({
    region: "South Ethiopia",
    zone: "Gedeo",
    woreda: "Yirgacheffe",
  });
  const [supplierId, setSupplierId] = useState("");
  const [assistFor, setAssistFor] = useState("");
  const [evidence, setEvidence] = useState({ documentType: "", evidenceClass: "self_assessment", factSupported: "", issuer: "", validTo: "" });
  const [evidenceHash, setEvidenceHash] = useState<string | undefined>(undefined);
  const [issueSummary, setIssueSummary] = useState("");
  const [claimedGrade, setClaimedGrade] = useState("");
  const [assignedGrade, setAssignedGrade] = useState("");
  const [resolve, setResolve] = useState<Record<string, { disposition: string; note: string }>>({});
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Updating ledger…");

  const sid = session?.sessionId;
  const role = session?.actor.capacity ?? "";
  const isChain = CHAIN_ROLES.includes(role);

  const refresh = useCallback(async () => {
    if (!sid) return;
    const optional = <T,>(p: Promise<T>) => p.catch(() => undefined);
    const targetsOf = (set: (t: Target[]) => void) => (d: { targets: Target[] }) => set(d.targets);
    await Promise.all([
      cachedApi<{ lots: Lot[] }>("/v1/inventory", sid, (inv) => {
        setLots(inv.lots);
        setSelected((cur) => (cur ? inv.lots.find((l) => l.lotId === cur.lotId) ?? null : null));
      }),
      cachedApi<{ movements: Movement[] }>("/v1/pending-receipts", sid, (d) => setPending(d.movements)),
      optional(cachedApi("/v1/send-targets", sid, targetsOf(setTargets))),
      optional(cachedApi("/v1/transfer-targets", sid, targetsOf(setTransferTargets))),
      optional(cachedApi("/v1/intake-targets", sid, targetsOf(setIntakeTargets))),
      optional(cachedApi("/v1/transporters", sid, targetsOf(setTransporters))),
      optional(cachedApi("/v1/importers", sid, targetsOf(setImporters))),
      optional(cachedApi<{ facilities: Facility[] }>("/v1/process-facilities", sid, (d) => setFacilities(d.facilities))),
      optional(cachedApi<Dashboard>("/v1/dashboard", sid, setDashboard)),
      optional(cachedApi<{ sponsoredForAssist: Target[] }>("/v1/me", sid, (d) => setAssistable(d.sponsoredForAssist ?? []))),
    ]);
  }, [sid]);

  const loadDetail = useCallback(async () => {
    if (!sid || !selected) {
      setLotDetail(null);
      return;
    }
    setLotDetail(null);
    await cachedApi<LotDetail>(`/v1/lot-detail?lotId=${selected.lotId}`, sid, setLotDetail).catch(() => setLotDetail(null));
  }, [sid, selected?.lotId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message ?? e)));
    const h = () => void refresh();
    window.addEventListener("ankuaru-refresh", h);
    return () => window.removeEventListener("ankuaru-refresh", h);
  }, [refresh]);

  async function run(path: string, body: unknown, label = "Updating the ledger…", assistedFor?: string) {
    if (!sid) return;
    setError(null);
    setNotice(null);
    setBusyLabel(label);
    setBusy(true);
    try {
      const r = await command(path, body, { sessionId: sid, assistedFor, label });
      if (r.queued) setNotice("You are offline — saved to the sync queue with its capture time. It will be committed when you reconnect.");
      setForm(null);
      await refresh();
      await loadDetail();
      window.dispatchEvent(new Event("ankuaru-refresh"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }

  const onboardSpec = ONBOARD_BY_ROLE[role];
  const canOnboard = !!onboardSpec;
  const supplierNoun = INTAKE_SUPPLIER_BY_ROLE[role];
  const canIntake = !!supplierNoun;
  const canOrigin = role === "Farmer";
  const canAssist = role === "Collector" && assistable.length > 0;
  const greenIntake = role === "Exporter" || role === "Importer";

  const addLotLabel = canOrigin ? "Add origin lot" : `Intake from ${supplierNoun ?? "supplier"}`;

  const onboardLabel = onboardSpec ? `Onboard ${onboardSpec.noun}` : "Onboard";

  const openAddLot = () => {
    setSelected(null);
    setError(null);
    setAssistFor("");
    setMassKg(greenIntake ? "1200" : role === "Farmer" ? "100" : "500");
    setForm(canOrigin ? "origin" : "intake");
  };

  const openForm = (f: FormKind) => {
    setError(null);
    setToActorId("");
    setChannel("");
    setContractId("");
    if (f === "process" && selected) {
      setOutputState(defaultOutput(selected.processingState, selected.processingRoute));
      setRejectKg("0");
      setLossKg("0");
      setMoisturePct("");
      setByProductKind("");
      setByProductKg("");
      setFacilityId(facilities[0]?.actorId ?? "");
    }
    if (f === "send" && selected) {
      setTransporterId("");
      setShinto({ volumeBags: String(Math.max(1, Math.round(selected.canonicalMassKg / 60))), grade: "", sealStatusOrigin: "sealed" });
    }
    setForm(f);
  };

  const derivedProductKg = useMemo(() => {
    if (!selected) return 0;
    return Math.round((selected.canonicalMassKg - Number(rejectKg || 0) - Number(lossKg || 0)) * 1000) / 1000;
  }, [selected, rejectKg, lossKg]);

  const blockOrWarn = lotDetail?.issues.filter((i) => i.lifecycle !== "RESOLVED" && i.intervention !== "FLAG") ?? [];

  if (session && !isChain) {
    return <ServiceWorkspace role={role} sid={sid} lots={lots} pending={pending} />;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {role} Dashboard
          </p>
          <h1 className="font-display text-2xl font-semibold">{role} workspace</h1>
          <p className="text-sm text-muted-foreground">
            {canOrigin
              ? "Create harvest origin lots, then send to your collector."
              : canIntake
                ? "Intake from your sponsored suppliers, confirm receipts, and move coffee upstream."
                : "Inventory you hold, pending receipts, and lot actions."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(canOrigin || canIntake) && (
            <Button size="sm" onClick={openAddLot}>
              <PackagePlus className="h-4 w-4" />
              {addLotLabel}
            </Button>
          )}
          {canAssist && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelected(null);
                setError(null);
                setMassKg("100");
                setAssistFor(assistable[0]?.actorId ?? "");
                setForm("origin");
              }}
            >
              <UserRoundPen className="h-4 w-4" />
              Assisted farmer entry
            </Button>
          )}
          {canOnboard && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setForm("onboard");
                setSelected(null);
                setError(null);
              }}
            >
              <UserPlus className="h-4 w-4" />
              {onboardLabel}
            </Button>
          )}
        </div>
      </div>

      {dashboard && <DashboardStrip dashboard={dashboard} />}

      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="warn">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending receipts</CardTitle>
                <CardDescription>Confirm physical arrival with your own weight. Do not copy the sender&apos;s figure.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pending.map((m) => {
                  const r = recv[m.movementId] ?? { kg: "", seal: "", channel: "", contractId: "" };
                  const setR = (patch: Partial<typeof r>) =>
                    setRecv((all) => ({ ...all, [m.movementId]: { ...r, ...patch } }));
                  return (
                    <div key={m.movementId} className="rounded-md border bg-background/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="font-medium">
                          {m.lotDisplayCode ?? "Inbound movement"}
                          {m.fromLabel && <span className="text-muted-foreground"> · from {m.fromLabel}</span>}
                        </span>
                        <div className="flex gap-1.5">
                          {m.state === "receipt_overdue" && <Badge variant="danger">Overdue</Badge>}
                          <Badge variant="warn">Sender {formatKg(m.senderDeclaredKg)}</Badge>
                        </div>
                      </div>
                      {m.shinto && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Shinto: {formatKg(m.shinto.weightKg)} · {m.shinto.volumeBags} bags · grade {m.shinto.grade} · seal {m.shinto.sealStatusOrigin}
                        </p>
                      )}
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Field label="Your observed kg">
                          <Input value={r.kg} onChange={(e) => setR({ kg: e.target.value })} placeholder="Weigh and enter" />
                        </Field>
                        {m.requiresSealCheck && (
                          <Field label="Seal on arrival">
                            <Select value={r.seal} onValueChange={(v) => setR({ seal: v })}>
                              <SelectTrigger>
                                <SelectValue placeholder="Inspect seal" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="intact">Intact</SelectItem>
                                <SelectItem value="broken">Broken / tampered</SelectItem>
                              </SelectContent>
                            </Select>
                          </Field>
                        )}
                        {role === "Exporter" && (
                          <>
                            <Field label="Transaction channel">
                              <Select value={r.channel} onValueChange={(v) => setR({ channel: v })}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Required for exporter purchases" />
                                </SelectTrigger>
                                <SelectContent>
                                  {CHANNELS.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {formatState(c)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </Field>
                            {r.channel === "direct_linkage" && (
                              <Field label="Direct-linkage contract">
                                <Select value={r.contractId} onValueChange={(v) => setR({ contractId: v })}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Registered contract" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(m.contracts ?? []).map((c) => (
                                      <SelectItem key={c.contractId} value={c.contractId}>
                                        {c.contractId.slice(0, 8)} · {c.priceEtbPerKg} ETB/kg
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </Field>
                            )}
                          </>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="mt-2"
                        disabled={busy || !r.kg || (m.requiresSealCheck && !r.seal)}
                        onClick={() =>
                          void run(
                            "/v1/commands/receive",
                            {
                              movementId: m.movementId,
                              receiverDeclaredKg: Number(r.kg),
                              ...(m.requiresSealCheck ? { stationSealIntact: r.seal === "intact", stationNetWeightKg: Number(r.kg) } : {}),
                              ...(r.channel ? { transactionChannel: r.channel } : {}),
                              ...(r.contractId ? { contractId: r.contractId } : {}),
                            },
                            "Confirming receipt…",
                          )
                        }
                      >
                        Confirm receipt
                      </Button>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inventory</CardTitle>
              <CardDescription>{lots.length} active lot{lots.length === 1 ? "" : "s"} in custody</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {lots.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {canOrigin
                    ? "No lots yet — use Add origin lot for a harvest."
                    : "No lots in custody — use intake from a sponsored supplier, or confirm a receipt."}
                </p>
              )}
              {lots.map((l) => (
                <button
                  key={l.lotId}
                  type="button"
                  onClick={() => {
                    setSelected(l);
                    setForm(null);
                  }}
                  className={cn(
                    "w-full rounded-md border px-3 py-2.5 text-left transition",
                    selected?.lotId === l.lotId
                      ? "border-primary bg-accent/70 ring-1 ring-primary/30"
                      : "bg-card hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{l.displayCode}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatKg(l.canonicalMassKg)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{formatState(l.processingState)}</Badge>
                    <Badge variant="secondary">{formatState(l.processingRoute)}</Badge>
                    {l.ownerActorId !== session?.actor.actorId && l.ownerLabel && (
                      <Badge variant="outline">Owner: {l.ownerLabel}</Badge>
                    )}
                    {l.inTransit && <Badge variant="warn">In transit</Badge>}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="min-h-[320px]">
          <CardHeader>
            <CardTitle className="text-base">
              {form === "origin" && (assistFor ? "Assisted origin lot" : "Create origin lot")}
              {form === "intake" && addLotLabel}
              {form === "onboard" && onboardLabel}
              {form === "send" && "Send lot"}
              {form === "split" && "Split lot"}
              {form === "combine" && "Combine lots"}
              {form === "process" && "Process"}
              {form === "transfer" && "Transfer ownership"}
              {form === "close" && "Close lot"}
              {form === "evidence" && "Attach evidence"}
              {form === "issue" && "Raise an issue"}
              {!form && selected && selected.displayCode}
              {!form && !selected && "Lot detail"}
            </CardTitle>
            <CardDescription>
              {!form &&
                !selected &&
                (canOrigin
                  ? "Select a lot from inventory, or Add origin lot."
                  : "Select a lot from inventory, or intake from a sponsored supplier.")}
              {!form && selected && `${formatState(selected.processingRoute)} · ${selected.status}`}
              {form === "origin" &&
                (assistFor
                  ? "You are entering this harvest for a farmer you sponsor. The event records you as the person who entered it."
                  : "Farmer harvest at the farm gate — you are the named origin farmer.")}
              {form === "intake" &&
                "Pick a sponsored supplier. The farmer origin is taken from their network (no farmer picker)."}
              {form === "onboard" && onboardSpec?.description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selected && !form && (
              <p className="text-sm text-muted-foreground">Waiting for selection…</p>
            )}

            {form === "origin" && (canOrigin || assistFor) && (
              <FormStack>
                {assistFor && (
                  <Field label="Farmer">
                    <Select value={assistFor} onValueChange={setAssistFor}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assistable.map((t) => (
                          <SelectItem key={t.actorId} value={t.actorId}>
                            {t.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <Field label="Mass (kg)">
                  <Input value={massKg} onChange={(e) => setMassKg(e.target.value)} />
                </Field>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run("/v1/commands/origin-lot", { massKg: Number(massKg) }, "Creating origin lot…", assistFor || undefined)
                  }
                >
                  Create origin
                </Button>
              </FormStack>
            )}

            {form === "intake" && canIntake && (
              <FormStack>
                <Field label={`Supplier ${supplierNoun}`}>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select from your sponsored network" />
                    </SelectTrigger>
                    <SelectContent>
                      {intakeTargets.map((t) => (
                        <SelectItem key={t.actorId} value={t.actorId}>
                          {t.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {intakeTargets.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No sponsored suppliers yet — use Onboard first.
                  </p>
                )}
                <Alert>
                  You do not pick a farmer here. INV-10 resolves a named farmer from the
                  supplier&apos;s sponsored tree automatically.
                </Alert>
                <Field label="Mass (kg)">
                  <Input value={massKg} onChange={(e) => setMassKg(e.target.value)} />
                </Field>
                <Button
                  disabled={busy || !supplierId}
                  onClick={() =>
                    void run(
                      "/v1/commands/intake-lot",
                      {
                        supplierActorId: supplierId,
                        massKg: Number(massKg),
                      },
                      "Recording intake…",
                    )
                  }
                >
                  Add lot from supplier
                </Button>
              </FormStack>
            )}

            {form === "onboard" && onboardSpec && (
              <FormStack>
                <Field label="Display name">
                  <Input value={onboardName} onChange={(e) => setOnboardName(e.target.value)} />
                </Field>
                {onboardSpec.fields.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input
                      value={onboardMeta[key] ?? ""}
                      onChange={(e) =>
                        setOnboardMeta((m) => ({ ...m, [key]: e.target.value }))
                      }
                    />
                  </Field>
                ))}
                {role === "Exporter" && (
                  <>
                    <Field label="Processing site name">
                      <Input
                        value={facilityName}
                        onChange={(e) => setFacilityName(e.target.value)}
                        placeholder="e.g. Yirgacheffe Washing Station"
                      />
                    </Field>
                    <Field label="Processing site type">
                      <Select
                        value={facilityType}
                        onValueChange={(v) =>
                          setFacilityType(v as "washing_station" | "mill")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="washing_station">Washing station</SelectItem>
                          <SelectItem value="mill">Mill</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {[
                        ["region", "Site region"],
                        ["zone", "Site zone"],
                        ["woreda", "Site woreda"],
                        ["kebele", "Site kebele"],
                        ["registrationNo", "Site registration no."],
                        ["capacityKgPerDay", "Capacity (kg/day)"],
                        ["operator", "Operator"],
                      ].map(([key, label]) => (
                        <Field key={`fac-${key}`} label={label}>
                          <Input
                            value={facilityMeta[key] ?? ""}
                            onChange={(e) => setFacilityMeta((m) => ({ ...m, [key]: e.target.value }))}
                          />
                        </Field>
                      ))}
                  </>
                )}
                <Button
                  disabled={busy || !onboardName}
                  onClick={() => {
                    const fieldKeys = new Set(onboardSpec.fields.map(([k]) => k));
                    const clean = (m: Record<string, string>) =>
                      Object.fromEntries(Object.entries(m).filter(([, v]) => v.trim() !== ""));
                    const meta: Record<string, string> = {
                      ...Object.fromEntries(
                        Object.entries(clean(onboardMeta)).filter(([k]) => fieldKeys.has(k)),
                      ),
                      userOnboarded: "true",
                    };
                    void run("/v1/commands/onboard", {
                      actorType: onboardSpec.actorType,
                      displayName: onboardName,
                      legalIdentityRef:
                        meta.registrationNo ?? `${onboardSpec.refPrefix}${Date.now().toString().slice(-6)}`,
                      metadata: meta,
                      facility:
                        role === "Exporter"
                          ? {
                              displayName: facilityName.trim() || undefined,
                              facilityType,
                              metadata: clean(facilityMeta),
                            }
                          : undefined,
                    }, "Onboarding party…");
                  }}
                >
                  Create {onboardSpec.noun}
                </Button>
              </FormStack>
            )}

            {selected && !form && (
              <div className="space-y-4">
                {blockOrWarn.length > 0 && (
                  <Alert variant={blockOrWarn.some((i) => i.intervention === "BLOCK") ? "destructive" : "warn"}>
                    {blockOrWarn.map((i) => (
                      <div key={i.issueId}>
                        <strong>{i.intervention}</strong> · {i.summary}
                      </div>
                    ))}
                  </Alert>
                )}
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Code" value={selected.displayCode} tag="Recorded" />
                  <Stat label="Form" value={formatState(selected.processingState)} tag="Recorded" />
                  <Stat label="Mass" value={formatKg(selected.canonicalMassKg)} tag="Recorded" />
                  <Stat label="Route" value={formatState(selected.processingRoute)} tag="Recorded" />
                  <Stat label="Crop year" value={selected.cropYear ?? "Composition"} tag={selected.cropYear ? "Recorded" : "Derived"} />
                  <Stat label="Owner" value={lotDetail?.ownerLabel ?? "…"} tag="Recorded" />
                  <Stat label="Custodian" value={lotDetail?.custodianLabel ?? "…"} tag="Recorded" />
                  <Stat label="Prior supplier" value={lotDetail?.priorSupplier ?? "…"} tag="Derived" />
                  <Stat label="Origin" value={formatState(selected.originStatus ?? "—")} tag={selected.originStatus ? "Assessment" : "Missing"} />
                  <Stat label="Evidence" value={lotDetail ? `${lotDetail.evidence.length} attached` : "…"} tag={lotDetail?.evidence.length ? "Recorded" : "Missing"} />
                </dl>
                {selected.inTransit ? (
                  <Alert variant="warn">In transit — actions locked until receipt is confirmed.</Alert>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <ActionBtn icon={Send} label="Send" onClick={() => openForm("send")} />
                    <ActionBtn icon={Split} label="Split" onClick={() => openForm("split")} />
                    <ActionBtn icon={Combine} label="Combine" onClick={() => openForm("combine")} />
                    <ActionBtn icon={Settings2} label="Process" onClick={() => openForm("process")} />
                    <ActionBtn icon={GitBranch} label="Transfer" onClick={() => openForm("transfer")} />
                    <ActionBtn icon={XCircle} label="Close" onClick={() => openForm("close")} />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => openForm("evidence")}>
                    <FileCheck2 className="h-4 w-4" />
                    Attach evidence
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openForm("issue")}>
                    <AlertTriangle className="h-4 w-4" />
                    Raise issue
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/inspector?lotId=${selected.lotId}`}>Trace in Inspector</Link>
                  </Button>
                </div>

                {lotDetail && lotDetail.issues.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issues on this lot</p>
                    {lotDetail.issues.map((i) => {
                      const discrepancy = i.subjectType === "movement" && /discrepan/i.test(i.summary) && i.lifecycle !== "RESOLVED";
                      const r = resolve[i.issueId] ?? { disposition: "", note: "" };
                      return (
                        <div key={i.issueId} className="rounded-md border p-2 text-sm">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={i.intervention === "BLOCK" ? "danger" : i.intervention === "WARN" ? "warn" : "outline"}>
                              {i.intervention}
                            </Badge>
                            <Badge variant="secondary">{formatState(i.lifecycle)}</Badge>
                            {i.disposition && <Badge variant="outline">{i.disposition}</Badge>}
                            <span>{i.summary}</span>
                          </div>
                          {discrepancy && (
                            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                              <Select
                                value={r.disposition}
                                onValueChange={(v) => setResolve((all) => ({ ...all, [i.issueId]: { ...r, disposition: v } }))}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Disposition" />
                                </SelectTrigger>
                                <SelectContent>
                                  {DISPOSITIONS.map((d) => (
                                    <SelectItem key={d} value={d}>
                                      {d}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                placeholder="Note (required for Explained)"
                                value={r.note}
                                onChange={(e) => setResolve((all) => ({ ...all, [i.issueId]: { ...r, note: e.target.value } }))}
                              />
                              <Button
                                size="sm"
                                disabled={busy || !r.disposition}
                                onClick={() =>
                                  void run(
                                    "/v1/commands/resolve-discrepancy",
                                    { movementId: i.subjectId, disposition: r.disposition, note: r.note || undefined },
                                    "Recording discrepancy disposition…",
                                  )
                                }
                              >
                                Resolve
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selected && form === "send" && (
              <FormStack>
                <Field label="Destination">
                  <Select value={toActorId} onValueChange={setToActorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select target" />
                    </SelectTrigger>
                    <SelectContent>
                      {targets.map((t) => (
                        <SelectItem key={t.actorId} value={t.actorId}>
                          {t.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Transporter (optional)">
                  <Select value={transporterId || "none"} onValueChange={(v) => setTransporterId(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Own transport</SelectItem>
                      {transporters.map((t) => (
                        <SelectItem key={t.actorId} value={t.actorId}>
                          {t.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {lotDetail?.requiresShinto && (
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Shinto dispatch pass (required for green coffee)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label="Bags">
                        <Input value={shinto.volumeBags} onChange={(e) => setShinto({ ...shinto, volumeBags: e.target.value })} />
                      </Field>
                      <Field label="Grade">
                        <Input value={shinto.grade} onChange={(e) => setShinto({ ...shinto, grade: e.target.value })} placeholder="e.g. G1" />
                      </Field>
                      <Field label="Seal at origin">
                        <Select value={shinto.sealStatusOrigin} onValueChange={(v) => setShinto({ ...shinto, sealStatusOrigin: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sealed">Sealed</SelectItem>
                            <SelectItem value="unsealed">Unsealed</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={!toActorId || busy || (lotDetail?.requiresShinto && (!shinto.grade || !shinto.volumeBags))}
                    onClick={() =>
                      void run("/v1/commands/send", {
                        lotId: selected.lotId,
                        toActorId,
                        senderDeclaredKg: selected.canonicalMassKg,
                        destinationLocationId: "destination",
                        ...(transporterId ? { transporterActorId: transporterId } : {}),
                        ...(lotDetail?.requiresShinto
                          ? {
                              shinto: {
                                weightKg: selected.canonicalMassKg,
                                volumeBags: Number(shinto.volumeBags),
                                grade: shinto.grade,
                                sealStatusOrigin: shinto.sealStatusOrigin,
                              },
                            }
                          : {}),
                      }, "Dispatching…")
                    }
                  >
                    Dispatch
                  </Button>
                </div>
              </FormStack>
            )}

            {selected && form === "split" && (
              <FormStack>
                <Field label="Child masses (comma-separated, must sum exactly)">
                  <Input value={childMasses} onChange={(e) => setChildMasses(e.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run("/v1/commands/disaggregate", {
                        parentLotId: selected.lotId,
                        childMassesKg: childMasses.split(",").map((x) => Number(x.trim())),
                      })
                    }
                  >
                    Split
                  </Button>
                </div>
              </FormStack>
            )}

            {selected && form === "combine" && (
              <FormStack>
                <p className="text-sm text-muted-foreground">
                  Combines all inventory lots matching this lot&apos;s form and route.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      const peers = lots.filter(
                        (l) =>
                          !l.inTransit &&
                          l.processingState === selected.processingState &&
                          l.processingRoute === selected.processingRoute,
                      );
                      if (peers.length < 2) {
                        setError("Need ≥2 lots of the same form and route");
                        return;
                      }
                      void run("/v1/commands/aggregate", {
                        parentLotIds: peers.map((p) => p.lotId),
                      });
                    }}
                  >
                    Combine matching lots
                  </Button>
                </div>
              </FormStack>
            )}

            {selected && form === "process" && (
              <FormStack>
                <Field label="Output state">
                  <Select value={outputState} onValueChange={setOutputState}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["wet_parchment", "dry_parchment", "dried_cherry", "green_natural", "green_washed"].map((s) => (
                        <SelectItem key={s} value={s}>
                          {formatState(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Processing facility">
                  <Select value={facilityId} onValueChange={setFacilityId}>
                    <SelectTrigger>
                      <SelectValue placeholder={facilities.length ? "Select facility" : "No facility in your network"} />
                    </SelectTrigger>
                    <SelectContent>
                      {facilities.map((f) => (
                        <SelectItem key={f.actorId} value={f.actorId}>
                          {f.displayName} · {f.capabilities.map(formatState).join(", ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Reject kg">
                    <Input value={rejectKg} onChange={(e) => setRejectKg(e.target.value)} />
                  </Field>
                  <Field label="Loss kg (entered, never auto-plugged)">
                    <Input value={lossKg} onChange={(e) => setLossKg(e.target.value)} />
                  </Field>
                  <Field label="Loss category">
                    <Select value={lossCategory} onValueChange={setLossCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LOSS_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {formatState(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={`Moisture % ${outputState.startsWith("green") ? "(required for green)" : "(optional)"}`}>
                    <Input value={moisturePct} onChange={(e) => setMoisturePct(e.target.value)} placeholder="measured" />
                  </Field>
                  <Field label="By-product (optional)">
                    <Input value={byProductKind} onChange={(e) => setByProductKind(e.target.value)} placeholder="e.g. husk, pulp" />
                  </Field>
                  <Field label="By-product kg">
                    <Input value={byProductKg} onChange={(e) => setByProductKg(e.target.value)} />
                  </Field>
                </div>
                <div className="rounded-md border bg-background/50 px-3 py-2 text-sm">
                  Input {formatKg(selected.canonicalMassKg)} − reject {formatKg(Number(rejectKg || 0))} − loss{" "}
                  {formatKg(Number(lossKg || 0))} = <strong>product {formatKg(derivedProductKg)}</strong>{" "}
                  <Badge variant="outline">Derived</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy || derivedProductKg <= 0 || !facilityId}
                    onClick={() =>
                      void run("/v1/commands/process", {
                        inputLotIds: [selected.lotId],
                        outputState,
                        rejectKg: Number(rejectKg || 0),
                        lossKg: Number(lossKg || 0),
                        lossCategory: Number(lossKg || 0) > 0 ? lossCategory : undefined,
                        facilityActorId: facilityId,
                        ...(moisturePct ? { moisturePct: Number(moisturePct) } : {}),
                        ...(byProductKind && Number(byProductKg) > 0
                          ? { byProducts: [{ kind: byProductKind, massKg: Number(byProductKg) }] }
                          : {}),
                      }, "Recording processing…")
                    }
                  >
                    Process
                  </Button>
                </div>
              </FormStack>
            )}

            {selected && form === "transfer" && (
              <FormStack>
                <Field label="New owner">
                  <Select value={toActorId} onValueChange={setToActorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select owner" />
                    </SelectTrigger>
                    <SelectContent>
                      {transferTargets.map((t) => (
                        <SelectItem key={t.actorId} value={t.actorId}>
                          {t.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Transaction channel">
                  <Select value={channel || "none"} onValueChange={(v) => setChannel(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not recorded</SelectItem>
                      {CHANNELS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {formatState(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {channel === "direct_linkage" && (
                  <Field label="Contract id">
                    <Input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="Registered direct-linkage contract" />
                  </Field>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={!toActorId || busy}
                    onClick={() =>
                      void run("/v1/commands/transfer-ownership", {
                        lotId: selected.lotId,
                        newOwnerActorId: toActorId,
                        ...(channel ? { transactionChannel: channel } : {}),
                        ...(contractId ? { contractId } : {}),
                      })
                    }
                  >
                    Transfer
                  </Button>
                </div>
              </FormStack>
            )}

            {selected && form === "close" && (
              <FormStack>
                <p className="text-sm text-muted-foreground">Terminal disposition — lot stays queryable.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="FOB buyer (importer)">
                    <Select value={buyerId} onValueChange={setBuyerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select importer" />
                      </SelectTrigger>
                      <SelectContent>
                        {importers.map((t) => (
                          <SelectItem key={t.actorId} value={t.actorId}>
                            {t.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Impurity % (domestic only, measured)">
                    <Input value={impurityPct} onChange={(e) => setImpurityPct(e.target.value)} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run("/v1/commands/terminal-dispose", {
                        lotId: selected.lotId,
                        reason: "fob_export",
                        ...(buyerId ? { buyerActorId: buyerId } : {}),
                      })
                    }
                  >
                    Export at FOB
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || impurityPct === ""}
                    onClick={() =>
                      void run("/v1/commands/terminal-dispose", {
                        lotId: selected.lotId,
                        reason: "domestic_disposition",
                        impurityPct: Number(impurityPct),
                      })
                    }
                  >
                    Domestic
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void run("/v1/commands/terminal-dispose", {
                        lotId: selected.lotId,
                        reason: "destroyed",
                      })
                    }
                  >
                    Destroyed
                  </Button>
                </div>
              </FormStack>
            )}

            {selected && form === "evidence" && (
              <FormStack>
                <Field label="Document type">
                  <Input value={evidence.documentType} onChange={(e) => setEvidence({ ...evidence, documentType: e.target.value })} placeholder="e.g. quality certificate, DDS, receipt" />
                </Field>
                <Field label="Fact it supports">
                  <Input value={evidence.factSupported} onChange={(e) => setEvidence({ ...evidence, factSupported: e.target.value })} placeholder="e.g. grade, legality, geolocation" />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Evidence class">
                    <Select value={evidence.evidenceClass} onValueChange={(v) => setEvidence({ ...evidence, evidenceClass: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self_assessment">Self assessment</SelectItem>
                        <SelectItem value="laboratory">Laboratory</SelectItem>
                        <SelectItem value="official_authority">Official authority</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Issuer">
                    <Input value={evidence.issuer} onChange={(e) => setEvidence({ ...evidence, issuer: e.target.value })} />
                  </Field>
                  <Field label="Valid to (optional)">
                    <Input type="date" value={evidence.validTo} onChange={(e) => setEvidence({ ...evidence, validTo: e.target.value })} />
                  </Field>
                  <Field label="File (fingerprinted locally)">
                    <Input
                      type="file"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return setEvidenceHash(undefined);
                        const buf = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
                        setEvidenceHash([...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""));
                      }}
                    />
                  </Field>
                </div>
                {evidenceHash && <p className="break-all text-xs text-muted-foreground">sha256 {evidenceHash}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy || !evidence.documentType || !evidence.factSupported}
                    onClick={() =>
                      void run("/v1/commands/evidence", {
                        attachedType: "lot",
                        attachedId: selected.lotId,
                        evidenceClass: evidence.evidenceClass,
                        documentType: evidence.documentType,
                        factSupported: evidence.factSupported,
                        issuer: evidence.issuer || undefined,
                        sha256: evidenceHash,
                        validTo: evidence.validTo ? new Date(evidence.validTo).toISOString() : undefined,
                      }, "Attaching evidence…")
                    }
                  >
                    Attach
                  </Button>
                </div>
              </FormStack>
            )}

            {selected && form === "issue" && (
              <FormStack>
                <Field label="What is wrong?">
                  <Input value={issueSummary} onChange={(e) => setIssueSummary(e.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy || !issueSummary.trim()}
                    onClick={() =>
                      void run("/v1/commands/issue", {
                        intervention: "FLAG",
                        subjectType: "lot",
                        subjectId: selected.lotId,
                        summary: issueSummary,
                        lotIds: [selected.lotId],
                      }, "Raising issue…")
                    }
                  >
                    Raise issue
                  </Button>
                </div>
                {role === "Exporter" && selected.processingState.startsWith("green") && (
                  <div className="space-y-2 rounded-md border border-dashed p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grading dispute (REG-D05-05)</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="Assigned grade">
                        <Input value={assignedGrade} onChange={(e) => setAssignedGrade(e.target.value)} />
                      </Field>
                      <Field label="Claimed grade">
                        <Input value={claimedGrade} onChange={(e) => setClaimedGrade(e.target.value)} />
                      </Field>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !assignedGrade || !claimedGrade}
                      onClick={() =>
                        void run("/v1/commands/grading-dispute", {
                          lotId: selected.lotId,
                          assignedGrade,
                          claimedGrade,
                          note: issueSummary || undefined,
                        }, "Raising grading dispute…")
                      }
                    >
                      Raise grading dispute
                    </Button>
                  </div>
                )}
              </FormStack>
            )}
          </CardContent>
        </Card>
      </div>
      <LoadingOverlay open={busy} title="Working" detail={busyLabel} />
    </div>
  );
}

function defaultOutput(state: string, route: string): string {
  if (state === "cherry") return route === "natural" ? "dried_cherry" : "wet_parchment";
  if (state === "wet_parchment") return "dry_parchment";
  if (state === "dry_parchment") return "green_washed";
  if (state === "dried_cherry") return "green_natural";
  return "dry_parchment";
}

function DashboardStrip({ dashboard }: { dashboard: Dashboard }) {
  const stock = Object.entries(dashboard.stockByState);
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <MiniStat label="Overdue receipts" value={String(dashboard.overdueReceipts.length)} alert={dashboard.overdueReceipts.length > 0} />
      <MiniStat label="Open issues" value={String(dashboard.openIssues.length)} href="/records?tab=issues" />
      <MiniStat label="Open obligations" value={String(dashboard.openObligations.length)} href="/records?tab=obligations" />
      <MiniStat
        label="Stock by form"
        value={stock.length ? stock.map(([s, kg]) => `${formatState(s)} ${formatKg(kg)}`).join(" · ") : "—"}
      />
    </div>
  );
}

function MiniStat({ label, value, alert, href }: { label: string; value: string; alert?: boolean; href?: string }) {
  const body = (
    <div className={cn("rounded-md border bg-card px-3 py-2", alert && "border-destructive/50")}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** CORE §2.1 onboard matrix + §12 metadata fields per onboarded actor type. */
const ONBOARD_BY_ROLE: Record<
  string,
  { actorType: string; noun: string; refPrefix: string; description: string; fields: Array<[string, string]> }
> = {
  Importer: {
    actorType: "exporter",
    noun: "exporter",
    refPrefix: "REG-EXP-",
    description: "Add an exporter you sponsor.",
    fields: [
      ["companyName", "Company name"],
      ["address", "Address"],
      ["exportLicense", "Export license"],
      ["nbeRegistration", "NBE registration"],
      ["contactPerson", "Contact person"],
      ["contactPhone", "Contact phone"],
      ["warehouse", "Warehouse"],
      ["yearsOperating", "Years operating"],
      ["primaryDestinations", "Primary destinations"],
      ["annualVolumeBags", "Annual volume (bags)"],
      ["certifications", "Certifications"],
      ["bank", "Bank"],
      ["tin", "TIN"],
    ],
  },
  Exporter: {
    actorType: "akrabi",
    noun: "aggregator",
    refPrefix: "REG-AK-",
    description: "Add an aggregator (optional washing station or mill).",
    fields: [
      ["region", "Region"],
      ["zone", "Zone"],
      ["woreda", "Woreda"],
      ["registrationNo", "Registration no."],
      ["license", "License"],
      ["warehouseLocation", "Warehouse location"],
      ["yearsOperating", "Years operating"],
    ],
  },
  Aggregator: {
    actorType: "collector",
    noun: "collector",
    refPrefix: "USER-",
    description: "Add a collector you sponsor.",
    fields: [
      ["region", "Region"],
      ["zone", "Zone"],
      ["woreda", "Woreda"],
      ["kebele", "Kebele"],
      ["phone", "Phone"],
      ["coverageArea", "Coverage area"],
      ["yearsCollecting", "Years collecting"],
    ],
  },
  Collector: {
    actorType: "farmer",
    noun: "farmer",
    refPrefix: "USER-",
    description: "Add a farmer you sponsor.",
    fields: [
      ["region", "Region"],
      ["zone", "Zone"],
      ["woreda", "Woreda"],
      ["kebele", "Kebele"],
      ["phone", "Phone"],
      ["farmSizeHa", "Farm size (ha)"],
      ["variety", "Variety"],
      ["yearsFarming", "Years farming"],
    ],
  },
};

/** CORE §2.4 intake matrix, as the supplier noun shown in the UI. */
const INTAKE_SUPPLIER_BY_ROLE: Record<string, string> = {
  Collector: "farmer",
  Aggregator: "collector",
  Exporter: "aggregator",
  Importer: "exporter",
};

/** Module 12/14 service surfaces: who each non-chain role is, and what it does on the ledger. */
const SERVICE_COPY: Record<
  string,
  { title: string; who: string; does: string[]; never: string; links: Array<[string, string]> }
> = {
  Transporter: {
    title: "Transporter workspace",
    who: "A haulage company that moves coffee between chain actors (e.g. station → Addis warehouse → port).",
    does: [
      "Is named on each dispatch it carries, together with the Shinto transport pass (bags, grade, seal).",
      "Sees the consignments it carried — and only those lots.",
    ],
    never: "Never owns or holds custody of coffee: custody stays with the sender until the receiver confirms receipt.",
    links: [["/inspector", "Lots you carried"], ["/records?tab=notifications", "Notifications"]],
  },
  Driver: {
    title: "Driver workspace",
    who: "An individual driver carrying a consignment for a transporter.",
    does: ["Sees the consignments assigned to them and their Shinto pass."],
    never: "Never owns or holds custody of coffee.",
    links: [["/inspector", "Lots you carried"]],
  },
  FacilityOperator: {
    title: "Facility workspace",
    who: "A washing station or dry mill sponsored by an aggregator. It is where cherry becomes parchment and green.",
    does: [
      "Is named on every processing event run at the facility (capabilities are checked — a mill cannot wet-process).",
      "Sees the lots processed here, and can raise equipment or quality flags.",
    ],
    never: "Does not buy or sell coffee — the aggregator owns the lots it processes.",
    links: [["/inspector", "Lots processed here"], ["/records?tab=issues", "Issues"]],
  },
  Verifier: {
    title: "Verifier workspace",
    who: "An independent assurance body (e.g. an ISO 17065 certifier) trusted by buyers and regulators.",
    does: [
      "Verifies or revokes evidence uploaded by others — certificates, due-diligence statements, declarations.",
      "Runs deforestation overlays on mapped farm plots and flags possible tree-cover loss.",
    ],
    never: "Cannot verify its own uploads, and never edits lots or movements.",
    links: [["/records?tab=evidence", "Full evidence register"], ["/records?tab=farms", "Farms & geometry"]],
  },
  Regulator: {
    title: "Regulator workspace",
    who: "The national authority (ECTA) with read access across the whole ledger.",
    does: [
      "Issues Certificates of Competency, opens investigations, and applies the sanction ladder (warning → suspension → revocation).",
      "Every read it makes is itself logged to the regulator access register.",
    ],
    never: "Cannot rewrite history — corrections are new events, and sanctions only block future actions.",
    links: [
      ["/inspector", "Lineage & activity"],
      ["/records?tab=issues", "Issues"],
      ["/records?tab=credentials", "Credentials & sanctions"],
      ["/records?tab=admin", "Chain integrity"],
    ],
  },
  PlatformAdmin: {
    title: "Platform operations",
    who: "The Ankuaru operations team running the ledger itself.",
    does: [
      "Maintains the BLOCK-rule registry (only legal / official-standard rules may block) and the AI model registry.",
      "Ingests external data (weighbridges, port scales) as claims — a mismatch raises a FLAG, never an overwrite.",
    ],
    never: "Cannot silently change canonical records; admin actions require step-up re-authentication.",
    links: [["/records?tab=admin", "Administration"], ["/records?tab=issues", "Issues"], ["/inspector", "Inspector"]],
  },
};

type Consignment = {
  movementId: string;
  lotId: string;
  lotDisplayCode?: string;
  form?: string;
  fromLabel: string;
  toLabel: string;
  senderDeclaredKg: number;
  receiverDeclaredKg?: number;
  destination?: string;
  state: string;
  shinto?: { volumeBags: number; grade: string };
};

type EvidenceRow = {
  evidenceId: string;
  documentType: string;
  factSupported: string;
  issuer?: string;
  evidenceClass: string;
  status: string;
  lotCode?: string;
  uploaderLabel: string;
  uploaderActorId?: string;
  revokeReason?: string;
  verifications: Array<{ authority: string }>;
};

type IssueRow = Issue & { raisedByCapacity?: string; parties?: string[]; lotCodes?: string[] };

type FarmRow = {
  displayName: string;
  ownerLabel: string;
  units: Array<{ displayName: string; overlays: Array<{ id: string; dataset: string; result: string }> }>;
};

type AdminOverview = {
  users: unknown[];
  actors: unknown[];
  blockRules: Array<{ code: string; authorityTag: string; sourceRef?: string; scope?: string }>;
  models: Array<{ modelId: string; purpose: string; version: string; enabled: boolean }>;
  externalClaims: Array<{ claimId: string; source: string; field: string; claimedValue: number; ledgerValue: number | null; conflict: boolean }>;
  chain: { ok: boolean; checked: number };
};

type CredentialsView = {
  credentials: Array<{ credentialId: string; actorId: string; actorLabel: string; kind: string; status: string; missingCriteria: string[]; validTo: string }>;
  sanctions: Array<{ actorId: string; step: string; reason: string }>;
};

const openIssue = (i: IssueRow) => i.lifecycle !== "RESOLVED";
const awaitingVerification = (e: EvidenceRow) => e.status === "UPLOADED" || e.status === "SYSTEM_VALIDATED";

function ServiceWorkspace({
  role,
  sid,
  lots,
  pending,
}: {
  role: string;
  sid?: string;
  lots: Lot[];
  pending: Movement[];
}) {
  const copy = SERVICE_COPY[role] ?? {
    title: `${role} workspace`,
    who: "",
    does: [],
    never: "",
    links: [["/records", "Records"]] as Array<[string, string]>,
  };
  const [consignments, setConsignments] = useState<Consignment[] | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[] | null>(null);
  const [issues, setIssues] = useState<IssueRow[] | null>(null);
  const [farms, setFarms] = useState<FarmRow[] | null>(null);
  const [processed, setProcessed] = useState<Lot[] | null>(null);
  const [creds, setCreds] = useState<CredentialsView | null>(null);
  const [access, setAccess] = useState<Array<{ id: string; dataAccessed: string; purpose: string; at: string }> | null>(null);
  const [admin, setAdmin] = useState<AdminOverview | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sid) return;
    const optional = <T,>(p: Promise<T>) => p.catch(() => undefined);
    const jobs: Array<Promise<unknown>> = [
      optional(cachedApi<{ issues: IssueRow[] }>("/v1/issues", sid, (d) => setIssues(d.issues))),
    ];
    if (role === "Transporter" || role === "Driver" || role === "Regulator") {
      jobs.push(optional(cachedApi<{ consignments: Consignment[] }>("/v1/consignments", sid, (d) => setConsignments(d.consignments))));
    }
    if (role === "Verifier" || role === "Regulator") {
      jobs.push(optional(cachedApi<{ evidence: EvidenceRow[] }>("/v1/evidence", sid, (d) => setEvidence(d.evidence))));
    }
    if (role === "Verifier") {
      jobs.push(optional(cachedApi<{ farms: FarmRow[] }>("/v1/farms", sid, (d) => setFarms(d.farms))));
    }
    if (role === "FacilityOperator") {
      jobs.push(optional(cachedApi<{ lots: Lot[] }>("/v1/inspector/lots", sid, (d) => setProcessed(d.lots))));
    }
    if (role === "Regulator") {
      jobs.push(optional(cachedApi<CredentialsView>("/v1/credentials", sid, setCreds)));
      jobs.push(optional(cachedApi<{ access: Array<{ id: string; dataAccessed: string; purpose: string; at: string }> }>("/v1/regulator/access-log", sid, (d) => setAccess(d.access))));
    }
    if (role === "PlatformAdmin") {
      jobs.push(optional(cachedApi<AdminOverview>("/v1/admin/overview", sid, setAdmin)));
    }
    await Promise.all(jobs);
  }, [sid, role]);

  useEffect(() => {
    void load();
    const h = () => void load();
    window.addEventListener("ankuaru-refresh", h);
    return () => window.removeEventListener("ankuaru-refresh", h);
  }, [load]);

  async function act(id: string, path: string, body: unknown, label: string) {
    if (!sid) return;
    setBusyId(id);
    setError(null);
    try {
      await command(path, body, { sessionId: sid, label });
      await load();
      window.dispatchEvent(new Event("ankuaru-refresh"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command failed");
    } finally {
      setBusyId(null);
    }
  }

  const open = (issues ?? []).filter(openIssue);
  const inTransit = (consignments ?? []).filter((c) => c.state === "pending" || c.state === "receipt_overdue");
  const delivered = (consignments ?? []).filter((c) => !inTransit.includes(c));
  const queue = (evidence ?? []).filter(awaitingVerification);
  const decided = (evidence ?? []).filter((e) => !awaitingVerification(e));
  const overlays = (farms ?? []).flatMap((f) =>
    f.units.flatMap((u) => u.overlays.map((o) => ({ ...o, farm: f.displayName, owner: f.ownerLabel }))),
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{role} Dashboard</p>
        <h1 className="font-display text-2xl font-semibold">{copy.title}</h1>
      </div>

      {copy.who && (
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What this role is</CardTitle>
            <CardDescription>{copy.who}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <ul className="list-disc space-y-1 pl-5">
              {copy.does.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="text-muted-foreground">{copy.never}</p>
          </CardContent>
        </Card>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="flex flex-wrap gap-2">
        {copy.links.map(([href, label]) => (
          <Button key={href + label} size="sm" variant="outline" asChild>
            <Link href={href}>{label}</Link>
          </Button>
        ))}
      </div>

      {(role === "Transporter" || role === "Driver") && consignments && (
        <div className="grid gap-2 sm:grid-cols-3">
          <MiniStat label="In transit now" value={String(inTransit.length)} alert={inTransit.length > 0} />
          <MiniStat label="Delivered" value={String(delivered.length)} />
          <MiniStat
            label="Kg carried (all time)"
            value={formatKg((consignments ?? []).reduce((s, c) => s + c.senderDeclaredKg, 0))}
          />
        </div>
      )}

      {consignments && consignments.length > 0 && (
        <ServicePanel
          title={role === "Regulator" ? "Consignments on the road" : "Consignments you carry"}
          description="Custody stays with the sender until the receiver confirms — the carrier is recorded on the dispatch."
        >
          {[...inTransit, ...delivered].slice(0, role === "Regulator" ? 6 : 20).map((c) => (
            <Link
              key={c.movementId}
              href={`/inspector?lotId=${c.lotId}`}
              className="block rounded-md border px-3 py-2 hover:border-primary/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{c.lotDisplayCode ?? c.lotId.slice(0, 8)}</span>
                <span className="tabular-nums text-muted-foreground">{formatKg(c.senderDeclaredKg)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.fromLabel} → {c.toLabel}
                {c.destination ? ` · ${c.destination}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant={c.state === "pending" ? "default" : "secondary"}>
                  {c.state === "pending" ? "In transit" : c.state.replace(/_/g, " ")}
                </Badge>
                {c.form && <Badge variant="outline">{formatState(c.form)}</Badge>}
                {c.shinto && (
                  <Badge variant="outline">
                    Shinto · {c.shinto.volumeBags} bags · {c.shinto.grade}
                  </Badge>
                )}
              </div>
            </Link>
          ))}
        </ServicePanel>
      )}

      {evidence && (
        <ServicePanel
          title={`Evidence waiting for verification (${queue.length})`}
          description="Uploaded by chain actors and passed the system's format/date checks. Only an independent party can verify."
        >
          {queue.length === 0 && <p className="text-sm text-muted-foreground">Queue is empty.</p>}
          {queue.map((e) => (
            <div key={e.evidenceId} className="rounded-md border px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{formatState(e.documentType)}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.factSupported}
                    {e.lotCode ? ` · lot ${e.lotCode}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded by {e.uploaderLabel}
                    {e.issuer ? ` · issued by ${e.issuer}` : ""}
                  </p>
                </div>
                {role === "Verifier" && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      disabled={busyId === e.evidenceId}
                      onClick={() => void act(e.evidenceId, "/v1/commands/evidence-verify", { evidenceId: e.evidenceId }, "Verifying evidence…")}
                    >
                      <FileCheck2 className="h-4 w-4" />
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === e.evidenceId}
                      onClick={() =>
                        void act(
                          e.evidenceId,
                          "/v1/commands/evidence-revoke",
                          { evidenceId: e.evidenceId, effectiveDate: new Date().toISOString(), reason: "Rejected on review by verifier" },
                          "Rejecting evidence…",
                        )
                      }
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-1 flex gap-1.5">
                <Badge variant="outline">{formatState(e.evidenceClass)}</Badge>
                <Badge variant="secondary">{formatState(e.status)}</Badge>
              </div>
            </div>
          ))}
          {decided.length > 0 && (
            <div className="pt-2">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Decided</p>
              {decided.map((e) => (
                <div key={e.evidenceId} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                  <span>
                    {formatState(e.documentType)} <span className="text-muted-foreground">· {e.uploaderLabel}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Badge variant={e.status === "REVOKED" ? "danger" : "success"}>{formatState(e.status)}</Badge>
                    {e.revokeReason && <span className="text-xs text-muted-foreground">{e.revokeReason}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ServicePanel>
      )}

      {farms && overlays.length > 0 && (
        <ServicePanel
          title="Deforestation overlays"
          description="Mapped plots checked against forest-cover datasets (EUDR cut-off 31 Dec 2020)."
        >
          {overlays.map((o) => {
            const flagged = /loss of|possible/i.test(o.result);
            return (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                <span>
                  {o.farm} <span className="text-muted-foreground">· {o.owner}</span>
                </span>
                <span className={cn("text-xs", flagged ? "font-medium text-amber-700" : "text-muted-foreground")}>
                  {flagged && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                  {o.result}
                </span>
              </div>
            );
          })}
        </ServicePanel>
      )}

      {processed && (
        <ServicePanel
          title={`Lots processed here (${processed.length})`}
          description="Every processing event names this facility; the aggregator stays the owner."
        >
          {processed.slice(0, 12).map((l) => (
            <Link key={l.lotId} href={`/inspector?lotId=${l.lotId}`} className="flex justify-between border-b py-1.5 text-sm last:border-0 hover:text-primary">
              <span>
                {l.displayCode} <span className="text-muted-foreground">· {formatState(l.processingState)}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">
                {formatKg(l.canonicalMassKg)} · {l.status}
              </span>
            </Link>
          ))}
        </ServicePanel>
      )}

      {creds && (
        <ServicePanel title="Credentials & sanctions" description="Certificates of Competency issued by the regulator, and the sanction ladder.">
          {creds.sanctions.map((s) => (
            <div key={s.actorId + s.step} className="rounded-md border border-destructive/30 px-3 py-2 text-sm">
              <Badge variant="warn">{formatState(s.step)}</Badge>{" "}
              <span className="font-medium">{creds.credentials.find((c) => c.actorId === s.actorId)?.actorLabel ?? "Actor"}</span>
              <span className="text-muted-foreground"> — {s.reason}</span>
            </div>
          ))}
          {creds.credentials
            .filter((c) => c.status !== "ACTIVE" || Date.parse(c.validTo) - Date.now() < 7 * 86400000)
            .map((c) => (
              <div key={c.credentialId} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                <span>
                  {c.actorLabel} <span className="text-muted-foreground">· {formatState(c.kind)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.status === "ACTIVE"
                    ? `Expires ${new Date(c.validTo).toLocaleDateString()}`
                    : `${formatState(c.status)} — missing ${c.missingCriteria.map(formatState).join(", ")}`}
                </span>
              </div>
            ))}
          <p className="pt-1 text-xs text-muted-foreground">
            {creds.credentials.filter((c) => c.status === "ACTIVE").length} active credentials on the register.
          </p>
        </ServicePanel>
      )}

      {access && access.length > 0 && (
        <ServicePanel title="Your access log" description="Every read you make is recorded — who, what, why, when.">
          {access.slice(0, 6).map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
              <span>{a.dataAccessed}</span>
              <span className="text-xs text-muted-foreground">
                {a.purpose} · {new Date(a.at).toLocaleString()}
              </span>
            </div>
          ))}
        </ServicePanel>
      )}

      {admin && (
        <>
          <div className="grid gap-2 sm:grid-cols-4">
            <MiniStat label="Users" value={String(admin.users.length)} />
            <MiniStat label="Actors" value={String(admin.actors.length)} />
            <MiniStat label="Hash chain" value={admin.chain.ok ? `OK · ${admin.chain.checked} events` : "MISMATCH"} alert={!admin.chain.ok} />
            <MiniStat label="Data conflicts" value={String(admin.externalClaims.filter((c) => c.conflict).length)} alert={admin.externalClaims.some((c) => c.conflict)} />
          </div>
          <ServicePanel title="BLOCK-rule registry" description="Only legal requirements or official technical standards may block an action.">
            {admin.blockRules.map((r) => (
              <div key={r.code} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                <span className="font-mono text-xs">{r.code}</span>
                <span className="text-xs text-muted-foreground">
                  {formatState(r.authorityTag)}
                  {r.sourceRef ? ` · ${r.sourceRef}` : ""}
                </span>
              </div>
            ))}
          </ServicePanel>
          <ServicePanel title="Model registry" description="AI models are advisory only (FLAG suggestions) and cannot write canonical records.">
            {admin.models.map((m) => (
              <div key={m.modelId} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                <span>
                  <span className="font-mono text-xs">{m.modelId}</span> <span className="text-muted-foreground">v{m.version} · {m.purpose}</span>
                </span>
                {m.enabled ? (
                  <Badge>Enabled</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === m.modelId}
                    onClick={() => void act(m.modelId, "/v1/commands/model-enable", { modelId: m.modelId }, "Enabling model…")}
                  >
                    Enable
                  </Button>
                )}
              </div>
            ))}
          </ServicePanel>
          <ServicePanel title="External data claims" description="Weighbridge / port data is stored as a claim next to the ledger value — never overwritten.">
            {admin.externalClaims.map((c) => (
              <div key={c.claimId} className="flex flex-wrap items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0">
                <span>
                  {c.source} <span className="text-muted-foreground">· {c.field}</span>
                </span>
                <span className={cn("text-xs tabular-nums", c.conflict ? "font-medium text-amber-700" : "text-muted-foreground")}>
                  claimed {c.claimedValue} · ledger {c.ledgerValue ?? "—"} {c.conflict ? "· FLAG raised" : "· matches"}
                </span>
              </div>
            ))}
          </ServicePanel>
        </>
      )}

      {issues && (
        <ServicePanel
          title={`Open issues (${open.length})`}
          description={role === "Regulator" ? "All open issues on the ledger." : "Issues you raised or that involve lots you can see."}
        >
          {open.length === 0 && <p className="text-sm text-muted-foreground">No open issues.</p>}
          {open.slice(0, 8).map((i) => (
            <div key={i.issueId} className="rounded-md border px-3 py-2 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant={i.intervention === "BLOCK" ? "danger" : i.intervention === "WARN" ? "warn" : "outline"}>{i.intervention}</Badge>
                <Badge variant="secondary">{formatState(i.lifecycle)}</Badge>
                {i.raisedByCapacity && <Badge variant="outline">raised by {i.raisedByCapacity}</Badge>}
              </div>
              <p className="mt-1">{i.summary}</p>
            </div>
          ))}
          {open.length > 8 && (
            <Link href="/records?tab=issues" className="text-sm text-primary">
              All {open.length} issues →
            </Link>
          )}
        </ServicePanel>
      )}

      {(lots.length > 0 || pending.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">In your custody</CardTitle>
            <CardDescription>{lots.length} lot{lots.length === 1 ? "" : "s"} · {pending.length} pending receipt{pending.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {lots.map((l) => (
              <Link key={l.lotId} href={`/inspector?lotId=${l.lotId}`} className="block rounded-md border px-3 py-2 hover:border-primary/30">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{l.displayCode}</span>
                  <span className="tabular-nums text-muted-foreground">{formatKg(l.canonicalMassKg)}</span>
                </div>
                <div className="mt-1 flex gap-1.5">
                  <Badge variant="outline">{formatState(l.processingState)}</Badge>
                  <Badge variant="secondary">{l.status}</Badge>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ServicePanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function FormStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const TAG_STYLE: Record<string, string> = {
  Recorded: "text-emerald-700",
  Derived: "text-sky-700",
  Assessment: "text-amber-700",
  Missing: "text-destructive",
};

function Stat({ label, value, tag }: { label: string; value: string; tag?: keyof typeof TAG_STYLE }) {
  return (
    <div className="rounded-md border bg-background/50 px-3 py-2">
      <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {tag && <span className={cn("text-[10px] font-semibold uppercase tracking-wide", TAG_STYLE[tag])}>{tag}</span>}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Send;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" className="justify-start" onClick={onClick}>
      <Icon className="h-4 w-4" />
      {label}
    </Button>
  );
}

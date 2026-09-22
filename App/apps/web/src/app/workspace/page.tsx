"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Combine,
  GitBranch,
  PackagePlus,
  Send,
  Settings2,
  Split,
  UserPlus,
  XCircle,
} from "lucide-react";
import { AppShell, useSession } from "@/components/AppShell";
import { api } from "@/lib/api";
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

type Lot = {
  lotId: string;
  displayCode: string;
  processingState: string;
  processingRoute: string;
  canonicalMassKg: number;
  ownerActorId: string;
  custodianActorId: string;
  cropYear?: string;
  originStatus?: string;
  inTransit: boolean;
  status: string;
};

type Movement = {
  movementId: string;
  lotId: string;
  fromActorId: string;
  senderDeclaredKg: number;
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
  | "close";

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
  const [targets, setTargets] = useState<Array<{ actorId: string; displayName: string }>>([]);
  const [massKg, setMassKg] = useState("100");
  const [recvKg, setRecvKg] = useState("");
  const [toActorId, setToActorId] = useState("");
  const [childMasses, setChildMasses] = useState("50,50");
  const [rejectKg, setRejectKg] = useState("5");
  const [lossKg, setLossKg] = useState("10");
  const [outputState, setOutputState] = useState("dry_parchment");
  const [onboardName, setOnboardName] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [busy, setBusy] = useState(false);

  const sid = session?.sessionId;

  const refresh = useCallback(async () => {
    if (!sid) return;
    const inv = await api<{ lots: Lot[] }>("/v1/inventory", { sessionId: sid });
    const pend = await api<{ movements: Movement[] }>("/v1/pending-receipts", {
      sessionId: sid,
    });
    const tg = await api<{ targets: Array<{ actorId: string; displayName: string }> }>(
      "/v1/send-targets",
      { sessionId: sid },
    );
    setLots(inv.lots);
    setPending(pend.movements);
    setTargets(tg.targets);
    if (selected) {
      setSelected(inv.lots.find((l) => l.lotId === selected.lotId) ?? null);
    }
  }, [sid, selected?.lotId]);

  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message ?? e)));
  }, [sid]);

  async function run(path: string, body: unknown) {
    if (!sid) return;
    setError(null);
    setBusy(true);
    try {
      await api(path, { method: "POST", sessionId: sid, body: JSON.stringify(body) });
      setForm(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command failed");
    } finally {
      setBusy(false);
    }
  }

  const role = session?.actor.capacity;
  const canOnboard = role === "Exporter" || role === "Aggregator" || role === "Collector";
  const canIntake = role === "Collector" || role === "Aggregator" || role === "Exporter";

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{role} workspace</h1>
          <p className="text-sm text-muted-foreground">
            Inventory you hold, pending receipts, and lot actions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => { setForm("origin"); setSelected(null); }}>
            <PackagePlus className="h-4 w-4" />
            Add a lot
          </Button>
          {canIntake && (
            <Button size="sm" variant="outline" onClick={() => { setForm("intake"); setSelected(null); }}>
              Record intake
            </Button>
          )}
          {canOnboard && (
            <Button size="sm" variant="outline" onClick={() => { setForm("onboard"); setSelected(null); }}>
              <UserPlus className="h-4 w-4" />
              Onboard
            </Button>
          )}
        </div>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pending receipts</CardTitle>
                <CardDescription>Confirm physical arrival with your own weight.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pending.map((m) => (
                  <div key={m.movementId} className="rounded-md border bg-background/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">Inbound movement</span>
                      <Badge variant="warn">Sender {formatKg(m.senderDeclaredKg)}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor={`recv-${m.movementId}`}>Your observed kg</Label>
                      <Input
                        id={`recv-${m.movementId}`}
                        value={recvKg}
                        onChange={(e) => setRecvKg(e.target.value)}
                        placeholder={String(m.senderDeclaredKg)}
                      />
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run("/v1/commands/receive", {
                            movementId: m.movementId,
                            receiverDeclaredKg: Number(recvKg || m.senderDeclaredKg),
                          })
                        }
                      >
                        Confirm receipt
                      </Button>
                    </div>
                  </div>
                ))}
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
                  No lots in custody. Add an origin lot or confirm a receipt.
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
              {form === "origin" && "Create origin lot"}
              {form === "intake" && "Record intake"}
              {form === "onboard" && "Onboard party"}
              {form === "send" && "Send lot"}
              {form === "split" && "Split lot"}
              {form === "combine" && "Combine lots"}
              {form === "process" && "Process"}
              {form === "transfer" && "Transfer ownership"}
              {form === "close" && "Close lot"}
              {!form && selected && selected.displayCode}
              {!form && !selected && "Lot detail"}
            </CardTitle>
            <CardDescription>
              {!form && !selected && "Select a lot from inventory, or start Add a lot."}
              {!form && selected && `${formatState(selected.processingRoute)} · ${selected.status}`}
              {form === "intake" && "Digitize supplier coffee — custody stays with the farmer until send/receive."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selected && !form && (
              <p className="text-sm text-muted-foreground">Waiting for selection…</p>
            )}

            {form === "origin" && (
              <FormStack>
                <Field label="Mass (kg)">
                  <Input value={massKg} onChange={(e) => setMassKg(e.target.value)} />
                </Field>
                <Button disabled={busy} onClick={() => void run("/v1/commands/origin-lot", { massKg: Number(massKg) })}>
                  Create origin
                </Button>
              </FormStack>
            )}

            {form === "intake" && (
              <FormStack>
                <Field label="Supplier actor id">
                  <Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="UUID of sponsored supplier" />
                </Field>
                <Field label="Mass (kg)">
                  <Input value={massKg} onChange={(e) => setMassKg(e.target.value)} />
                </Field>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run("/v1/commands/intake-lot", {
                      supplierActorId: supplierId,
                      massKg: Number(massKg),
                    })
                  }
                >
                  Record intake
                </Button>
              </FormStack>
            )}

            {form === "onboard" && (
              <FormStack>
                <Field label="Display name">
                  <Input value={onboardName} onChange={(e) => setOnboardName(e.target.value)} />
                </Field>
                <Button
                  disabled={busy || !onboardName}
                  onClick={() => {
                    const actorType =
                      role === "Exporter" ? "akrabi" : role === "Aggregator" ? "collector" : "farmer";
                    void run("/v1/commands/onboard", {
                      actorType,
                      displayName: onboardName,
                      legalIdentityRef: `USER-${Date.now()}`,
                      facility:
                        role === "Exporter"
                          ? { capabilities: ["wet_milling", "washed_processing"] }
                          : undefined,
                    });
                  }}
                >
                  Create party
                </Button>
              </FormStack>
            )}

            {selected && !form && (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Form" value={formatState(selected.processingState)} />
                  <Stat label="Mass" value={formatKg(selected.canonicalMassKg)} />
                  <Stat label="Crop year" value={selected.cropYear ?? "Composition"} />
                  <Stat label="Origin" value={formatState(selected.originStatus ?? "—")} />
                </dl>
                {selected.inTransit ? (
                  <Alert variant="warn">In transit — actions locked until receipt is confirmed.</Alert>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <ActionBtn icon={Send} label="Send" onClick={() => setForm("send")} />
                    <ActionBtn icon={Split} label="Split" onClick={() => setForm("split")} />
                    <ActionBtn icon={Combine} label="Combine" onClick={() => setForm("combine")} />
                    <ActionBtn icon={Settings2} label="Process" onClick={() => setForm("process")} />
                    <ActionBtn icon={GitBranch} label="Transfer" onClick={() => setForm("transfer")} />
                    <ActionBtn icon={XCircle} label="Close" onClick={() => setForm("close")} />
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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={!toActorId || busy}
                    onClick={() =>
                      void run("/v1/commands/send", {
                        lotId: selected.lotId,
                        toActorId,
                        senderDeclaredKg: selected.canonicalMassKg,
                        destinationLocationId: "destination",
                      })
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
                      {[
                        "wet_parchment",
                        "dry_parchment",
                        "dried_cherry",
                        "green_natural",
                        "green_washed",
                      ].map((s) => (
                        <SelectItem key={s} value={s}>
                          {formatState(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Reject kg">
                  <Input value={rejectKg} onChange={(e) => setRejectKg(e.target.value)} />
                </Field>
                <Field label="Loss kg (entered, never auto-plugged)">
                  <Input value={lossKg} onChange={(e) => setLossKg(e.target.value)} />
                </Field>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run("/v1/commands/process", {
                        inputLotIds: [selected.lotId],
                        outputState,
                        rejectKg: Number(rejectKg),
                        lossKg: Number(lossKg),
                        moisturePct: 11.2,
                        byProducts: [{ kind: "husk", massKg: 0 }],
                      })
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
                      {targets.map((t) => (
                        <SelectItem key={t.actorId} value={t.actorId}>
                          {t.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={!toActorId || busy}
                    onClick={() =>
                      void run("/v1/commands/transfer-ownership", {
                        lotId: selected.lotId,
                        newOwnerActorId: toActorId,
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
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run("/v1/commands/terminal-dispose", {
                        lotId: selected.lotId,
                        reason: "fob_export",
                      })
                    }
                  >
                    Export at FOB
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run("/v1/commands/terminal-dispose", {
                        lotId: selected.lotId,
                        reason: "domestic_disposition",
                        impurityPct: 10,
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
          </CardContent>
        </Card>
      </div>
    </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/50 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize">{value}</dd>
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

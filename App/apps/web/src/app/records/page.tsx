"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell, useSession } from "@/components/AppShell";
import { api, cachedApi, command, type SessionInfo } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatKg, formatState } from "@/lib/utils";

const DISPOSITIONS = ["Resolved", "Explained", "Accepted", "Unresolved", "Escalated"];
const LIFECYCLES = ["INVESTIGATION", "CONFIRMED_EXCEPTION", "RESOLVED"];
const SANCTION_STEPS = [
  "written_warning",
  "certificate_suspension",
  "revocation_and_licence_cancellation",
  "seizure_and_judicial_referral",
];
const COC_CRITERIA = ["infrastructure", "personnel", "labAccess", "taxLegal"];
const COFFEE_STATES = ["cherry", "wet_parchment", "dry_parchment", "dried_cherry", "green_washed", "green_natural"];

type Tab =
  | "notifications"
  | "issues"
  | "obligations"
  | "evidence"
  | "contracts"
  | "credentials"
  | "compliance"
  | "reports"
  | "stock"
  | "farms"
  | "admin";

const TABS: Array<{ id: Tab; label: string; roles?: string[] }> = [
  { id: "notifications", label: "Notifications" },
  { id: "issues", label: "Issues" },
  { id: "obligations", label: "Obligations" },
  { id: "evidence", label: "Evidence" },
  { id: "contracts", label: "Contracts", roles: ["Exporter", "Aggregator", "Regulator", "PlatformAdmin"] },
  { id: "credentials", label: "Credentials" },
  { id: "compliance", label: "Compliance" },
  { id: "reports", label: "Reports" },
  { id: "stock", label: "Stock", roles: ["Aggregator", "Exporter", "Collector", "FacilityOperator", "Regulator", "PlatformAdmin"] },
  { id: "farms", label: "Farms" },
  { id: "admin", label: "Admin", roles: ["PlatformAdmin", "Regulator"] },
];

type Target = { actorId: string; displayName: string };
type VisibleLot = { lotId: string; displayCode: string; processingState: string; status: string };

export default function RecordsPage() {
  return (
    <AppShell>
      <RecordsInner />
    </AppShell>
  );
}

function RecordsInner() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("notifications");
  const [initialLot, setInitialLot] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lots, setLots] = useState<VisibleLot[]>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("tab") as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    setInitialLot(q.get("lotId") ?? "");
  }, []);

  useEffect(() => {
    if (!session) return;
    cachedApi<{ lots: VisibleLot[] }>("/v1/inspector/lots", session.sessionId, (r) => setLots(r.lots)).catch(
      () => undefined,
    );
  }, [session]);

  if (!session) return null;
  const role = session.actor.capacity;
  const tabs = TABS.filter((t) => !t.roles || t.roles.includes(role));

  const run = async (path: string, body: unknown, ok: string) => {
    setError(null);
    setNotice(null);
    try {
      const r = await command(path, body, { sessionId: session.sessionId, label: ok });
      setNotice(r.queued ? "Offline — queued for sync." : ok);
      window.dispatchEvent(new Event("ankuaru-refresh"));
      return r.result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      window.dispatchEvent(new Event("ankuaru-refresh"));
      return undefined;
    }
  };

  const ctx: Ctx = { session, role, run, lots, initialLot, setError };

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{role} Dashboard</p>
        <h1 className="font-display text-2xl font-semibold">Records</h1>
        <p className="text-sm text-muted-foreground">
          Issues, obligations, evidence, compliance and reports for the lots and parties you can see.
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert>{notice}</Alert>}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="flex h-auto flex-wrap gap-1 bg-transparent p-0">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="rounded-none bg-transparent px-3 data-[state=active]:border-b-2 data-[state=active]:border-foreground"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="notifications" className="mt-4"><Notifications ctx={ctx} /></TabsContent>
        <TabsContent value="issues" className="mt-4"><Issues ctx={ctx} /></TabsContent>
        <TabsContent value="obligations" className="mt-4"><Obligations ctx={ctx} /></TabsContent>
        <TabsContent value="evidence" className="mt-4"><Evidence ctx={ctx} /></TabsContent>
        <TabsContent value="contracts" className="mt-4"><Contracts ctx={ctx} /></TabsContent>
        <TabsContent value="credentials" className="mt-4"><Credentials ctx={ctx} /></TabsContent>
        <TabsContent value="compliance" className="mt-4"><Compliance ctx={ctx} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><Reports ctx={ctx} /></TabsContent>
        <TabsContent value="stock" className="mt-4"><Stock ctx={ctx} /></TabsContent>
        <TabsContent value="farms" className="mt-4"><Farms ctx={ctx} /></TabsContent>
        <TabsContent value="admin" className="mt-4"><Admin ctx={ctx} /></TabsContent>
      </Tabs>
    </div>
  );
}

type Ctx = {
  session: SessionInfo;
  role: string;
  run: (path: string, body: unknown, ok: string) => Promise<unknown>;
  lots: VisibleLot[];
  initialLot: string;
  setError: (e: string | null) => void;
};

function useData<T>(ctx: Ctx, path: string | null): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const load = useCallback(() => {
    if (!path) return;
    cachedApi<T>(path, ctx.session.sessionId, setData).catch((e) =>
      ctx.setError(e instanceof Error ? e.message : String(e)),
    );
  }, [path, ctx.session.sessionId]);
  useEffect(() => {
    load();
    window.addEventListener("ankuaru-refresh", load);
    return () => window.removeEventListener("ankuaru-refresh", load);
  }, [load]);
  return [data, load];
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-md border bg-background/60 p-3 text-sm", className)}>{children}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{text}</p>;
}

function Pick({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function interventionVariant(i: string) {
  return i === "BLOCK" ? "danger" : i === "WARN" ? "warn" : "outline";
}

/* ---------------- Module 11 notifications ---------------- */

function Notifications({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{ notifications: Array<{ id: string; category: string; title: string; body: string }> }>(
    ctx,
    "/v1/notifications",
  );
  return (
    <Section title="Action notifications" description="Only items that need you to act: receipts, discrepancies, conflicts, expiring credentials, invalid evidence, approvals, escalations.">
      {!data?.notifications.length && <Empty text="Nothing needs your action." />}
      {data?.notifications.map((n) => (
        <Row key={n.id}>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{formatState(n.category)}</Badge>
            <span className="font-medium">{n.title}</span>
          </div>
          <p className="mt-1 text-muted-foreground">{n.body}</p>
        </Row>
      ))}
    </Section>
  );
}

/* ---------------- Module 09 issues ---------------- */

type IssueRow = {
  issueId: string;
  lifecycle: string;
  intervention: string;
  authorityTag?: string;
  summary: string;
  disposition?: string;
  lotCodes: string[];
  parties: string[];
  ruleRef?: string;
  stage?: string;
  referenceRange?: { minPct: number; maxPct: number; version: string; sourceRef: string };
};

function Issues({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{ issues: IssueRow[] }>(ctx, "/v1/issues");
  const [edit, setEdit] = useState<Record<string, { to: string; disposition: string; note: string; ruleRef: string }>>({});
  const [showResolved, setShowResolved] = useState(false);
  const issues = (data?.issues ?? []).filter((i) => showResolved || i.lifecycle !== "RESOLVED");
  return (
    <Section
      title="Issues"
      description="Anomalies move through Investigation → Confirmed exception → Resolved. Only the accountable party or oversight can resolve; attempts by others are logged."
    >
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Show resolved
      </label>
      {!issues.length && <Empty text="No open issues." />}
      {issues.map((i) => {
        const e = edit[i.issueId] ?? { to: "", disposition: "", note: "", ruleRef: "" };
        const set = (p: Partial<typeof e>) => setEdit((all) => ({ ...all, [i.issueId]: { ...e, ...p } }));
        return (
          <Row key={i.issueId}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={interventionVariant(i.intervention)}>{i.intervention}</Badge>
              <Badge variant="secondary">{formatState(i.lifecycle)}</Badge>
              {i.authorityTag && <Badge variant="outline">{formatState(i.authorityTag)}</Badge>}
              {i.disposition && <Badge variant="success">{i.disposition}</Badge>}
              <span className="font-medium">{i.summary}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {i.lotCodes.length > 0 && <>Lots {i.lotCodes.join(", ")} · </>}
              Parties {i.parties.join(", ") || "—"}
              {i.ruleRef && <> · Rule {i.ruleRef}</>}
              {i.referenceRange && (
                <>
                  {" "}· Reference {i.referenceRange.minPct}–{i.referenceRange.maxPct}% ({i.referenceRange.version}, {i.referenceRange.sourceRef})
                </>
              )}
            </p>
            {i.lifecycle !== "RESOLVED" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_1.4fr_auto]">
                <Pick value={e.to} onChange={(v) => set({ to: v })} placeholder="Move to…" options={LIFECYCLES.map((l) => [l, formatState(l)])} />
                <Pick value={e.disposition} onChange={(v) => set({ disposition: v })} placeholder="Disposition" options={DISPOSITIONS.map((d) => [d, d])} />
                <Input placeholder="Rule reference" value={e.ruleRef} onChange={(ev) => set({ ruleRef: ev.target.value })} />
                <Input placeholder="Note" value={e.note} onChange={(ev) => set({ note: ev.target.value })} />
                <Button
                  size="sm"
                  disabled={!e.to}
                  onClick={() =>
                    void ctx.run(
                      "/v1/commands/issue-transition",
                      {
                        issueId: i.issueId,
                        to: e.to,
                        disposition: e.disposition || undefined,
                        ruleRef: e.ruleRef || undefined,
                        note: e.note || undefined,
                      },
                      "Issue updated.",
                    )
                  }
                >
                  Apply
                </Button>
              </div>
            )}
          </Row>
        );
      })}
    </Section>
  );
}

/* ---------------- Module 09 obligations ---------------- */

function Obligations({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    obligations: Array<{
      obligationId: string;
      kind: string;
      status: string;
      deadline?: string;
      accountableLabel: string;
      accountableActorId: string;
      history: Array<{ toActorId: string; reason: string }>;
    }>;
    handoverTargets: Target[];
  }>(ctx, "/v1/obligations");
  const [edit, setEdit] = useState<Record<string, { note: string; to: string; reason: string }>>({});
  return (
    <Section title="Obligations" description="Every obligation has one accountable party. Handover names the next party and the reason; closure needs a note.">
      {!data?.obligations.length && <Empty text="No obligations." />}
      {data?.obligations.map((o) => {
        const e = edit[o.obligationId] ?? { note: "", to: "", reason: "" };
        const set = (p: Partial<typeof e>) => setEdit((all) => ({ ...all, [o.obligationId]: { ...e, ...p } }));
        const mine = o.accountableActorId === ctx.session.actor.actorId;
        return (
          <Row key={o.obligationId}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={o.status === "closed" ? "success" : o.status === "escalated" ? "danger" : "warn"}>{o.status}</Badge>
              <span className="font-medium">{formatState(o.kind)}</span>
              <span className="text-muted-foreground">· accountable: {o.accountableLabel}</span>
              {o.deadline && <span className="text-xs text-muted-foreground">· due {new Date(o.deadline).toLocaleString()}</span>}
            </div>
            {o.history.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Handovers: {o.history.slice(1).map((h) => h.reason).join(" → ")}
              </p>
            )}
            {mine && o.status !== "closed" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="flex gap-2">
                  <Input placeholder="Closure note" value={e.note} onChange={(ev) => set({ note: ev.target.value })} />
                  <Button size="sm" disabled={!e.note.trim()} onClick={() => void ctx.run("/v1/commands/obligation-close", { obligationId: o.obligationId, note: e.note }, "Obligation closed.")}>
                    Close
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Pick value={e.to} onChange={(v) => set({ to: v })} placeholder="Hand over to" options={(data?.handoverTargets ?? []).map((t) => [t.actorId, t.displayName])} />
                  <Input placeholder="Reason" value={e.reason} onChange={(ev) => set({ reason: ev.target.value })} />
                  <Button size="sm" variant="outline" disabled={!e.to || !e.reason.trim()} onClick={() => void ctx.run("/v1/commands/obligation-handover", { obligationId: o.obligationId, toActorId: e.to, reason: e.reason }, "Obligation handed over.")}>
                    Hand over
                  </Button>
                </div>
              </div>
            )}
          </Row>
        );
      })}
    </Section>
  );
}

/* ---------------- Module 07 evidence ---------------- */

function Evidence({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    evidence: Array<{
      evidenceId: string;
      documentType: string;
      factSupported: string;
      evidenceClass: string;
      status: string;
      issuer?: string;
      sha256?: string;
      lotCode?: string;
      uploaderLabel: string;
      uploaderActorId?: string;
      validTo?: string;
      verifications?: Array<{ byActorId: string; authority?: string }>;
    }>;
  }>(ctx, "/v1/evidence");
  const [revoke, setRevoke] = useState<Record<string, string>>({});
  const canVerify = ["Verifier", "Regulator"].includes(ctx.role);
  return (
    <Section title="Evidence" description="Uploaded documents never verify themselves. An independent verifier or authority must confirm them; the uploader cannot.">
      {!data?.evidence.length && <Empty text="No evidence visible to you." />}
      {data?.evidence.map((e) => (
        <Row key={e.evidenceId}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={e.status === "VERIFIED" ? "success" : e.status === "REVOKED" || e.status === "EXPIRED" ? "danger" : "warn"}>{e.status}</Badge>
            <Badge variant="outline">{formatState(e.evidenceClass)}</Badge>
            <span className="font-medium">{e.documentType}</span>
            <span className="text-muted-foreground">· supports {e.factSupported}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {e.lotCode && <>Lot {e.lotCode} · </>}Uploaded by {e.uploaderLabel}
            {e.issuer && <> · Issuer {e.issuer}</>}
            {e.validTo && <> · Valid to {new Date(e.validTo).toLocaleDateString()}</>}
            {e.sha256 && <> · sha256 {e.sha256.slice(0, 12)}…</>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {canVerify && e.status !== "VERIFIED" && e.status !== "REVOKED" && (
              <Button size="sm" onClick={() => void ctx.run("/v1/commands/evidence-verify", { evidenceId: e.evidenceId, authority: ctx.session.actor.displayName }, "Evidence verified.")}>
                Verify
              </Button>
            )}
            {e.status !== "REVOKED" && (e.uploaderActorId === ctx.session.actor.actorId || canVerify || ctx.role === "PlatformAdmin") && (
              <>
                <Input className="max-w-xs" placeholder="Revocation reason" value={revoke[e.evidenceId] ?? ""} onChange={(ev) => setRevoke((r) => ({ ...r, [e.evidenceId]: ev.target.value }))} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!revoke[e.evidenceId]?.trim()}
                  onClick={() => void ctx.run("/v1/commands/evidence-revoke", { evidenceId: e.evidenceId, effectiveDate: new Date().toISOString(), reason: revoke[e.evidenceId] }, "Evidence revoked.")}
                >
                  Revoke
                </Button>
              </>
            )}
          </div>
        </Row>
      ))}
    </Section>
  );
}

/* ---------------- Module 05 contracts ---------------- */

function Contracts({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    contracts: Array<{
      contractId: string;
      supplierLabel: string;
      exporterLabel: string;
      coffeeType: string;
      quantityKg: number;
      grade: string;
      priceEtbPerKg: number;
      executionPeriod: string;
      paymentTerms: string;
      deliverySite: string;
      registrationRef: string;
    }>;
  }>(ctx, "/v1/contracts");
  const [suppliers] = useData<{ targets: Target[] }>(ctx, ctx.role === "Exporter" ? "/v1/intake-targets" : null);
  const [f, setF] = useState<Record<string, string>>({
    coffeeType: "washed",
    grade: "G1",
    quantityKg: "1000",
    priceEtbPerKg: "",
    executionPeriod: "",
    paymentTerms: "",
    deliverySite: "",
    transportCostAlloc: "supplier",
    registrationRef: "",
    supplierActorId: "",
  });
  return (
    <div className="space-y-4">
      <Section title="Direct-linkage contracts" description="Registered contracts with all mandatory terms. Both parties need an active Certificate of Competency.">
        {!data?.contracts.length && <Empty text="No contracts." />}
        {data?.contracts.map((c) => (
          <Row key={c.contractId}>
            <div className="font-medium">
              {c.supplierLabel} → {c.exporterLabel}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatState(c.coffeeType)} {c.grade} · {formatKg(c.quantityKg)} · {c.priceEtbPerKg} ETB/kg · {c.executionPeriod} · {c.paymentTerms} · delivery {c.deliverySite} · reg {c.registrationRef} · id {c.contractId.slice(0, 8)}
            </p>
          </Row>
        ))}
      </Section>
      {ctx.role === "Exporter" && (
        <Section title="Register a contract">
          <div className="grid gap-2 sm:grid-cols-3">
            <F label="Supplier">
              <Pick value={f.supplierActorId} onChange={(v) => setF({ ...f, supplierActorId: v })} placeholder="Aggregator" options={(suppliers?.targets ?? []).map((t) => [t.actorId, t.displayName])} />
            </F>
            {[
              ["coffeeType", "Coffee type"],
              ["grade", "Grade"],
              ["quantityKg", "Quantity (kg)"],
              ["priceEtbPerKg", "Price (ETB/kg)"],
              ["executionPeriod", "Execution period"],
              ["paymentTerms", "Payment terms"],
              ["deliverySite", "Delivery site"],
              ["transportCostAlloc", "Transport cost borne by"],
              ["registrationRef", "Registration ref."],
            ].map(([k, l]) => (
              <F key={k} label={l}>
                <Input value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
              </F>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!f.supplierActorId}
            onClick={() =>
              void ctx.run(
                "/v1/commands/contract",
                {
                  ...f,
                  exporterActorId: ctx.session.actor.actorId,
                  quantityKg: Number(f.quantityKg),
                  priceEtbPerKg: Number(f.priceEtbPerKg),
                },
                "Contract registered.",
              )
            }
          >
            Register
          </Button>
        </Section>
      )}
    </div>
  );
}

/* ---------------- Modules 02/10 credentials & sanctions ---------------- */

function Credentials({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    credentials: Array<{ credentialId: string; actorLabel: string; kind: string; status: string; validTo: string; missingCriteria: string[] }>;
    sanctions: Array<{ actorId: string; step: string; reason: string; at?: string }>;
  }>(ctx, "/v1/credentials");
  const [admin] = useData<{ actors: Array<{ actorId: string; displayName: string; actorType: string }> }>(
    ctx,
    ctx.role === "Regulator" ? "/v1/admin/overview" : null,
  );
  const [cred, setCred] = useState({ actorId: "", validTo: "", kind: "federal_coc" });
  const [crit, setCrit] = useState<Record<string, boolean>>(Object.fromEntries(COC_CRITERIA.map((c) => [c, true])));
  const [sanc, setSanc] = useState({ actorId: "", step: "", reason: "" });
  const actorOpts = (admin?.actors ?? []).map((a) => [a.actorId, `${a.displayName} (${a.actorType})`] as [string, string]);
  const soon = Date.now() + 30 * 86400000;
  return (
    <div className="space-y-4">
      <Section title="Certificates of Competency" description="Exporters and aggregators need an active CoC. Expiry is notified 30 days ahead.">
        {!data?.credentials.length && <Empty text="No credentials." />}
        {data?.credentials.map((c) => (
          <Row key={c.credentialId}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={c.status === "ACTIVE" ? (Date.parse(c.validTo) < soon ? "warn" : "success") : "danger"}>{c.status}</Badge>
              <span className="font-medium">{c.actorLabel}</span>
              <span className="text-muted-foreground">· {formatState(c.kind)} · valid to {new Date(c.validTo).toLocaleDateString()}</span>
            </div>
            {c.missingCriteria.length > 0 && <p className="text-xs text-destructive">Missing: {c.missingCriteria.join(", ")}</p>}
          </Row>
        ))}
      </Section>
      <Section title="Sanctions" description="Sanctions follow the ladder in order. Certificate suspension or worse blocks the actor from writing.">
        {!data?.sanctions.length && <Empty text="No sanctions recorded." />}
        {data?.sanctions.map((s, i) => (
          <Row key={i}>
            <Badge variant="danger">{formatState(s.step)}</Badge> <span className="ml-1">{s.reason}</span>
          </Row>
        ))}
      </Section>
      {ctx.role === "Regulator" && (
        <>
          <Section title="Issue credential">
            <div className="grid gap-2 sm:grid-cols-3">
              <F label="Actor"><Pick value={cred.actorId} onChange={(v) => setCred({ ...cred, actorId: v })} placeholder="Select actor" options={actorOpts} /></F>
              <F label="Kind"><Pick value={cred.kind} onChange={(v) => setCred({ ...cred, kind: v })} placeholder="Kind" options={[["federal_coc", "Federal CoC"], ["regional_coc", "Regional CoC"]]} /></F>
              <F label="Valid to"><Input type="date" value={cred.validTo} onChange={(e) => setCred({ ...cred, validTo: e.target.value })} /></F>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              {COC_CRITERIA.map((c) => (
                <label key={c} className="flex items-center gap-1">
                  <input type="checkbox" checked={crit[c]} onChange={(e) => setCrit({ ...crit, [c]: e.target.checked })} /> {c}
                </label>
              ))}
            </div>
            <Button
              size="sm"
              disabled={!cred.actorId || !cred.validTo}
              onClick={() =>
                void ctx.run(
                  "/v1/commands/credential",
                  { actorId: cred.actorId, kind: cred.kind, criteria: crit, validFrom: new Date().toISOString(), validTo: new Date(cred.validTo).toISOString() },
                  "Credential issued.",
                )
              }
            >
              Issue
            </Button>
          </Section>
          <Section title="Record sanction">
            <div className="grid gap-2 sm:grid-cols-3">
              <F label="Actor"><Pick value={sanc.actorId} onChange={(v) => setSanc({ ...sanc, actorId: v })} placeholder="Select actor" options={actorOpts} /></F>
              <F label="Step"><Pick value={sanc.step} onChange={(v) => setSanc({ ...sanc, step: v })} placeholder="Ladder step" options={SANCTION_STEPS.map((s) => [s, formatState(s)])} /></F>
              <F label="Reason"><Input value={sanc.reason} onChange={(e) => setSanc({ ...sanc, reason: e.target.value })} /></F>
            </div>
            <Button size="sm" variant="destructive" disabled={!sanc.actorId || !sanc.step || !sanc.reason.trim()} onClick={() => void ctx.run("/v1/commands/sanction", sanc, "Sanction recorded.")}>
              Record sanction
            </Button>
          </Section>
        </>
      )}
    </div>
  );
}

/* ---------------- Module 08 compliance ---------------- */

type Assessment = {
  assessmentId: string;
  lotId: string;
  lotCode?: string;
  frameworkCode: string;
  frameworkVersion: string;
  market: string;
  status: string;
  evaluatedAtEventTime: string;
  results: Array<{ code: string; title: string; status: string; basis: string; composition?: { complete: number; missing: number } }>;
};

function Compliance({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    assessments: Assessment[];
    submissions: Array<{ submissionId: string; assessmentId: string; recipient: string; status: string; externalRef?: string; rejectionReason?: string }>;
  }>(ctx, "/v1/compliance");
  const [lotId, setLotId] = useState(ctx.initialLot);
  const [recipient, setRecipient] = useState("EU TRACES");
  const [outcome, setOutcome] = useState<Record<string, { ref: string; reason: string }>>({});
  const greens = ctx.lots.filter((l) => l.processingState.startsWith("green"));
  return (
    <div className="space-y-4">
      <Section title="Assess a lot" description="Each requirement gets its own status and basis. A lot with any incomplete requirement cannot be submitted.">
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[16rem]">
            <Pick value={lotId} onChange={setLotId} placeholder="Select lot" options={(greens.length ? greens : ctx.lots).map((l) => [l.lotId, `${l.displayCode} · ${formatState(l.processingState)}`])} />
          </div>
          <Button size="sm" disabled={!lotId} onClick={() => void ctx.run("/v1/commands/compliance-assess", { lotId, frameworkCode: "EUDR", market: "EU" }, "Assessment recorded.")}>
            Assess against EUDR (EU)
          </Button>
        </div>
      </Section>
      <Section title="Assessments">
        {!data?.assessments.length && <Empty text="No assessments yet." />}
        {data?.assessments
          .slice()
          .reverse()
          .map((a) => {
            const subs = data.submissions.filter((s) => s.assessmentId === a.assessmentId);
            return (
              <Row key={a.assessmentId}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={a.status === "READY" ? "success" : a.status === "EXCEPTION" ? "danger" : "warn"}>{formatState(a.status)}</Badge>
                  <span className="font-medium">{a.lotCode ?? a.lotId.slice(0, 8)}</span>
                  <span className="text-muted-foreground">
                    · {a.frameworkCode} {a.frameworkVersion} · {a.market} · evaluated at {new Date(a.evaluatedAtEventTime).toLocaleDateString()}
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {a.results.map((r) => (
                    <li key={r.code} className="flex gap-2">
                      <Badge variant={r.status === "READY" ? "success" : r.status === "NOT_APPLICABLE" ? "outline" : "warn"}>{formatState(r.status)}</Badge>
                      <span>
                        <strong>{r.code}</strong> {r.title} — {r.basis}
                        {r.composition && ` (${r.composition.complete} complete / ${r.composition.missing} missing farmers)`}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input className="max-w-[12rem]" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                  <Button size="sm" variant="outline" onClick={() => void ctx.run("/v1/commands/compliance-submit", { assessmentId: a.assessmentId, recipient }, "Submitted.")}>
                    Submit
                  </Button>
                </div>
                {subs.map((s) => {
                  const o = outcome[s.submissionId] ?? { ref: "", reason: "" };
                  return (
                    <div key={s.submissionId} className="mt-2 rounded border px-2 py-1.5 text-xs">
                      <Badge variant={s.status === "ACKNOWLEDGED" ? "success" : s.status === "REVIEW_REQUIRED" ? "danger" : "warn"}>{formatState(s.status)}</Badge>{" "}
                      to {s.recipient}
                      {s.externalRef && ` · ref ${s.externalRef}`}
                      {s.rejectionReason && ` · rejected: ${s.rejectionReason}`}
                      {s.status === "READY" && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Input className="max-w-[10rem]" placeholder="External ref" value={o.ref} onChange={(e) => setOutcome({ ...outcome, [s.submissionId]: { ...o, ref: e.target.value } })} />
                          <Button size="sm" variant="outline" onClick={() => void ctx.run("/v1/commands/compliance-outcome", { submissionId: s.submissionId, outcome: "ACKNOWLEDGED", externalRef: o.ref || undefined }, "Outcome recorded.")}>
                            Acknowledged
                          </Button>
                          <Input className="max-w-[12rem]" placeholder="Rejection reason" value={o.reason} onChange={(e) => setOutcome({ ...outcome, [s.submissionId]: { ...o, reason: e.target.value } })} />
                          <Button size="sm" variant="outline" disabled={!o.reason.trim()} onClick={() => void ctx.run("/v1/commands/compliance-outcome", { submissionId: s.submissionId, outcome: "REJECTED", reason: o.reason }, "Outcome recorded.")}>
                            Rejected
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Row>
            );
          })}
      </Section>
    </div>
  );
}

/* ---------------- Module 12 reports ---------------- */

function Reports({ ctx }: { ctx: Ctx }) {
  const [lotId, setLotId] = useState(ctx.initialLot);
  useEffect(() => {
    if (!lotId && ctx.initialLot) setLotId(ctx.initialLot);
  }, [ctx.initialLot, lotId]);
  const [data] = useData<{
    reports: Array<{ reportId: string; version: number; generatedAt: string; contentHash: string; superseded: boolean; fingerprintOk: boolean }>;
  }>(ctx, lotId ? `/v1/reports?lotId=${lotId}` : null);
  const download = (name: string, obj: unknown) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const code = ctx.lots.find((l) => l.lotId === lotId)?.displayCode ?? "lot";
  return (
    <Section title="Lot reports" description="Reports are generated from ledger events, fingerprinted, and never edited. Regenerating creates a new version that supersedes the old one.">
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[16rem]">
          <Pick value={lotId} onChange={setLotId} placeholder="Select lot" options={ctx.lots.map((l) => [l.lotId, `${l.displayCode} · ${formatState(l.processingState)}`])} />
        </div>
        <Button
          size="sm"
          disabled={!lotId}
          onClick={async () => {
            const r = (await ctx.run("/v1/commands/report", { lotId }, "Report generated.")) as { report?: unknown } | undefined;
            if (r?.report) download(`${code}-report.json`, r.report);
          }}
        >
          Generate report
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!lotId}
          onClick={async () => {
            const r = await ctx.run("/v1/commands/audit-package", { lotId }, "Audit package generated.");
            if (r) download(`${code}-audit-package.json`, r);
          }}
        >
          Audit package
        </Button>
      </div>
      {lotId && !data?.reports.length && <Empty text="No reports for this lot yet." />}
      {data?.reports.map((r) => (
        <Row key={r.reportId}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={r.superseded ? "outline" : "success"}>v{r.version}{r.superseded ? " · superseded" : " · current"}</Badge>
            <Badge variant={r.fingerprintOk ? "success" : "danger"}>{r.fingerprintOk ? "Fingerprint OK" : "Fingerprint mismatch"}</Badge>
            <span className="text-xs text-muted-foreground">{new Date(r.generatedAt).toLocaleString()} · sha256 {r.contentHash.slice(0, 16)}…</span>
          </div>
        </Row>
      ))}
    </Section>
  );
}

/* ---------------- Module 03 stock ---------------- */

function Stock({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    stocktakes: Array<{ id: string; coffeeState: string; theoreticalKg: number; physicalKg: number; varianceKg: number; at: string }>;
  }>(ctx, "/v1/stocktakes");
  const [state, setState] = useState("");
  const [kg, setKg] = useState("");
  return (
    <Section title="Stocktake" description="Physical count against the ledger balance. Variance beyond max(50 kg, 2%) raises an issue; three shortfalls in a row are flagged as a pattern.">
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[12rem]">
          <Pick value={state} onChange={setState} placeholder="Coffee form" options={COFFEE_STATES.map((s) => [s, formatState(s)])} />
        </div>
        <Input className="max-w-[10rem]" placeholder="Physical kg" value={kg} onChange={(e) => setKg(e.target.value)} />
        <Button size="sm" disabled={!state || !kg} onClick={() => void ctx.run("/v1/commands/stocktake", { coffeeState: state, physicalKg: Number(kg) }, "Stocktake recorded.")}>
          Record count
        </Button>
      </div>
      {data?.stocktakes
        .slice()
        .reverse()
        .map((s) => (
          <Row key={s.id}>
            <span className="font-medium">{formatState(s.coffeeState)}</span>{" "}
            <span className="text-muted-foreground">
              · ledger {formatKg(s.theoreticalKg)} · counted {formatKg(s.physicalKg)} · variance{" "}
              <span className={s.varianceKg < 0 ? "text-destructive" : ""}>{formatKg(s.varianceKg)}</span> · {new Date(s.at).toLocaleString()}
            </span>
          </Row>
        ))}
    </Section>
  );
}

/* ---------------- Module 06 farms ---------------- */

function Farms({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    farms: Array<{
      farmId: string;
      displayName: string;
      ownerLabel: string;
      pointLat?: number;
      pointLng?: number;
      units: Array<{
        farmUnitId: string;
        displayName: string;
        polygonPending: boolean;
        geometries: Array<{ id: string; version: number; anomalyFlags: string[]; usedInCompliance: boolean }>;
        overlays: Array<{ id: string; dataset: string; result?: string }>;
      }>;
    }>;
  }>(ctx, "/v1/farms");
  return (
    <Section title="Farms & geometry" description="Geometry is versioned. A plot over 4 ha needs a polygon; a point is enough at or below 4 ha.">
      {!data?.farms.length && <Empty text="No farms in your scope." />}
      {data?.farms.map((f) => (
        <Row key={f.farmId}>
          <div className="font-medium">
            {f.displayName} <span className="text-muted-foreground">· {f.ownerLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {f.pointLat != null ? `Point ${f.pointLat.toFixed(4)}, ${f.pointLng?.toFixed(4)}` : "No point recorded"}
          </p>
          {f.units.map((u) => (
            <div key={u.farmUnitId} className="mt-1 text-xs">
              {u.displayName}:{" "}
              {u.geometries.length
                ? u.geometries.map((g) => (
                    <Badge key={g.id} variant={g.anomalyFlags.length ? "warn" : "success"} className="mr-1">
                      v{g.version}{g.anomalyFlags.length ? ` · ${g.anomalyFlags.join(", ")}` : ""}{g.usedInCompliance ? " · used" : ""}
                    </Badge>
                  ))
                : <Badge variant="outline">{u.polygonPending ? "Polygon pending" : "No geometry"}</Badge>}
              {u.overlays.map((o) => (
                <Badge key={o.id} variant="outline" className="mr-1">{o.dataset}{o.result ? `: ${o.result}` : ""}</Badge>
              ))}
            </div>
          ))}
        </Row>
      ))}
    </Section>
  );
}

/* ---------------- Modules 01/14/15/16 administration ---------------- */

function Admin({ ctx }: { ctx: Ctx }) {
  const [data] = useData<{
    users: Array<{ userId: string; displayName: string; status: string; actors: string[] }>;
    actors: Array<{ actorId: string; displayName: string; actorType: string; status: string; capacities: string[] }>;
    blockRules: Array<{ code: string; authorityTag?: string; sourceRef?: string; owner?: string }>;
    models: Array<{ modelId: string; purpose: string; version: string; enabled: boolean }>;
    externalClaims: Array<{ claimId: string; source: string; field: string; claimedValue: number; ledgerValue: number | null; conflict: boolean }>;
    quarantines: Array<{ id: string; quantityKg: number; deadline: string; resolved: boolean }>;
    chain: { ok: boolean; checked: number; legacyUnverifiable: number; mismatches: unknown[]; sequenceGaps: unknown[]; duplicateEventIds: unknown[] };
  }>(ctx, "/v1/admin/overview");
  const [access] = useData<{ access: Array<{ id: string; dataAccessed: string; purpose: string; action: string; at: string }> }>(ctx, "/v1/regulator/access-log");
  const [recovery, setRecovery] = useState<{ ok: boolean; exceptions: unknown[] } | null>(null);
  const [stepUp, setStepUp] = useState("");
  const [rule, setRule] = useState({ code: "", authorityTag: "LEGAL_REQUIREMENT", sourceRef: "", owner: "", approvalRef: "" });
  const [key, setKey] = useState<{ actorId: string; label: string; issued?: string }>({ actorId: "", label: "" });
  const admin = ctx.role === "PlatformAdmin";
  if (!data) return <Empty text="Loading…" />;
  return (
    <div className="space-y-4">
      <Section title="Hash chain" description="Every event is chained to the previous one. Legacy events recorded before schema 1.1 are counted separately, not treated as tampered.">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={data.chain.ok ? "success" : "danger"}>{data.chain.ok ? "Intact" : "Broken"}</Badge>
          {data.chain.checked} verified · {data.chain.mismatches.length} mismatches · {data.chain.sequenceGaps.length} gaps ·{" "}
          {data.chain.duplicateEventIds.length} duplicate ids · {data.chain.legacyUnverifiable} legacy
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              api<{ ok: boolean; exceptions: unknown[] }>("/v1/inspector/recovery", { sessionId: ctx.session.sessionId })
                .then(setRecovery)
                .catch((e) => ctx.setError(String(e.message ?? e)))
            }
          >
            Run recovery verification
          </Button>
          {recovery && (
            <Badge variant={recovery.ok ? "success" : "danger"}>
              {recovery.ok ? "Projections match replay" : `${recovery.exceptions.length} exception(s)`}
            </Badge>
          )}
        </div>
      </Section>

      <Section title="Users" description="One named user per person. Revoking a user needs step-up: re-enter your organisation's legal identity reference.">
        {admin && (
          <Input className="max-w-xs" placeholder="Step-up: your legal identity ref" value={stepUp} onChange={(e) => setStepUp(e.target.value)} />
        )}
        {data.users.map((u) => (
          <Row key={u.userId} className="flex flex-wrap items-center gap-2">
            <Badge variant={u.status === "active" ? "success" : "danger"}>{u.status}</Badge>
            <span className="font-medium">{u.displayName}</span>
            <span className="text-xs text-muted-foreground">{u.actors.join(", ")}</span>
            {admin && u.status === "active" && (
              <Button size="sm" variant="outline" className="ml-auto" disabled={!stepUp} onClick={() => void ctx.run("/v1/commands/revoke-user", { userId: u.userId, stepUpProof: stepUp }, "User revoked.")}>
                Revoke
              </Button>
            )}
          </Row>
        ))}
      </Section>

      <Section title="Block rules" description="Only legal requirements or official authority rules may block. Adding one needs step-up.">
        {data.blockRules.map((r) => (
          <Row key={r.code}>
            <span className="font-mono text-xs">{r.code}</span> <Badge variant="outline">{formatState(r.authorityTag ?? "")}</Badge>{" "}
            <span className="text-xs text-muted-foreground">{r.sourceRef} {r.owner && `· owner ${r.owner}`}</span>
          </Row>
        ))}
        {admin && (
          <div className="grid gap-2 sm:grid-cols-6">
            <Input placeholder="Rule code" value={rule.code} onChange={(e) => setRule({ ...rule, code: e.target.value })} />
            <Pick value={rule.authorityTag} onChange={(v) => setRule({ ...rule, authorityTag: v })} placeholder="Authority" options={[["LEGAL_REQUIREMENT", "Legal requirement"], ["OFFICIAL_TECHNICAL_STANDARD", "Official technical standard"], ["INDUSTRY_BENCHMARK", "Industry benchmark (will be refused)"], ["ANKUARU_CONTROL_RULE", "Ankuaru control (will be refused)"]]} />
            <Input placeholder="Source ref" value={rule.sourceRef} onChange={(e) => setRule({ ...rule, sourceRef: e.target.value })} />
            <Input placeholder="Owner" value={rule.owner} onChange={(e) => setRule({ ...rule, owner: e.target.value })} />
            <Input placeholder="Approval ref" value={rule.approvalRef} onChange={(e) => setRule({ ...rule, approvalRef: e.target.value })} />
            <Button size="sm" disabled={!rule.code || !stepUp} onClick={() => void ctx.run("/v1/commands/block-rule", { ...rule, stepUpProof: stepUp }, "Block rule registered.")}>
              Add rule
            </Button>
          </div>
        )}
      </Section>

      <Section title="Model registry" description="No model may write to the ledger. Models must be registered with a full card before they are enabled.">
        {!data.models.length && <Empty text="No models registered." />}
        {data.models.map((m) => (
          <Row key={m.modelId} className="flex items-center gap-2">
            <Badge variant={m.enabled ? "success" : "outline"}>{m.enabled ? "Enabled" : "Disabled"}</Badge>
            {m.modelId} v{m.version} · {m.purpose}
            {admin && !m.enabled && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => void ctx.run("/v1/commands/model-enable", { modelId: m.modelId }, "Model enabled.")}>
                Enable
              </Button>
            )}
          </Row>
        ))}
      </Section>

      <Section title="External claims & quarantine" description="Claims from outside systems never overwrite ledger facts; conflicts are recorded and quarantined for a named party.">
        {data.externalClaims.map((c) => (
          <Row key={c.claimId}>
            <Badge variant={c.conflict ? "warn" : "success"}>{c.conflict ? "Conflict" : "Consistent"}</Badge> {c.source} · {c.field}: claimed {c.claimedValue}, ledger {c.ledgerValue ?? "—"}
          </Row>
        ))}
        {data.quarantines.map((q) => (
          <Row key={q.id}>
            <Badge variant={q.resolved ? "success" : "warn"}>{q.resolved ? "Resolved" : "Quarantined"}</Badge> {formatKg(q.quantityKg)} · deadline {new Date(q.deadline).toLocaleString()}
          </Row>
        ))}
        {!data.externalClaims.length && !data.quarantines.length && <Empty text="None." />}
      </Section>

      {admin && (
        <Section title="Integration keys" description="An integration acts as a named user bound to one actor; it cannot act as an AI model.">
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[16rem]">
              <Pick value={key.actorId} onChange={(v) => setKey({ ...key, actorId: v })} placeholder="Bind to actor" options={data.actors.map((a) => [a.actorId, `${a.displayName} (${a.actorType})`])} />
            </div>
            <Input className="max-w-xs" placeholder="Integration label" value={key.label} onChange={(e) => setKey({ ...key, label: e.target.value })} />
            <Button
              size="sm"
              disabled={!key.actorId || !key.label}
              onClick={() =>
                api<{ apiKey: string }>("/v1/integrations/keys", {
                  method: "POST",
                  sessionId: ctx.session.sessionId,
                  body: JSON.stringify({ actorId: key.actorId, label: key.label }),
                })
                  .then((r) => setKey({ ...key, issued: r.apiKey }))
                  .catch((e) => ctx.setError(String(e.message ?? e)))
              }
            >
              Issue key
            </Button>
          </div>
          {key.issued && <p className="break-all font-mono text-xs">x-session-id: {key.issued}</p>}
        </Section>
      )}

      <Section title="Regulator access log" description="Every regulator read is recorded with what was viewed and why.">
        {!access?.access.length && <Empty text="No regulator access recorded." />}
        {access?.access.slice(0, 50).map((a) => (
          <Row key={a.id} className="text-xs">
            {new Date(a.at).toLocaleString()} · {a.action} · {a.dataAccessed} · purpose {a.purpose}
          </Row>
        ))}
      </Section>
    </div>
  );
}

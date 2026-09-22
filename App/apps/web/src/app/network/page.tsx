"use client";

import { useEffect, useState } from "react";
import { AppShell, useSession } from "@/components/AppShell";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatState } from "@/lib/utils";

type Node = {
  actorId: string;
  actorType: string;
  displayName: string;
  displayLabel: string;
  children?: Node[];
};

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api<{ self: Node; children: Node[] }>("/v1/network", {
      sessionId: session.sessionId,
    })
      .then(setTree)
      .catch((e) => setError(String(e.message ?? e)));
  }, [session]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-semibold">My Network</h1>
        <p className="text-sm text-muted-foreground">
          Parties you sponsor. Mid/downstream roles see numbered privacy labels.
        </p>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {tree && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tree.self?.displayName}</CardTitle>
            <CardDescription className="capitalize">
              {formatState(tree.self?.actorType ?? "")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tree.children.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sponsored parties yet.</p>
            ) : (
              <ul className="space-y-3">
                {tree.children.map((c) => (
                  <li key={c.actorId} className="rounded-md border bg-background/50 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.displayLabel}</span>
                      <Badge variant="outline" className="capitalize">
                        {formatState(c.actorType)}
                      </Badge>
                    </div>
                    {c.children && c.children.length > 0 && (
                      <ul className="mt-2 space-y-1.5 border-l pl-3">
                        {c.children.map((gc) => (
                          <li key={gc.actorId} className="flex flex-wrap items-center gap-2 text-sm">
                            <span>{gc.displayLabel}</span>
                            <Badge variant="secondary" className="capitalize">
                              {formatState(gc.actorType)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

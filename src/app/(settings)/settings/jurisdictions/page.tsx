import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { listJurisdictions } from "@/domains/jurisdictions";

export const dynamic = "force-dynamic";

export default async function JurisdictionsPage() {
  const jurisdictions = await listJurisdictions(getDb());

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Jurisdictions</h1>
        <p className="text-muted-foreground text-sm">
          Country-level config bundles. Read-only in v0.1 — configs are managed in code.
        </p>
      </header>

      {jurisdictions.length === 0 ? (
        <p className="text-muted-foreground">
          None loaded yet. Run <code>pnpm db:seed</code> to install the prefilled configs.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {jurisdictions.map((j) => (
            <Card key={j.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  {j.name} <Badge variant="outline">{j.code}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <details>
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                    Show config JSON
                  </summary>
                  <pre className="bg-muted mt-3 max-h-96 overflow-auto rounded p-3 text-xs">
                    {JSON.stringify(j.config, null, 2)}
                  </pre>
                </details>
                {j.freeformContextMd ? (
                  <details className="mt-3">
                    <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">
                      Show freeform context
                    </summary>
                    <pre className="bg-muted mt-3 max-h-96 overflow-auto rounded p-3 text-xs whitespace-pre-wrap">
                      {j.freeformContextMd}
                    </pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

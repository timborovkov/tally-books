import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    href: "/settings/entities",
    title: "Entities",
    description:
      "Legal entities and the personal pseudo-entity that everything in Tally points at.",
  },
  {
    href: "/settings/persons",
    title: "Persons",
    description: "Real humans linked to entities — board members, shareholders, contractors.",
  },
  {
    href: "/settings/jurisdictions",
    title: "Jurisdictions",
    description: "Country-level config bundles (tax rules, filing schedules, payout options).",
  },
] as const;

export default function SettingsIndexPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Configure entities, persons, and jurisdictions. More sections land in later milestones.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <Card className="hover:border-foreground/20 h-full transition-colors">
              <CardHeader>
                <CardTitle className="group-hover:underline">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">{s.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

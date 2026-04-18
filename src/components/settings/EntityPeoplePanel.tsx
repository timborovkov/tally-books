import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EntityPersonLink, Person } from "@/db/schema";

const ROLES = ["board", "ceo", "shareholder", "cfo", "owner", "officer"];

interface EntityPeoplePanelProps {
  entityId: string;
  links: (EntityPersonLink & { person: Person })[];
  persons: Person[];
  linkAction: (formData: FormData) => void | Promise<void>;
  unlinkAction: (formData: FormData) => void | Promise<void>;
}

export function EntityPeoplePanel({
  entityId,
  links,
  persons,
  linkAction,
  unlinkAction,
}: EntityPeoplePanelProps) {
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-lg font-semibold">People</h2>
        <p className="text-muted-foreground text-sm">
          Board members, officers, shareholders. Closing a link preserves history.
        </p>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Share %</TableHead>
            <TableHead>Since</TableHead>
            <TableHead className="w-px" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                No active links.
              </TableCell>
            </TableRow>
          ) : (
            links.map((link) => (
              <TableRow key={link.id}>
                <TableCell>{link.person.legalName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{link.role}</Badge>
                </TableCell>
                <TableCell>{link.sharePercent ?? "—"}</TableCell>
                <TableCell>{link.validFrom.toISOString().slice(0, 10)}</TableCell>
                <TableCell>
                  <form action={unlinkAction}>
                    <input type="hidden" name="linkId" value={link.id} />
                    <input type="hidden" name="entityId" value={entityId} />
                    <Button type="submit" variant="ghost" size="sm">
                      End link
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {persons.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No persons in the system yet — create one under Persons first.
        </p>
      ) : (
        <form
          action={linkAction}
          className="grid grid-cols-4 items-end gap-3 rounded-md border p-4"
        >
          <input type="hidden" name="entityId" value={entityId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link_personId">Person</Label>
            <Select name="personId" defaultValue={persons[0]?.id ?? ""}>
              <SelectTrigger id="link_personId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {persons.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.legalName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link_role">Role</Label>
            <Select name="role" defaultValue={ROLES[0]}>
              <SelectTrigger id="link_role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link_sharePercent">Share %</Label>
            <Input
              id="link_sharePercent"
              name="sharePercent"
              type="number"
              step="0.0001"
              min="0"
              max="100"
              placeholder="e.g. 100"
            />
          </div>
          <Button type="submit">Add link</Button>
        </form>
      )}
    </section>
  );
}

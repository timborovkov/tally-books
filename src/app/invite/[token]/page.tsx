export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { Logo } from "@/components/logo";
import { findUsableInvite, tryParseInviteScope } from "@/lib/iam/invites";

import { AcceptInviteForm } from "./AcceptInviteForm";

// The raw token only flows in via the URL param and is re-read on the
// client via useParams — not passed as a prop — so it doesn't end up in
// the RSC payload's serialized prop tree or in React DevTools state.
export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await findUsableInvite(token);
  if (!invite) notFound();

  // Validate scope jsonb before serializing into the RSC payload. A
  // corrupted row (manual SQL edit, bad migration, external write)
  // would otherwise reach AcceptInviteForm and render undefined
  // .access / .resourceType. We treat malformed as unusable here —
  // tryParseInviteScope logs the invite id server-side so an admin
  // can investigate; the invitee sees the same not-found page as an
  // expired/revoked token instead of a broken form.
  const scope = tryParseInviteScope(invite.scope, invite.id);
  if (!scope) notFound();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6 sm:p-12">
      <Logo type="full" orientation="vertical" size="lg" align="center" as="h2" />
      <AcceptInviteForm email={invite.email} scope={scope} />
    </main>
  );
}

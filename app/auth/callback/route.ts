import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabase = await createClient();

  if (code) await supabase.auth.exchangeCodeForSession(code);

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (user) {
    const invitationId = user.user_metadata?.organization_invitation_id as string | undefined;
    if (invitationId) {
      const admin = createAdminClient();
      const { data: invite } = await admin
        .from("organization_invitations")
        .select("id,organization_id,email,role,status")
        .eq("id", invitationId)
        .maybeSingle();

      if (invite && invite.email.toLowerCase() === (user.email || "").toLowerCase() && invite.status !== "revoked") {
        await admin.from("organization_members").upsert({
          organization_id: invite.organization_id,
          user_id: user.id,
          role: invite.role,
          is_active: true,
        }, { onConflict: "organization_id,user_id" });
        await admin.from("organization_invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", invite.id);
      }
    }
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}

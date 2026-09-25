import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgRole } from "@/lib/types";

const allowedRoles: OrgRole[] = ["admin", "coordinator", "team_lead", "canvasser", "viewer"];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const organizationId = String(body.organizationId || "");
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "canvasser") as OrgRole;
    if (!organizationId || !email || !allowedRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid invitation." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json({ error: "Owner or Admin access is required." }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: invitation, error: inviteRowError } = await admin
      .from("organization_invitations")
      .upsert({
        organization_id: organizationId,
        email,
        role,
        status: "pending",
        invited_by: authData.user.id,
      }, { onConflict: "organization_id,email" })
      .select("id")
      .single();
    if (inviteRowError) throw inviteRowError;

    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/auth/callback`;
    const { error: authInviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { organization_invitation_id: invitation.id },
    });
    if (authInviteError) {
      await admin.from("organization_invitations").update({ status: "failed" }).eq("id", invitation.id);
      throw authInviteError;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invitation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  try {
    const supabase = await createClient();

    const { data, error } =
      await supabase.auth.getUser();

    if (error || !data.user) {
      return NextResponse.json(
        {
          error:
            "Your invitation session is not available.",
        },
        { status: 401 }
      );
    }

    const user = data.user;

    const invitationId =
      user.user_metadata
        ?.organization_invitation_id as
        | string
        | undefined;

    if (!invitationId) {
      return NextResponse.json(
        {
          error:
            "This account does not contain an organization invitation.",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const {
      data: invite,
      error: inviteError,
    } = await admin
      .from("organization_invitations")
      .select(
        "id,organization_id,email,role,status"
      )
      .eq("id", invitationId)
      .maybeSingle();

    if (inviteError) {
      throw inviteError;
    }

    if (!invite) {
      return NextResponse.json(
        { error: "Invitation not found." },
        { status: 404 }
      );
    }

    if (invite.status === "revoked") {
      return NextResponse.json(
        {
          error:
            "This invitation has been revoked.",
        },
        { status: 403 }
      );
    }

    if (
      invite.email.toLowerCase() !==
      (user.email || "").toLowerCase()
    ) {
      return NextResponse.json(
        {
          error:
            "This invitation belongs to another email address.",
        },
        { status: 403 }
      );
    }

    const { error: membershipError } =
      await admin
        .from("organization_members")
        .upsert(
          {
            organization_id:
              invite.organization_id,
            user_id: user.id,
            role: invite.role,
            is_active: true,
          },
          {
            onConflict:
              "organization_id,user_id",
          }
        );

    if (membershipError) {
      throw membershipError;
    }

    const { error: statusError } =
      await admin
        .from("organization_invitations")
        .update({
          status: "accepted",
          accepted_at:
            new Date().toISOString(),
        })
        .eq("id", invite.id);

    if (statusError) {
      throw statusError;
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not accept invitation.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

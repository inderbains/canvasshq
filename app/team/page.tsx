import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { InviteMemberForm } from "@/components/invite-member-form";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export default async function TeamPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/onboarding");
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_member_directory")
    .select("user_id,email,role,is_active,created_at")
    .eq("organization_id", workspace.organizationId)
    .order("created_at", { ascending: true });

  const { data: invites } = await supabase
    .from("organization_invitations")
    .select("id,email,role,status,created_at")
    .eq("organization_id", workspace.organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const canInvite = ["owner", "admin"].includes(workspace.role);

  return (
    <AppShell workspace={workspace} title="Team & access">
      <div className="page-head"><div><h1>People & permissions</h1><p>Invite users and control what each person can do inside this organization.</p></div></div>
      <section className="grid-2">
        <div className="card panel">
          <h2>Members</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Email</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {(members ?? []).map((m) => <tr key={m.user_id}><td>{m.email ?? "User"}</td><td>{String(m.role).replace("_", " ")}</td><td>{m.is_active ? "Active" : "Disabled"}</td></tr>)}
                {(members ?? []).length === 0 ? <tr><td colSpan={3} className="muted">No members yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {(invites ?? []).length ? <><h2 style={{ marginTop: 24 }}>Pending invitations</h2><div className="list">{invites!.map(i => <div className="list-row" key={i.id}><span>{i.email}</span><span className="role-pill">{String(i.role).replace("_", " ")}</span></div>)}</div></> : null}
        </div>
        <div className="card panel">
          <h2>Invite a person</h2>
          <p style={{ marginBottom: 16 }}>The invitee receives their own login. Never share campaign passwords.</p>
          {canInvite ? <InviteMemberForm organizationId={workspace.organizationId} /> : <div className="alert">Only Owners and Admins can invite people.</div>}
        </div>
      </section>
    </AppShell>
  );
}

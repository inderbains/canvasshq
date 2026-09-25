import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StatCard } from "@/components/stat-card";
import { createClient } from "@/lib/supabase/server";
import { getWorkspace } from "@/lib/workspace";

export default async function DashboardPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/onboarding");
  const supabase = await createClient();

  const campaignId = workspace.campaignId;
  const addressCount = campaignId
    ? await supabase.from("addresses").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId)
    : { count: 0 };
  const visitCount = campaignId
    ? await supabase.from("canvass_visits").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId)
    : { count: 0 };
  const memberCount = await supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", workspace.organizationId).eq("is_active", true);
  const territoryCount = campaignId
    ? await supabase.from("territories").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId)
    : { count: 0 };

  const addresses = addressCount.count ?? 0;
  const visits = visitCount.count ?? 0;
  const progress = addresses ? Math.min(100, Math.round((visits / addresses) * 100)) : 0;

  return (
    <AppShell workspace={workspace} title="Dashboard">
      <div className="page-head">
        <div><h1>{workspace.campaignName ?? "Campaign"}</h1><p>{workspace.districtName ?? "Add a district"} • live operational overview</p></div>
      </div>
      <section className="stats">
        <StatCard label="Addresses loaded" value={addresses.toLocaleString()} foot="Public civic address points" />
        <StatCard label="Canvass records" value={visits.toLocaleString()} foot="Recorded visits" />
        <StatCard label="Active team" value={memberCount.count ?? 0} foot="Members with access" />
        <StatCard label="Territories" value={territoryCount.count ?? 0} foot="Assignment areas" />
      </section>
      <section className="grid-2">
        <div className="card panel">
          <h2>Campaign progress</h2>
          <p>Progress is based on recorded visits versus imported addresses.</p>
          <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          <div className="small muted">{progress}% recorded</div>
        </div>
        <div className="card panel">
          <h2>Next setup steps</h2>
          <div className="list">
            <div className="list-row"><span>1. Import Surrey North addresses</span><a className="btn secondary" href="/map">Open map</a></div>
            <div className="list-row"><span>2. Invite your team</span><a className="btn secondary" href="/team">Invite</a></div>
            <div className="list-row"><span>3. Create territories</span><a className="btn secondary" href="/territories">Create</a></div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

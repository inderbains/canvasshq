import { createWorkspace } from "./actions";

export default function OnboardingPage() {
  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <div className="brand"><span className="brand-badge">C</span> CanvassHQ</div>
        <h1>Create your workspace</h1>
        <p>The person creating this workspace becomes its Owner. This is the same flow your future customers will use.</p>
        <form className="form" action={createWorkspace}>
          <div className="field"><label>Organization / campaign group</label><input name="organizationName" required placeholder="Example Campaign" /></div>
          <div className="field"><label>Campaign name</label><input name="campaignName" required defaultValue="2026 Canvass" /></div>
          <div className="field"><label>District / riding</label><input name="districtName" required defaultValue="Surrey North" /></div>
          <div className="field"><label>Election date (optional)</label><input name="electionDate" type="date" /></div>
          <button className="btn">Create owner workspace</button>
        </form>
      </section>
    </main>
  );
}

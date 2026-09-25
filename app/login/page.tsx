import { LoginForm } from "@/components/login-form";
import { isSupabaseConfigured } from "@/lib/env";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <div className="brand"><span className="brand-badge">C</span> CanvassHQ</div>
        <h1>Door-to-door canvassing, organized.</h1>
        <p>Each customer gets a private organization. Owners invite admins, coordinators, team leads and canvassers.</p>
        {!configured ? (
          <div className="alert error">Supabase is not configured yet. Copy <b>.env.example</b> to <b>.env.local</b>, add your keys, then restart the app.</div>
        ) : (
          <LoginForm />
        )}
      </section>
    </main>
  );
}

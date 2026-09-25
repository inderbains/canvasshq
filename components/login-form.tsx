"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const supabase = createClient();

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });

    if (result.error) {
      setMessage(result.error.message);
      setLoading(false);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("Account created. Check your email if confirmation is enabled.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label>Email</label>
        <input name="email" type="email" required placeholder="you@example.com" />
      </div>
      <div className="field">
        <label>Password</label>
        <input name="password" type="password" minLength={8} required />
      </div>
      {message ? <div className={message.includes("created") ? "alert success" : "alert error"}>{message}</div> : null}
      <button className="btn" disabled={loading}>{loading ? "Working…" : mode === "login" ? "Sign in" : "Create account"}</button>
      <button className="btn secondary" type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}> 
        {mode === "login" ? "Create a new owner account" : "I already have an account"}
      </button>
    </form>
  );
}

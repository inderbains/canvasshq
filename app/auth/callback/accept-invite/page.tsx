"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    "Opening your invitation…"
  );

  useEffect(() => {
    async function establishSession() {
      const supabase = createClient();

      const hash = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );

      const errorDescription =
        hash.get("error_description");

      if (errorDescription) {
        setMessage(
          decodeURIComponent(
            errorDescription.replace(/\+/g, " ")
          )
        );
        setLoading(false);
        return;
      }

      const accessToken =
        hash.get("access_token");

      const refreshToken =
        hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } =
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

        if (error) {
          setMessage(error.message);
          setLoading(false);
          return;
        }

        window.history.replaceState(
          {},
          "",
          window.location.pathname
        );
      } else {
        const { data } =
          await supabase.auth.getSession();

        if (!data.session) {
          setMessage(
            "This invitation is invalid or has expired. Ask the campaign owner to send a new invitation."
          );
          setLoading(false);
          return;
        }
      }

      setReady(true);
      setLoading(false);

      setMessage(
        "Invitation verified. Create your password to join."
      );
    }

    establishSession();
  }, []);

  async function finishInvite(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    const form =
      new FormData(event.currentTarget);

    const password = String(
      form.get("password") || ""
    );

    const confirmPassword = String(
      form.get("confirmPassword") || ""
    );

    if (password.length < 8) {
      setMessage(
        "Password must be at least 8 characters."
      );
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const { error: passwordError } =
      await supabase.auth.updateUser({
        password,
      });

    if (passwordError) {
      setMessage(passwordError.message);
      setLoading(false);
      return;
    }

    const response = await fetch(
      "/api/invitations/accept",
      {
        method: "POST",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      setMessage(
        data.error ||
          "Could not accept invitation."
      );
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <main className="auth-wrap">
      <section className="card auth-card">
        <div className="brand">
          <span className="brand-badge">C</span>
          CanvassHQ
        </div>

        <h1>Join your campaign workspace</h1>

        <p>{message}</p>

        {ready ? (
          <form
            className="form"
            onSubmit={finishInvite}
          >
            <div className="field">
              <label>Create password</label>

              <input
                name="password"
                type="password"
                minLength={8}
                required
              />
            </div>

            <div className="field">
              <label>Confirm password</label>

              <input
                name="confirmPassword"
                type="password"
                minLength={8}
                required
              />
            </div>

            <button
              className="btn"
              disabled={loading}
            >
              {loading
                ? "Joining…"
                : "Accept invitation"}
            </button>
          </form>
        ) : null}

        {!ready && !loading ? (
          <a
            className="btn secondary"
            href="/"
          >
            Back to sign in
          </a>
        ) : null}
      </section>
    </main>
  );
}

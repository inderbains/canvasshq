"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AcceptInvitePage() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(
    "Checking your invitation..."
  );

  useEffect(() => {
    async function prepareInvitation() {
      const supabase = createClient();

      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );

      const errorDescription =
        hashParams.get("error_description");

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
        hashParams.get("access_token");

      const refreshToken =
        hashParams.get("refresh_token");

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

        // Remove tokens from the browser URL after
        // Supabase has stored the session.
        window.history.replaceState(
          {},
          "",
          window.location.pathname
        );
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setMessage(
            "This invitation is invalid or has expired. Ask the owner to send you a new invitation."
          );
          setLoading(false);
          return;
        }
      }

      setReady(true);
      setLoading(false);
      setMessage(
        "Invitation verified. Create your password to join the workspace."
      );
    }

    prepareInvitation();
  }, []);

  async function acceptInvitation(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    const formData =
      new FormData(event.currentTarget);

    const password = String(
      formData.get("password") || ""
    );

    const confirmPassword = String(
      formData.get("confirmPassword") || ""
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
          "Could not accept the invitation."
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
          <span className="brand-badge">
            C
          </span>

          CanvassHQ
        </div>

        <h1>Accept invitation</h1>

        <p className="muted">
          {message}
        </p>

        {ready ? (
          <form
            className="form"
            onSubmit={acceptInvitation}
          >
            <div className="field">
              <label>
                Create password
              </label>

              <input
                type="password"
                name="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="field">
              <label>
                Confirm password
              </label>

              <input
                type="password"
                name="confirmPassword"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="btn"
              disabled={loading}
            >
              {loading
                ? "Joining..."
                : "Accept invitation"}
            </button>
          </form>
        ) : null}

        {!ready && !loading ? (
          <a
            href="/"
            className="btn secondary"
          >
            Back to sign in
          </a>
        ) : null}
      </section>
    </main>
  );
}

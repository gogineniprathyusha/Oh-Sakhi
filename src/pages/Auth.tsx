import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.ts";
import { withoutAuthCallback } from "../lib/auth-callback.ts";
import type { AuthMode } from "../features/events/types.ts";
import { LegalLinks } from "../components/LegalLinks.tsx";
import { Bloom } from "../components/Bloom.tsx";
export function Auth({
  mode,
  setMode,
  back,
  notify,
  initialError = "",
}: {
  initialError?: string;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  back: () => void;
  notify: (message: string) => void;
}) {
  const [notice, setNotice] = useState(initialError),
    [busy, setBusy] = useState(false);
  const [isError, setIsError] = useState(Boolean(initialError));
  const titles = {
    login: "Welcome back",
    signup: "Find your people",
    reset: "Reset your password",
    update: "Choose a new password",
  };
  const buttons = {
    login: "Log in",
    signup: "Create my account",
    reset: "Send reset link",
    update: "Save new password",
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setNotice("");
    setIsError(false);
    const form = new FormData(event.currentTarget),
      email = String(form.get("email") ?? "").trim(),
      password = String(form.get("password") ?? "");
    try {
      if (mode === "login") {
        const result = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (result.error) throw result.error;
        back();
        notify("Welcome to Her Hobby Hour!");
      }
      if (mode === "signup") {
        const name = String(form.get("name") ?? "").trim();
        if (!name) throw Error("Please enter a display name.");
        const result = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name },
            emailRedirectTo: location.origin,
          },
        });
        if (result.error) throw result.error;
        if (result.data.session) {
          back();
        } else {
          setMode("login");
          setNotice(
            "Account created! Check your inbox to verify your email before logging in.",
          );
        }
      }
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/?recovery=1`,
        });
        if (error) throw error;
        setMode("login");
        setNotice(
          "If an account exists for that email, a reset link has been sent.",
        );
      }
      if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        history.replaceState(
          null,
          "",
          withoutAuthCallback(new URL(location.href)),
        );
        back();
        notify("Password updated");
      }
    } catch (error) {
      setIsError(true);
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to complete authentication.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <div className="eyebrow">HER HOBBY HOUR · OH SAKHI! · RICHMOND</div>
        <h1>
          her hobby <i>hour.</i>
        </h1>
        <p>
          Oh Sakhi! Your hour, your circle. Find experiences, make new friends,
          and belong.
        </p>
        <Bloom className="auth-bloom" />
      </div>
      <main className="auth-panel">
        <div className="auth-card">
          <button className="link-btn auth-back" onClick={back} disabled={busy}>
            ← Back to experiences
          </button>
          <br />
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h2>{titles[mode]}</h2>
          <p
            className="section-intro"
            role={notice ? (isError ? "alert" : "status") : undefined}
          >
            {notice || "Find experiences, make new friends, and belong."}
          </p>
          <form onSubmit={submit}>
            {mode === "signup" && (
              <div className="field">
                <label htmlFor="signup-name">Display name</label>
                <input
                  id="signup-name"
                  name="name"
                  required
                  maxLength={60}
                  autoComplete="nickname"
                />
              </div>
            )}
            {mode !== "update" && (
              <div className="field">
                <label htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>
            )}
            {mode !== "reset" && (
              <div className="field">
                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  placeholder="At least 8 characters"
                />
              </div>
            )}
            <button className="btn full-width" type="submit" disabled={busy}>
              {busy ? "Please wait…" : buttons[mode]}
            </button>
          </form>
          <div className="auth-links">
            {mode === "login" ? (
              <>
                <button
                  className="link-btn"
                  disabled={busy}
                  onClick={() => {
                    setNotice("");
                    setIsError(false);
                    setMode("signup");
                  }}
                >
                  Create account
                </button>
                <button
                  className="link-btn"
                  disabled={busy}
                  onClick={() => {
                    setNotice("");
                    setIsError(false);
                    setMode("reset");
                  }}
                >
                  Forgot password?
                </button>
              </>
            ) : (
              mode !== "update" && (
                <button
                  className="link-btn"
                  disabled={busy}
                  onClick={() => {
                    setNotice("");
                    setIsError(false);
                    setMode("login");
                  }}
                >
                  Back to login
                </button>
              )
            )}
          </div>
          <p className="small muted">
            By joining, you agree to be respectful of other members. Do not
            share sensitive information in public meetup descriptions.
          </p>
          <LegalLinks />
        </div>
      </main>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase.ts";
import { withoutAuthCallback } from "../lib/auth-callback.ts";
import type { AuthMode } from "../features/events/types.ts";
import { LegalLinks } from "../components/LegalLinks.tsx";
import { AuthBenefits } from "../components/AuthBenefits.tsx";
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
  const subtitles = {
    login: "Sign in to discover your next favorite experience.",
    signup:
      "Create your space for meaningful friendships, hobbies, and beautiful experiences.",
    reset: "Enter your email and we’ll help you get back to your circle.",
    update: "Choose a secure new password and step back into your happy hour.",
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
    <div className="auth-stage">
      <div className="auth-layout">
        <div className="auth-intro">
          <div className="auth-story">
            <div className="eyebrow">RICHMOND · WOMEN’S SOCIAL COMMUNITY</div>
            <h1>
              It’s <em>your time</em> to belong.
            </h1>
            <p className="auth-story-copy">
              Discover new hobbies, meet kindred spirits, and make beautiful
              memories beyond the everyday.
            </p>
            <img
              className="auth-logo"
              src="/brand/hh-artwork.webp"
              alt="Her Hobby Hour — Oh Sakhi! artwork of a woman enjoying coffee beside the HH clock monogram"
              width="1254"
              height="1254"
              fetchPriority="high"
            />
            <p className="auth-artwork-name">HER HOBBY HOUR</p>
            <p className="auth-artwork-tag">Oh Sakhi!</p>
          </div>
          <AuthBenefits />
        </div>
        <main className="auth-panel">
          <div className="auth-card">
            <button
              className="link-btn auth-back"
              onClick={back}
              disabled={busy}
            >
              ← Back to experiences
            </button>
            <img
              className="auth-icon"
              src="/brand/hh-icon.webp"
              alt=""
              width="465"
              height="490"
            />
            <h2>{titles[mode]}</h2>
            <p
              className={`auth-subtitle${notice ? " auth-notice" : ""}`}
              role={notice ? (isError ? "alert" : "status") : undefined}
            >
              {notice || subtitles[mode]}
            </p>
            <form onSubmit={submit}>
              {mode === "signup" && (
                <div className="field">
                  <label className="visually-hidden" htmlFor="signup-name">
                    Display name
                  </label>
                  <input
                    id="signup-name"
                    name="name"
                    required
                    maxLength={60}
                    autoComplete="nickname"
                    placeholder="Display name"
                  />
                </div>
              )}
              {mode !== "update" && (
                <div className="field">
                  <label className="visually-hidden" htmlFor="auth-email">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Email address"
                  />
                </div>
              )}
              {mode !== "reset" && (
                <div className="field">
                  <label className="visually-hidden" htmlFor="auth-password">
                    Password
                  </label>
                  <input
                    id="auth-password"
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder="Password (8+ characters)"
                  />
                </div>
              )}
              {mode === "login" && (
                <div className="auth-forgot">
                  <button
                    type="button"
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
                </div>
              )}
              <button className="btn full-width" type="submit" disabled={busy}>
                {busy ? "Please wait…" : buttons[mode]}
              </button>
            </form>
            <div className="auth-links">
              {mode === "login" ? (
                <>
                  <div className="auth-or" aria-hidden="true">
                    or
                  </div>
                  <button
                    className="btn btn-outline full-width auth-register"
                    disabled={busy}
                    onClick={() => {
                      setNotice("");
                      setIsError(false);
                      setMode("signup");
                    }}
                  >
                    Create account
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
            <p className="auth-terms">
              A women’s space to create, connect, learn, and belong.
            </p>
            <LegalLinks />
          </div>
        </main>
      </div>
    </div>
  );
}

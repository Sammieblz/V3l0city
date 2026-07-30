"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { TurnstileField } from "@/components/auth/turnstile";
import { Brand } from "@/components/shared/brand";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up" | "forgot-password";

const messages = {
  "sign-in": { title: "Welcome back.", copy: "Sign in to restore your private browser library, review trips, and manage visibility.", submit: "Sign in" },
  "sign-up": { title: "Make it yours.", copy: "Create a V3l0city account. Social sharing and cloud backup remain off until you choose them.", submit: "Create account" },
  "forgot-password": { title: "Reset your password.", copy: "We’ll send a password-reset link if the address is associated with a V3l0city account.", submit: "Send reset link" },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [legalConfirmed, setLegalConfirmed] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const text = messages[mode];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setSuccess(null);
    const supabase = createClient();
    if (!supabase) { setError("Cloud authentication is not configured in this environment yet."); return; }
    if (mode === "sign-up" && (!ageConfirmed || !legalConfirmed)) { setError("Confirm your age and agree to the Terms and Privacy Notice to create an account."); return; }
    if (mode === "sign-up" && !/^[a-z0-9_]{3,32}$/i.test(username)) { setError("Username must be 3–32 letters, numbers, or underscores."); return; }
    setPending(true);
    try {
      if (mode === "sign-in") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined });
        if (authError) throw authError;
        router.replace("/dashboard"); router.refresh();
      } else if (mode === "sign-up") {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback`, captchaToken: captchaToken ?? undefined, data: { username: username.toLowerCase(), display_name: displayName.trim(), age_attested: true, signup_terms_version: process.env.NEXT_PUBLIC_TERMS_VERSION } },
        });
        if (authError) throw authError;
        if (data.session) { router.replace("/dashboard"); router.refresh(); }
        else setSuccess("Check your email to confirm your account, then return here to sign in. You will confirm the current terms before using the dashboard.");
      } else {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/account` , captchaToken: captchaToken ?? undefined });
        if (authError) throw authError;
        setSuccess("If that email has an account, a password-reset link is on its way.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not complete that request.");
    } finally { setPending(false); }
  }

  return <main id="main-content" className="auth-page"><section className="auth-panel panel"><div className="auth-identity"><Brand /><span className="eyebrow">Secure account access</span></div><h1 className="display heading-md">{text.title}</h1><p className="copy">{text.copy}</p><form className="auth-form" onSubmit={submit}>{mode === "sign-up" && <><div className="field"><label htmlFor="displayName">Display name</label><input className="input" id="displayName" value={displayName} maxLength={80} required onChange={(event) => setDisplayName(event.target.value)} /></div><div className="field"><label htmlFor="username">Username</label><input className="input" id="username" value={username} maxLength={32} required autoCapitalize="none" onChange={(event) => setUsername(event.target.value.replace(/\s/g, ""))} /><span className="field-help">Used in opt-in social features. Letters, numbers, and underscores only.</span></div></>}<div className="field"><label htmlFor="email">Email address</label><input className="input" id="email" type="email" value={email} autoComplete="email" required onChange={(event) => setEmail(event.target.value)} /></div>{mode !== "forgot-password" && <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" type="password" value={password} minLength={8} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required onChange={(event) => setPassword(event.target.value)} /></div>}{mode === "sign-up" && <><label className="check-row"><input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} /><span>I confirm that I am at least 16 years old.</span></label><label className="check-row"><input type="checkbox" checked={legalConfirmed} onChange={(event) => setLegalConfirmed(event.target.checked)} /><span>I agree to the <Link href="/terms">Terms of Service</Link> and acknowledge the <Link href="/privacy">Privacy Notice</Link>.</span></label></>}<TurnstileField onToken={setCaptchaToken} />{error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}<button className="button button-primary" disabled={pending}>{pending ? "Working…" : text.submit}</button></form><div className="auth-links">{mode === "sign-in" && <><Link href="/auth/forgot-password">Forgot password?</Link><span>New here? <Link href="/auth/sign-up">Create an account</Link></span></>}{mode === "sign-up" && <span>Already have an account? <Link href="/auth/sign-in">Sign in</Link></span>}{mode === "forgot-password" && <Link href="/auth/sign-in">Back to sign in</Link>}</div></section><aside className="auth-aside"><div><span className="eyebrow">V3l0city web</span><h2 className="display heading-lg">Your desktop is for review. Your phone is for manual, foreground-only recording.</h2><p className="copy">No auto-start, background tracking, native widgets, or driving-screen social activity in the browser release.</p></div></aside></main>;
}

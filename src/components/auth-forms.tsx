"use client";

import { useActionState } from "react";
import { acceptInvite, signIn } from "@/lib/actions/auth";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="stack">
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required autoFocus />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-wide" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}

export function AcceptInviteForm({ token, name, email }: { token: string; name: string; email: string }) {
  const [state, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="token" value={token} />
      <label className="field">
        <span>Email</span>
        <input value={email} readOnly />
      </label>
      <label className="field">
        <span>Your name</span>
        <input name="name" defaultValue={name} required autoComplete="name" />
      </label>
      <label className="field">
        <span>Choose a password</span>
        <input name="password" type="password" minLength={10} required autoComplete="new-password" />
        <small>At least 10 characters.</small>
      </label>
      {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-wide" disabled={pending}>
        {pending ? "One moment" : "Enter the studio"}
      </button>
    </form>
  );
}

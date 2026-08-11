"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Field,
  FormError,
  PasswordField,
  Submit,
  useAuthPost,
} from "@/components/auth/form";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const { pending, error, fields, post } = useAuthPost("/api/auth/login");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        post({ email, password, remember }, (data) =>
          /* The server decides where to go when it has an opinion — a one-time
             password sends you to the change screen no matter what `next` said. */
          window.location.assign(
            data.next === "/" ? next : String(data.next ?? next)
          )
        );
      }}
      className="flex flex-col gap-4"
    >
      <FormError message={error} />

      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        error={fields.email}
        autoComplete="username"
        placeholder="you@school.org"
      />

      <div>
        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={setPassword}
          error={fields.password}
          autoComplete="current-password"
        />
        <div className="mt-2.5 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg2">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--brand)]"
            />
            Keep me signed in
          </label>
          <Link
            href="/forgot-password"
            className="text-[13px] font-semibold text-brandink hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <Submit pending={pending} pendingLabel="Signing in…">
        Sign in
      </Submit>

      {/* Said plainly, because "Keep me signed in" is the one control on this
          form whose consequence is not obvious, and a shared staffroom computer
          is a normal place to open this. */}
      <p className="text-xs leading-relaxed text-fg3">
        On a shared computer, untick &ldquo;keep me signed in&rdquo; — your
        session will then end when you close the browser.
      </p>
    </form>
  );
}

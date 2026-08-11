"use client";

import { useState } from "react";
import { Field, FormError, Submit, useAuthPost } from "@/components/auth/form";

export default function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { pending, error, fields, post } = useAuthPost("/api/auth/forgot");

  /**
   * The confirmation says "if that address has an account", not "we've sent
   * you an email", because the endpoint deliberately cannot tell us which
   * happened — answering differently for a known and an unknown address would
   * turn this form into a list of who has signed up. Wording that promised
   * delivery would be a lie half the time.
   */
  if (sent) {
    return (
      <div className="rounded-xl border border-ok/40 bg-ok/12 p-5">
        <h2 className="text-[15px] font-semibold text-fg1">Check your inbox</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg2">
          If <span className="font-semibold text-fg1">{email}</span> has a
          TakenTeach account, a reset link is on its way. It expires in an hour
          and can only be used once.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-4 text-[13px] font-semibold text-brandink hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        post({ email }, () => setSent(true));
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
        autoComplete="email"
        placeholder="you@school.org"
      />
      <Submit pending={pending} pendingLabel="Sending…">
        Send reset link
      </Submit>
    </form>
  );
}

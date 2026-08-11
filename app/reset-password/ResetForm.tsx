"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FormError,
  PasswordField,
  Submit,
  useAuthPost,
} from "@/components/auth/form";

export default function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState("");
  const { pending, error, fields, post } = useAuthPost("/api/auth/reset");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        /* Confirmation is checked here and nowhere else on purpose. It is not a
           security property — the server has no use for a second copy of the
           same string — it is a typo guard, and a typo guard belongs where the
           typo happened, before a round trip. */
        if (password !== confirm) {
          setMismatch("Those two passwords don't match.");
          return;
        }
        setMismatch("");
        post({ token, password });
      }}
      className="flex flex-col gap-4"
    >
      <FormError message={error} />

      <PasswordField
        label="New password"
        name="password"
        value={password}
        onChange={setPassword}
        error={fields.password}
        autoComplete="new-password"
        hint="At least 10 characters."
      />
      <PasswordField
        label="Confirm new password"
        name="confirm"
        value={confirm}
        onChange={(v) => {
          setConfirm(v);
          if (mismatch) setMismatch("");
        }}
        error={mismatch}
        autoComplete="new-password"
      />

      <Submit pending={pending} pendingLabel="Saving…">
        Set new password
      </Submit>

      {/* The expired-link case is the commonest failure here and the message
          from the server explains it, but the way OUT of it is a different
          page — so the door is always visible rather than appearing only on
          failure. */}
      <p className="text-xs text-fg3">
        Link expired?{" "}
        <Link href="/forgot-password" className="font-semibold text-brandink hover:underline">
          Request a new one
        </Link>
      </p>
    </form>
  );
}

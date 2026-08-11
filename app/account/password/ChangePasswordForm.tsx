"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FormError,
  PasswordField,
  Submit,
  useAuthPost,
} from "@/components/auth/form";

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState("");
  const { pending, error, fields, post } = useAuthPost("/api/auth/password");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirm) {
          setMismatch("Those two passwords don't match.");
          return;
        }
        setMismatch("");
        post({ currentPassword, password });
      }}
      className="flex flex-col gap-4"
    >
      <FormError message={error} />

      <PasswordField
        label={forced ? "The one-time password you were given" : "Current password"}
        name="currentPassword"
        value={currentPassword}
        onChange={setCurrentPassword}
        error={fields.currentPassword}
        autoComplete="current-password"
      />
      <PasswordField
        label="New password"
        name="password"
        value={password}
        onChange={setPassword}
        error={fields.password}
        autoComplete="new-password"
        hint="At least 10 characters. A short phrase beats a scrambled word."
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
        Save password
      </Submit>

      {/* Only offered when this is a voluntary visit. While the one-time
          password is still live there is nowhere else to go, and a "Cancel"
          that bounces straight back here would be a lie. */}
      {!forced && (
        <Link href="/" className="text-center text-[13px] font-semibold text-fg2 hover:text-fg1">
          Cancel
        </Link>
      )}
    </form>
  );
}

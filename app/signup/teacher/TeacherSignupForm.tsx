"use client";

import { useState } from "react";
import {
  Field,
  FormError,
  PasswordField,
  Submit,
  useAuthPost,
} from "@/components/auth/form";

export default function TeacherSignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const { pending, error, fields, post } = useAuthPost("/api/auth/signup");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        post({
          accountType: "teacher",
          name,
          email,
          password,
          schoolName,
          inviteCode,
        });
      }}
      className="flex flex-col gap-4"
    >
      <FormError message={error} />

      <Field
        label="Your name"
        name="name"
        value={name}
        onChange={setName}
        error={fields.name}
        autoComplete="name"
        placeholder="Ada Iyer"
      />
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
      <PasswordField
        label="Password"
        name="password"
        value={password}
        onChange={setPassword}
        error={fields.password}
        autoComplete="new-password"
        hint="At least 10 characters. A short phrase beats a scrambled word."
      />
      <Field
        label="School or organization"
        name="schoolName"
        value={schoolName}
        onChange={setSchoolName}
        error={fields.schoolName}
        required={false}
        placeholder="Ascent Academy"
        hint="If we find it, we'll send a request to join. Leave blank to work on your own."
      />

      {/* Progressive disclosure: most people do not have a code, and a field
          they must reason about and then leave empty is friction on every
          signup to serve a minority of them. */}
      {showCode ? (
        <Field
          label="Invitation code"
          name="inviteCode"
          value={inviteCode}
          onChange={setInviteCode}
          error={fields.inviteCode}
          required={false}
          placeholder="From your school's invitation email"
        />
      ) : (
        <button
          type="button"
          onClick={() => setShowCode(true)}
          className="self-start text-[13px] font-semibold text-brandink hover:underline"
        >
          I have an invitation code
        </button>
      )}

      <Submit pending={pending} pendingLabel="Creating your account…">
        Create account
      </Submit>
    </form>
  );
}

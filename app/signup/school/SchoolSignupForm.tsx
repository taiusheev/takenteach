"use client";

import { useState } from "react";
import {
  Field,
  FormError,
  PasswordField,
  Select,
  Submit,
  useAuthPost,
} from "@/components/auth/form";

const SIZES = [
  { value: "1-5", label: "1–5 teachers" },
  { value: "6-20", label: "6–20 teachers" },
  { value: "21-50", label: "21–50 teachers" },
  { value: "51-200", label: "51–200 teachers" },
  { value: "200+", label: "More than 200" },
];

export default function SchoolSignupForm() {
  const [schoolName, setSchoolName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("");
  const [teacherCount, setTeacherCount] = useState("6-20");
  const { pending, error, fields, post } = useAuthPost("/api/auth/signup");

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        post({
          accountType: "school",
          schoolName,
          adminName,
          email,
          password,
          location,
          teacherCount,
        });
      }}
      className="flex flex-col gap-4"
    >
      <FormError message={error} />

      <Field
        label="School name"
        name="schoolName"
        value={schoolName}
        onChange={setSchoolName}
        error={fields.schoolName}
        autoComplete="organization"
        placeholder="Ascent Academy"
        hint="This is what teachers will search for when they ask to join."
      />
      <Field
        label="Your name"
        name="adminName"
        value={adminName}
        onChange={setAdminName}
        error={fields.adminName}
        autoComplete="name"
      />
      <Field
        label="Work email"
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
        label="Location"
        name="location"
        value={location}
        onChange={setLocation}
        error={fields.location}
        required={false}
        placeholder="Almaty, Kazakhstan"
      />
      {/* Bands, not a number. Nobody knows their exact headcount, it is only
          used for sizing, and a free-text number invites a wrong answer typed
          confidently. */}
      <Select
        label="Roughly how many teachers?"
        name="teacherCount"
        value={teacherCount}
        onChange={setTeacherCount}
        options={SIZES}
      />

      <Submit pending={pending} pendingLabel="Setting up your school…">
        Create the organization
      </Submit>
    </form>
  );
}

import { z } from "zod";

/**
 * The shapes the auth endpoints accept, in one file so the form and the route
 * cannot drift. The route is the enforcer — a browser can post whatever it
 * likes — but a form built against the same schema fails in the field the user
 * is looking at rather than in a toast after a round trip.
 */

/**
 * PASSWORD POLICY: length, not composition.
 *
 * No "must contain an uppercase, a digit and a symbol" rule. NIST SP 800-63B
 * dropped that advice years ago and said so plainly: composition rules push
 * people toward `Password1!` and away from the long passphrases that are
 * actually strong, while adding a rule the user has to guess at. Ten characters
 * minimum, everything allowed, nothing mandated.
 *
 * The cap is not security theatre either — it stops a megabyte of "password"
 * being fed to a deliberately slow KDF, which is a free denial of service.
 */
export const passwordField = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "That's longer than 200 characters");

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter your email address")
  .max(254, "That email address is too long")
  // Deliberately permissive. Email addresses are far stranger than the regex
  // everyone reaches for, and the only real proof an address works is sending
  // to it — so this rejects what is obviously not an address and no more.
  .regex(/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/, "That doesn't look like an email address");

export const nameField = z
  .string()
  .trim()
  .min(1, "Enter your name")
  .max(120, "That name is too long");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password").max(200),
  remember: z.boolean().default(false),
});

/** Which of the two signup paths the visitor picked. */
export const ACCOUNT_TYPES = ["teacher", "school"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const teacherSignupSchema = z.object({
  accountType: z.literal("teacher"),
  name: nameField,
  email: emailField,
  password: passwordField,
  /** Free text: the school they say they are at. May match nothing. */
  schoolName: z.string().trim().max(160).default(""),
  /** An invitation code turns a join REQUEST into an immediate membership. */
  inviteCode: z.string().trim().max(64).default(""),
});

export const schoolSignupSchema = z.object({
  accountType: z.literal("school"),
  schoolName: z.string().trim().min(2, "Enter the school's name").max(160),
  adminName: nameField,
  email: emailField,
  password: passwordField,
  location: z.string().trim().max(160).default(""),
  /** Bands, not a number: nobody knows their exact headcount and it is only used for sizing. */
  teacherCount: z
    .enum(["1-5", "6-20", "21-50", "51-200", "200+"])
    .default("6-20"),
});

/** The discriminator is what makes one endpoint able to serve both forms safely. */
export const signupSchema = z.discriminatedUnion("accountType", [
  teacherSignupSchema,
  schoolSignupSchema,
]);

export type TeacherSignup = z.infer<typeof teacherSignupSchema>;
export type SchoolSignup = z.infer<typeof schoolSignupSchema>;
export type Signup = z.infer<typeof signupSchema>;

export const forgotSchema = z.object({ email: emailField });

export const resetSchema = z.object({
  token: z.string().min(10, "This reset link is incomplete").max(200),
  password: passwordField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password").max(200),
  password: passwordField,
});

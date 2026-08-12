import type { Metadata } from "next";
import { requireActiveSession } from "@/lib/auth/dal";
import { getUser } from "@/lib/auth/store";
import { parsePreferences } from "@/lib/auth/preferences";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

/**
 * The settings screen.
 *
 * Reads the user row rather than taking the values off the session: the session
 * record carries name and email for the header, but not `preferences`, and
 * widening `readSessionRecord` to fetch a column used by one page would put it
 * on every authenticated request in the product.
 */
export default async function SettingsPage() {
  const session = await requireActiveSession("/settings");
  const user = await getUser(session.userId);

  return (
    <SettingsForm
      name={user?.name ?? session.name}
      email={session.email}
      orgName={session.orgName}
      preferences={parsePreferences(user?.preferences)}
    />
  );
}

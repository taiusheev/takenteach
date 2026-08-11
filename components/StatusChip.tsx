import { Status, STATUS_LABELS } from "@/lib/workflow";

/**
 * One class per state; the colours live in globals.css beside the palette they
 * come from. These were four raw Tailwind hues, which put a second palette on
 * the most repeated component in the product — see the note there.
 */
const STYLES: Record<Status, string> = {
  draft: "chip chip-draft",
  in_review: "chip chip-review",
  approved: "chip chip-approved",
  published: "chip chip-published",
};

export default function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

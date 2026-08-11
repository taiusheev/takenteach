"use client";

/** Print trigger for server-rendered printable pages. */
export default function PrintButton({ label = "🖨 Print" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-brand px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-brand"
    >
      {label}
    </button>
  );
}

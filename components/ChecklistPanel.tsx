import { ChecklistResult } from "@/lib/checklist";

export default function ChecklistPanel({
  result,
  onJumpTo,
}: {
  result: ChecklistResult;
  /**
   * When provided, each failing item becomes a button that jumps to the
   * offending field in the builder. Omitted on read-only views (the material
   * detail page), where the panel stays a plain list.
   */
  onJumpTo?: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-inkline bg-inkcard p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-fg3">
          Evidence-Integrity Checklist
        </h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest ${
            result.passed
              ? "bg-ok/12 text-ok"
              : "bg-danger/12 text-danger"
          }`}
        >
          {result.passed ? "Pass" : "Blocking"}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {result.items.map((item) => {
          const jumpable = !item.passed && !!onJumpTo;
          const body = (
            <>
              <span
                aria-hidden
                className={`mt-0.5 ${item.passed ? "text-ok" : "text-danger"}`}
              >
                {item.passed ? "✓" : "✗"}
              </span>
              <div className="min-w-0">
                <div
                  className={
                    item.passed
                      ? "text-fg2"
                      : "font-semibold text-fg1 group-hover:text-accent"
                  }
                >
                  {item.label}
                  {jumpable && (
                    <span
                      aria-hidden
                      className="ml-1 text-fg3 group-hover:text-accent"
                    >
                      →
                    </span>
                  )}
                </div>
                <div className="text-fg3">{item.detail}</div>
              </div>
            </>
          );

          return (
            <li key={item.id} className="text-xs">
              {jumpable ? (
                <button
                  type="button"
                  onClick={() => onJumpTo!(item.id)}
                  className="group flex w-full items-start gap-2 rounded-md border border-transparent px-1.5 py-1 -mx-1.5 text-left transition-colors hover:border-danger/30 hover:bg-danger/5"
                  title="Jump to this field"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-2 px-1.5 py-1">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

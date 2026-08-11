import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * The frame every auth screen sits in.
 *
 * A split: the form on the left at a fixed, narrow measure, and the brand on
 * the right. The right half is the first thing a school sees of the product and
 * it is doing one job — say what this is — so it carries the mark, the
 * positioning line and three concrete claims, not a stock photograph.
 *
 * Below `lg` the brand panel is dropped rather than stacked. A form is a task,
 * and on a phone the only correct thing above it is the thing you came to do;
 * a screenful of marketing to scroll past is a worse welcome than none.
 */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-[52%] lg:px-16">
        <div className="mx-auto w-full max-w-[26rem]">
          <Link
            href="/"
            className="mb-10 inline-flex rounded-lg transition-opacity hover:opacity-85"
          >
            <Logo size={28} />
          </Link>

          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg1">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-fg2">{subtitle}</p>
          )}

          <div className="mt-8">{children}</div>

          {footer && (
            <div className="mt-8 border-t border-inkline pt-6 text-sm text-fg2">
              {footer}
            </div>
          )}
        </div>
      </div>

      <aside className="band-deep band-deep-lit hidden lg:flex lg:w-[48%] lg:flex-col lg:justify-center lg:px-14">
        <Logo size={34} tone="dark" tagline />
        <p className="mt-10 max-w-sm text-[22px] font-semibold leading-snug tracking-[-0.02em] text-white">
          Every lesson your department ships, in one house style.
        </p>
        <ul className="mt-8 flex max-w-sm flex-col gap-4">
          <Claim
            title="Structured, not a text box"
            body="Activities, vocabulary, evidence and the teacher guide are separate fields — so you can rewrite one without touching the rest."
          />
          <Claim
            title="Evidence rules are enforced"
            body="Scope limits and source integrity are checked before a pack can leave review, not suggested in a prompt."
          />
          <Claim
            title="Print-ready A4"
            body="What you see is the sheet that comes out of the photocopier, page numbers and all."
          />
        </ul>
      </aside>
    </div>
  );
}

function Claim({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        aria-hidden
        className="mt-0.5 shrink-0"
      >
        <circle cx="9" cy="9" r="9" fill="rgba(255,255,255,0.14)" />
        <path
          d="M5.25 9.25 7.75 11.75l5-6"
          fill="none"
          stroke="var(--brand-lift)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-white/65">{body}</p>
      </div>
    </li>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { countMaterialsUsingKit, getStyleKit } from "@/lib/db";
import { requireActiveSession } from "@/lib/auth/dal";
import StyleKitEditor from "@/components/StyleKitEditor";

export const dynamic = "force-dynamic";

export default async function StyleKitPage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const kit = await getStyleKit(scope, Number(id));
  if (!kit) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/style-kits"
        className="text-sm font-bold text-fg3 hover:text-fg1 transition-colors"
      >
        ← Style Kits
      </Link>
      <StyleKitEditor
        kitId={kit.id}
        initialName={kit.name}
        initialConfig={kit.config}
        initialLocked={kit.locked_fields}
        isDefault={kit.is_default === 1}
        usage={await countMaterialsUsingKit(scope, kit.id)}
        canEdit={role === "founder"}
      />
    </div>
  );
}

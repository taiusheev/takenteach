import { notFound } from "next/navigation";
import { getMaterial, getRound } from "@/lib/db";
import { JudgeBallot } from "@/lib/judge-ballot-schema";
import { requireActiveSession } from "@/lib/auth/dal";
import JudgeForm from "@/components/JudgeForm";

export const dynamic = "force-dynamic";

export default async function JudgePage(ctx: {
  params: Promise<{ id: string }>;
}) {
  const { legacyRole: role, scope } = await requireActiveSession();
  const { id } = await ctx.params;
  const round = getRound(scope, Number(id));
  if (!round) notFound();
  const ballotMaterial = getMaterial(scope, round.ballot_id);
  if (!ballotMaterial) notFound();

  return (
    <JudgeForm
      roundId={round.id}
      label={round.label}
      proTeam={round.pro_team || "Pro"}
      conTeam={round.con_team || "Con"}
      resolution={round.resolution}
      ballot={ballotMaterial.content as JudgeBallot}
      role={role}
    />
  );
}

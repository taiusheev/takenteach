"use client";

import { useState } from "react";
import OutlineReview from "./OutlineReview";
import GenerateView from "./GenerateView";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { Subject } from "@/lib/subjects";

/**
 * The two-step build: review the outline, then generate the full pack. A lesson
 * pack that hasn't been built yet starts at the outline step; already-built
 * packs (and the lighter content types) go straight to the generator.
 */
export default function BuildFlow({
  materialId,
  type,
  title,
  subject,
  initialPack,
}: {
  materialId: number;
  type: string;
  title: string;
  subject: Subject;
  initialPack: LessonPack;
}) {
  const alreadyBuilt = (initialPack.activities?.length ?? 0) > 0;
  const startAtOutline = type === "lesson-pack" && !alreadyBuilt;
  const [phase, setPhase] = useState<"outline" | "build">(
    startAtOutline ? "outline" : "build"
  );
  const [pack, setPack] = useState<LessonPack>(initialPack);

  if (phase === "outline") {
    return (
      <OutlineReview
        materialId={materialId}
        title={title}
        subject={subject}
        initialPack={pack}
        onConfirm={(p) => {
          setPack(p);
          setPhase("build");
        }}
      />
    );
  }

  return (
    <GenerateView
      materialId={materialId}
      type={type}
      title={title}
      subject={subject}
      initialPack={pack}
    />
  );
}

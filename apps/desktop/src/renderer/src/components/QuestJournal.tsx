import { getNpcDefinition, QUESTS } from "@iwakura/content";
import { formatClock, questRewardSummary } from "@iwakura/engine";
import { BookOpen, Check, Clock3, ScrollText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { cn, Panel, SectionLabel } from "./ui";

export function QuestJournal({ onClose }: { onClose: () => void }) {
  const campaign = useAppStore((state) => state.campaign);
  const [tab, setTab] = useState<"active" | "completed">("active");

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!campaign) return null;
  const quests = Object.values(campaign.quests);
  const active = quests.filter((quest) => quest.status === "active");
  const completed = quests.filter((quest) => quest.status === "completed");
  const shown = tab === "active" ? active : completed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close quest journal"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <Panel lit className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <div>
            <SectionLabel>Chronicle</SectionLabel>
            <h2 className="font-display text-2xl text-parchment">Quest Journal</h2>
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-faint">
              {active.length} active · {completed.length} completed
            </div>
          </div>
          <button type="button" className="btn btn-ghost px-2! py-1!" onClick={onClose} title="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-line-soft px-4 py-2">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]",
              tab === "active"
                ? "border border-gold/40 text-gold-bright"
                : "border border-transparent text-muted",
            )}
            onClick={() => setTab("active")}
          >
            <ScrollText className="mr-2 inline size-3" />
            Active
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]",
              tab === "completed"
                ? "border border-gold/40 text-gold-bright"
                : "border border-transparent text-muted",
            )}
            onClick={() => setTab("completed")}
          >
            <Check className="mr-2 inline size-3" />
            Completed
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {shown.length === 0 ? (
            <div className="grid min-h-48 place-items-center border border-dashed border-line-soft text-center">
              <div>
                <BookOpen className="mx-auto size-6 text-faint" />
                <p className="mt-2 text-[11px] text-faint">
                  {tab === "active"
                    ? "No active tasks. Talk to the people of the valley."
                    : "Nothing finished yet."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map((quest) => {
                const template = QUESTS.find((entry) => entry.id === quest.templateId);
                const giver = template ? getNpcDefinition(template.giverNpcId) : undefined;
                const turnIn = template ? getNpcDefinition(template.turnInNpcId) : undefined;
                const ready =
                  quest.objectives.length > 0 && quest.objectives.every((objective) => objective.complete);
                return (
                  <div key={quest.id} className="border border-line-soft bg-black/10 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-lg text-parchment">{quest.title}</div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-gold/70">
                          {giver?.name ?? "Unknown patron"} · {quest.status}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "chip",
                          ready ? "border-moss/50 text-moss" : "border-gold/30 text-gold/80",
                        )}
                      >
                        {ready ? "ready to turn in" : quest.stageId}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-muted">{quest.summary}</p>

                    <div className="mt-3 space-y-1.5">
                      {quest.objectives.map((objective) => (
                        <div
                          key={objective.id}
                          className="flex items-start gap-2 border border-line-soft/70 px-2.5 py-1.5 text-[10px]"
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid size-3.5 shrink-0 place-items-center border",
                              objective.complete ? "border-moss/50 text-moss" : "border-line text-faint",
                            )}
                          >
                            {objective.complete ? <Check className="size-2.5" /> : null}
                          </span>
                          <span
                            className={objective.complete ? "text-faint line-through" : "text-parchment-dim"}
                          >
                            {objective.description}
                          </span>
                          <span className="ml-auto font-mono text-[9px] text-faint">
                            {objective.progress}/{objective.required}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2 text-[10px]">
                      <span className="text-faint">{template ? questRewardSummary(template.id) : ""}</span>
                      {ready && turnIn ? (
                        <span className="flex items-center gap-1 text-moss">
                          <Clock3 className="size-3" />
                          Return to {turnIn.name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-line-soft px-5 py-2.5 text-[9px] uppercase tracking-[0.14em] text-faint">
          {campaign.campaign.name} · {formatClock(campaign.clock)}
        </div>
      </Panel>
    </div>
  );
}

import { parseNpcTurn } from "@iwakura/ai-kit";
import { getDialogueDefinition } from "@iwakura/content";
import type { NpcDefinition } from "@iwakura/contracts";
import {
  applyDialogueAction,
  applyNpcTurn,
  dialogueRootForNpc,
  npcAppearance,
  npcRelationship,
  npcsInLocalMap,
  recordConversationSummary,
  retrieveNpcMemories,
  timeOfDay,
} from "@iwakura/engine";
import { ArrowRight, Check, Loader2, MessageCircle, Send, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { Portrait } from "./Portrait";
import { cn, Panel, SectionLabel } from "./ui";

interface TranscriptLine {
  id: string;
  role: "player" | "npc";
  text: string;
}

function line(role: "player" | "npc", text: string): TranscriptLine {
  return { id: crypto.randomUUID(), role, text };
}

export function DialoguePanel({
  npc,
  initialNodeId,
  onClose,
  onOpenShop,
  onToast,
}: {
  npc: NpcDefinition;
  initialNodeId: string;
  onClose: () => void;
  onOpenShop: (shopId: string) => void;
  onToast: (text: string, tone?: "info" | "warn") => void;
}) {
  const campaign = useAppStore((state) => state.campaign);
  const api = useAppStore((state) => state.api);
  const settings = useAppStore((state) => state.settings);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const [nodeId, setNodeId] = useState(initialNodeId);
  const [history, setHistory] = useState<TranscriptLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [utterance, setUtterance] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiEvents, setAiEvents] = useState<string[]>([]);
  const [aiRunning, setAiRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!campaign) return null;
  const dialogue = getDialogueDefinition(npc.dialogueId);
  const node = dialogue?.nodes[nodeId];
  if (!dialogue || !node) return null;
  const relationship = npcRelationship(campaign, npc.id);
  const presence = npcsInLocalMap(campaign).find((entry) => entry.npc.id === npc.id);

  const applyOption = async (optionId: string) => {
    const option = node.options.find((entry) => entry.id === optionId);
    if (!option || busy) return;
    setBusy(true);
    setHistory((current) => [...current, line("npc", node.text)]);
    let nextCampaign = campaign;
    if (option.action) {
      const result = applyDialogueAction(campaign, npc.id, option.action);
      nextCampaign = result.state;
      if (result.message) onToast(result.message);
      if (result.shopId) {
        await saveCampaign(nextCampaign);
        setBusy(false);
        onOpenShop(result.shopId);
        onClose();
        return;
      }
      if (result.state !== campaign) await saveCampaign(nextCampaign);
      if (option.action.type === "end") {
        setBusy(false);
        onClose();
        return;
      }
      if (option.action.type === "accept_quest" || option.action.type === "claim_quest") {
        const root = dialogueRootForNpc(nextCampaign, npc.id);
        if (dialogue.nodes[root]) setNodeId(root);
      } else if (option.action.type === "wait") {
        setNodeId(initialNodeId);
      }
    }
    if (option.next) {
      setNodeId(option.next);
    } else if (!option.action) {
      setNodeId(initialNodeId);
    }
    setBusy(false);
  };

  const askAi = async () => {
    const apiClient = api;
    if (!apiClient || !utterance.trim() || aiRunning) return;
    setAiRunning(true);
    setAiError(null);
    setAiReply(null);
    setAiEvents([]);
    let text = "";
    try {
      await apiClient.streamAiNpc(
        {
          campaignId: campaign.campaign.id,
          npcId: npc.id,
          persona: npc.persona,
          worldName: campaign.world.name,
          regionName: campaign.local?.map.name ?? campaign.world.name,
          timeOfDay: timeOfDay(campaign.clock),
          scene: `${npc.role} — ${presence?.schedule.activity ?? "at their post"}. ${
            campaign.local?.map.description ?? campaign.world.name
          }`,
          relationship,
          memories: retrieveNpcMemories(campaign, npc.id, utterance.trim()),
          transcript: history.slice(-6),
          playerUtterance: utterance.trim(),
          contentRating: campaign.campaign.settings.contentRating,
          maxOutputTokens: 500,
          temperature: settings?.settings.ai.temperature ?? 0.8,
        },
        (event) => {
          if (event.type === "delta") text += event.text;
          if (event.type === "done") text = event.text;
          if (event.type === "error") setAiError(event.message);
        },
      );
      const parsed = parseNpcTurn(text);
      if (parsed.ok) {
        const applied = applyNpcTurn(campaign, npc.id, parsed.value);
        const summary = `Player: ${utterance.trim().slice(0, 180)} | ${npc.name}: ${parsed.value.speech.slice(0, 180)}`;
        const withSummary = recordConversationSummary(applied.state, npc.id, summary);
        if (withSummary !== campaign) await saveCampaign(withSummary);
        const notes = [...parsed.warnings, ...applied.events, ...applied.rejected];
        setAiEvents(notes);
        if (notes.length > 0) onToast(notes.join(" "), applied.rejected.length > 0 ? "warn" : "info");
        setAiReply(parsed.value.speech);
        setHistory((current) => [
          ...current,
          line("player", utterance.trim()),
          line("npc", parsed.value.speech),
        ]);
        setUtterance("");
        if (applied.shopId) {
          onOpenShop(applied.shopId);
          onClose();
          return;
        }
        if (applied.battleStarted) {
          onClose();
          return;
        }
      } else {
        setAiError(`The reply failed validation: ${parsed.error}`);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      setAiError(message);
    } finally {
      setAiRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close dialogue"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <Panel lit className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="flex items-start gap-4 border-b border-line-soft px-5 py-4">
          <Portrait
            appearance={npcAppearance(npc)}
            className="size-16 shrink-0 rounded-sm border border-line"
          />
          <div className="min-w-0 flex-1">
            <SectionLabel>Conversation</SectionLabel>
            <h2 className="font-display text-2xl text-parchment">{npc.name}</h2>
            <div className="text-[10px] uppercase tracking-[0.12em] text-faint">
              {npc.role}
              {presence ? ` · ${presence.schedule.activity}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="chip text-[9px]">
                <UserRound className="size-2.5" />
                trust {relationship.trust}
              </span>
              <span className="chip text-[9px]">respect {relationship.respect}</span>
              <span className="chip text-[9px]">affection {relationship.affection}</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost px-2! py-1!" onClick={onClose} title="Close">
            <X className="size-4" />
          </button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {history.slice(-6).map((line) => (
              <div
                key={line.id}
                className={cn(
                  "max-w-[88%] border px-3 py-2 text-[11px] leading-5",
                  line.role === "player"
                    ? "ml-auto border-gold/20 bg-gold/[0.05] text-parchment-dim"
                    : "border-line-soft bg-black/10 text-muted",
                )}
              >
                <span className="mr-2 text-[9px] uppercase tracking-[0.12em] text-faint">
                  {line.role === "player" ? "you" : npc.name}
                </span>
                {line.text}
              </div>
            ))}
          </div>

          <div className="mt-3 border border-gold/25 bg-gold/[0.035] px-4 py-3">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-gold/70">
              <MessageCircle className="size-3" />
              {npc.name}
            </div>
            <p className="mt-2 text-[12px] leading-6 text-parchment-dim">{node.text}</p>
          </div>

          {aiReply ? (
            <div className="mt-3 border border-moss/30 bg-moss/[0.05] px-4 py-3">
              <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-moss">
                <Sparkles className="size-3" />
                AI voice
              </div>
              <p className="mt-2 text-[11px] leading-5 text-parchment-dim">{aiReply}</p>
            </div>
          ) : null}

          {aiEvents.length > 0 ? (
            <div className="mt-2 border border-gold/25 bg-gold/[0.035] px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.12em] text-gold/70">Engine result</div>
              <div className="mt-1 space-y-0.5 text-[10px] leading-4 text-parchment-dim">
                {aiEvents.map((event) => (
                  <div key={event}>· {event}</div>
                ))}
              </div>
            </div>
          ) : null}

          {aiError ? (
            <div className="mt-3 border border-blood/35 bg-blood/[0.06] px-3 py-2 text-[10px] leading-5 text-[#e0b0aa]">
              AI reply unavailable: {aiError}. The authored dialogue below is still available.
            </div>
          ) : null}

          <div className="mt-4 space-y-1.5">
            {node.options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 border border-line-soft bg-black/10 px-3 py-2 text-left text-[11px] text-parchment-dim transition-colors hover:border-gold/40 hover:text-parchment"
                onClick={() => void applyOption(option.id)}
                disabled={busy}
              >
                <span>{option.text}</span>
                <ArrowRight className="size-3.5 shrink-0 text-gold/60" />
              </button>
            ))}
          </div>

          <div className="mt-5 border-t border-line-soft pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="kicker">Speak freely</span>
              <span className="text-[9px] text-faint">
                structured reply · safe intents are validated by the engine
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="input"
                value={utterance}
                onChange={(event) => setUtterance(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void askAi();
                }}
                placeholder={`Say something to ${npc.name.split(" ")[0]}…`}
                maxLength={400}
                disabled={aiRunning}
              />
              <button
                type="button"
                className="btn shrink-0"
                onClick={() => void askAi()}
                disabled={aiRunning || !utterance.trim() || !api}
                title={api ? "Ask the local AI for an in-character reply" : "Local API unavailable"}
              >
                {aiRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Ask
              </button>
            </div>
            {settings && !settings.settings.ai.aiEnabled ? (
              <p className="mt-2 text-[9px] text-faint">
                AI is disabled in Settings. Authored dialogue remains active.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line-soft px-5 py-2.5 text-[9px] uppercase tracking-[0.14em] text-faint">
          <span className="flex items-center gap-2">
            <Check className="size-3 text-moss" />
            Authored fallback active
          </span>
          <span>{campaign.campaign.name}</span>
        </div>
      </Panel>
    </div>
  );
}

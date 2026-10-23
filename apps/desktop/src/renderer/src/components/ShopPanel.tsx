import { getItem } from "@iwakura/content";
import { buyItem, ensureShop, sellItem, shopDefinition, shopItemPrice, shopStock } from "@iwakura/engine";
import { Backpack, Coins, ShoppingBag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppStore } from "../state/useAppStore";
import { cn, Panel, SectionLabel } from "./ui";

export function ShopPanel({
  shopId,
  onClose,
  onToast,
}: {
  shopId: string;
  onClose: () => void;
  onToast: (text: string, tone?: "info" | "warn") => void;
}) {
  const campaign = useAppStore((state) => state.campaign);
  const saveCampaign = useAppStore((state) => state.saveCampaign);
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [busy, setBusy] = useState(false);
  const shop = shopDefinition(shopId);

  useEffect(() => {
    if (!campaign) return;
    const next = ensureShop(campaign, shopId);
    if (next !== campaign) void saveCampaign(next);
  }, [campaign, saveCampaign, shopId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!campaign || !shop) return null;
  const stock = shopStock(campaign, shopId);
  const inventory = campaign.entities.player?.inventory ?? [];
  const gold = campaign.party.gold;

  const performBuy = async (itemId: string) => {
    if (busy) return;
    setBusy(true);
    const result = buyItem(campaign, shopId, itemId);
    if (result.ok) await saveCampaign(result.state);
    onToast(result.message, result.ok ? "info" : "warn");
    setBusy(false);
  };

  const performSell = async (itemId: string) => {
    if (busy) return;
    setBusy(true);
    const result = sellItem(campaign, shopId, itemId);
    if (result.ok) await saveCampaign(result.state);
    onToast(result.message, result.ok ? "info" : "warn");
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close shop"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <Panel lit className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-start justify-between border-b border-line-soft px-5 py-4">
          <div>
            <SectionLabel>Trade</SectionLabel>
            <h2 className="font-display text-2xl text-parchment">{shop.name}</h2>
            <p className="mt-0.5 max-w-md text-[10px] leading-4 text-muted">{shop.description}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="chip">
              <Coins className="size-3 text-gold" />
              {gold} gp
            </span>
            <button type="button" className="btn btn-ghost px-2! py-1!" onClick={onClose} title="Close">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-line-soft px-4 py-2">
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]",
              tab === "buy"
                ? "border border-gold/40 text-gold-bright"
                : "border border-transparent text-muted",
            )}
            onClick={() => setTab("buy")}
          >
            <ShoppingBag className="mr-2 inline size-3" />
            Buy
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1.5 text-[10px] uppercase tracking-[0.14em]",
              tab === "sell"
                ? "border border-gold/40 text-gold-bright"
                : "border border-transparent text-muted",
            )}
            onClick={() => setTab("sell")}
          >
            <Backpack className="mr-2 inline size-3" />
            Sell
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "buy" ? (
            <div className="space-y-2">
              {shop.stock.map((entry) => {
                const item = getItem(entry.itemId);
                if (!item) return null;
                const available = stock[entry.itemId] ?? 0;
                const price = shopItemPrice(shopId, entry.itemId, "buy");
                return (
                  <div
                    key={entry.itemId}
                    className="flex items-start justify-between gap-3 border border-line-soft bg-black/10 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm text-parchment">{item.name}</span>
                        <span className="chip text-[9px]">{available} left</span>
                      </div>
                      <p className="mt-0.5 text-[10px] leading-4 text-muted">{item.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[11px] text-gold/85">{price} gp</span>
                      <button
                        type="button"
                        className="btn px-2! py-1! text-[9px]!"
                        disabled={busy || available <= 0 || gold < price}
                        onClick={() => void performBuy(entry.itemId)}
                        aria-label={`Buy ${item.name}`}
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {inventory.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-faint">Your pack is empty.</p>
              ) : (
                inventory.map((entry) => {
                  const item = getItem(entry.itemId);
                  if (!item) return null;
                  const price = shopItemPrice(shopId, entry.itemId, "sell");
                  const equipped = Object.values(campaign.entities.player?.equipment ?? {}).includes(
                    entry.itemId,
                  );
                  return (
                    <div
                      key={entry.itemId}
                      className="flex items-start justify-between gap-3 border border-line-soft bg-black/10 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm text-parchment">{item.name}</span>
                          {entry.quantity > 1 ? (
                            <span className="chip text-[9px]">×{entry.quantity}</span>
                          ) : null}
                          {equipped ? (
                            <span className="chip border-gold/30 text-[9px] text-gold/80">equipped</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[10px] leading-4 text-muted">{item.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono text-[11px] text-gold/85">{price} gp</span>
                        <button
                          type="button"
                          className="btn px-2! py-1! text-[9px]!"
                          disabled={busy || equipped || item.valueGold <= 0}
                          onClick={() => void performSell(entry.itemId)}
                          aria-label={`Sell ${item.name}`}
                        >
                          Sell
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

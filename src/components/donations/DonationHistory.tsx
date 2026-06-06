import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DONATION_TYPE_LABELS } from "@/lib/donations";
import type { DonationRow } from "@/lib/donations";

interface Props {
  donations: DonationRow[];
  latestIds: string[];
}

export default function DonationHistory({ donations, latestIds }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const latestIdSet = useMemo(() => new Set(latestIds), [latestIds]);

  if (donations.length === 0) return null;

  return (
    <ul className="space-y-2">
      {donations.map((row) => {
        const formattedDate = new Date(row.donated_at + "T00:00:00Z").toLocaleDateString("pl-PL", {
          timeZone: "UTC",
        });
        const isConfirming = confirmDeleteId === row.id;
        const isLatest = latestIdSet.has(row.id);

        return (
          <li key={row.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-white">{DONATION_TYPE_LABELS[row.type]}</p>
                <p className="text-xs" style={{ color: "rgba(254,202,202,0.55)" }}>
                  {formattedDate}
                </p>
              </div>

              {!isConfirming && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" asChild>
                    <a href={"/donations/" + row.id + "/edit"}>Edytuj</a>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setConfirmDeleteId(row.id);
                    }}
                  >
                    Usuń
                  </Button>
                </div>
              )}
            </div>

            {isConfirming && (
              <div className="mt-3 space-y-2">
                {isLatest && (
                  <p className="text-xs text-amber-300/80">Usunięcie tej donacji zmieni datę kwalifikowalności.</p>
                )}
                <div className="flex gap-2">
                  <form method="POST" action={"/api/donations/" + row.id + "/delete"}>
                    <button
                      type="submit"
                      className="bg-destructive hover:bg-destructive/90 inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-white shadow-xs transition-all"
                    >
                      Potwierdź
                    </button>
                  </form>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setConfirmDeleteId(null);
                    }}
                  >
                    Anuluj
                  </Button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

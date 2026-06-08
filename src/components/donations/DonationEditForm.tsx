import { useState } from "react";
import { Droplet, Save } from "lucide-react";
import { SelectField } from "@/components/profile/SelectField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { DONATION_TYPES, DONATION_TYPE_LABELS } from "@/lib/donations";
import type { DonationRow } from "@/lib/donations";
import type { DonationType } from "@/lib/eligibility";

const typeOptions = DONATION_TYPES.map((v) => ({ value: v, label: DONATION_TYPE_LABELS[v] }));

interface Props {
  donation: DonationRow;
  serverError?: string | null;
}

export default function DonationEditForm({ donation, serverError }: Props) {
  const [type, setType] = useState<DonationType>(donation.type);
  const [volume, setVolume] = useState(String(donation.volume_ml));
  const today = new Date().toISOString().split("T")[0];

  return (
    <form method="POST" action={"/api/donations/" + donation.id} className="space-y-4" noValidate>
      <SelectField
        id="type"
        label="Typ donacji"
        value={type}
        onChange={(value) => {
          setType(value as DonationType);
        }}
        options={typeOptions}
        required
        placeholder="Wybierz typ…"
        icon={<Droplet className="size-4" />}
      />

      <div>
        <label htmlFor="donated_at" className="mb-1 block text-sm" style={{ color: "rgba(254,202,202,0.7)" }}>
          Data donacji
        </label>
        <input
          type="date"
          id="donated_at"
          name="donated_at"
          required
          max={today}
          defaultValue={donation.donated_at}
          className="w-full appearance-none rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-red-700 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="volume_ml" className="mb-1 block text-sm" style={{ color: "rgba(254,202,202,0.7)" }}>
          Ilość (ml)
        </label>
        <input
          type="number"
          id="volume_ml"
          name="volume_ml"
          inputMode="numeric"
          min={1}
          max={2000}
          step={50}
          required
          value={volume}
          onChange={(e) => {
            setVolume(e.target.value);
          }}
          className="w-full appearance-none rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-red-700 focus:outline-none"
        />
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie…" icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
    </form>
  );
}

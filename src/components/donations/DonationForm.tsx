import { useState } from "react";
import { Droplet, PlusCircle } from "lucide-react";
import { SelectField } from "@/components/profile/SelectField";
import { DateField } from "@/components/donations/DateField";
import { NumberField } from "@/components/donations/NumberField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { DONATION_TYPES, DONATION_TYPE_LABELS, DEFAULT_VOLUME_ML } from "@/lib/donations";
import type { DonationType } from "@/lib/eligibility";

const typeOptions = DONATION_TYPES.map((v) => ({ value: v, label: DONATION_TYPE_LABELS[v] }));

interface Props {
  serverError?: string | null;
  added?: boolean;
}

export default function DonationForm({ serverError, added }: Props) {
  const [type, setType] = useState("");
  const [volume, setVolume] = useState("");
  const today = new Date().toISOString().split("T")[0];
  const [donatedAt, setDonatedAt] = useState(today);

  function handleTypeChange(value: string) {
    setType(value);
    setVolume(value in DEFAULT_VOLUME_ML ? String(DEFAULT_VOLUME_ML[value as DonationType]) : "");
  }

  return (
    <form method="POST" action="/api/donations" className="space-y-4" noValidate>
      {added && (
        <p className="rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          Donacja zapisana
        </p>
      )}

      <SelectField
        id="type"
        label="Typ donacji"
        value={type}
        onChange={handleTypeChange}
        options={typeOptions}
        required
        placeholder="Wybierz typ…"
        icon={<Droplet className="size-4" />}
      />

      <DateField id="donated_at" label="Data donacji" value={donatedAt} onChange={setDonatedAt} required max={today} />

      <NumberField
        id="volume_ml"
        label="Ilość (ml)"
        value={volume}
        onChange={setVolume}
        min={1}
        max={2000}
        step={50}
        required
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie…" icon={<PlusCircle className="size-4" />}>
        Dodaj donację
      </SubmitButton>
    </form>
  );
}

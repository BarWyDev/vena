import { useState } from "react";
import { Droplet, Save } from "lucide-react";
import { SelectField } from "@/components/profile/SelectField";
import { DateField } from "@/components/donations/DateField";
import { NumberField } from "@/components/donations/NumberField";
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
  const [donatedAt, setDonatedAt] = useState(donation.donated_at);
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

      <SubmitButton pendingText="Zapisywanie…" icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
    </form>
  );
}

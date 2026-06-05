import { useState } from "react";
import { Droplet, Save } from "lucide-react";
import { SelectField } from "@/components/profile/SelectField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { DONATION_TYPES, DONATION_TYPE_LABELS } from "@/lib/donations";
import type { DonationRow } from "@/lib/donations";

const typeOptions = DONATION_TYPES.map((v) => ({ value: v, label: DONATION_TYPE_LABELS[v] }));

interface Props {
  donation: DonationRow;
  serverError?: string | null;
}

export default function DonationEditForm({ donation, serverError }: Props) {
  const [type, setType] = useState(donation.type);
  const today = new Date().toISOString().split("T")[0];

  return (
    <form method="POST" action={"/api/donations/" + donation.id} className="space-y-4" noValidate>
      <SelectField
        id="type"
        label="Typ donacji"
        value={type}
        onChange={setType}
        options={typeOptions}
        required
        placeholder="Wybierz typ…"
        icon={<Droplet className="size-4" />}
      />

      <div>
        <label htmlFor="donated_at" className="mb-1 block text-sm text-blue-100/80">
          Data donacji
        </label>
        <input
          type="date"
          id="donated_at"
          name="donated_at"
          required
          max={today}
          defaultValue={donation.donated_at}
          className="w-full appearance-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none"
        />
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie…" icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
    </form>
  );
}

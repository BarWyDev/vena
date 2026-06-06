import { useState } from "react";
import { Droplet, PlusCircle } from "lucide-react";
import { SelectField } from "@/components/profile/SelectField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { DONATION_TYPES, DONATION_TYPE_LABELS } from "@/lib/donations";

const typeOptions = DONATION_TYPES.map((v) => ({ value: v, label: DONATION_TYPE_LABELS[v] }));

interface Props {
  serverError?: string | null;
  added?: boolean;
}

export default function DonationForm({ serverError, added }: Props) {
  const [type, setType] = useState("");
  const today = new Date().toISOString().split("T")[0];

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
        onChange={setType}
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
          defaultValue={today}
          className="w-full appearance-none rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-red-700 focus:outline-none"
        />
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie…" icon={<PlusCircle className="size-4" />}>
        Dodaj donację
      </SubmitButton>
    </form>
  );
}

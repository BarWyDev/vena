import React, { useState } from "react";
import { User, Droplets, Activity, Save } from "lucide-react";
import { SelectField } from "@/components/profile/SelectField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { SEX_LABELS, BLOOD_GROUP_LABELS, RH_LABELS } from "@/lib/profile";
import { Constants } from "@/db/database.types";

const sexOptions = Constants.public.Enums.sex.map((v) => ({ value: v, label: SEX_LABELS[v] }));
const bloodGroupOptions = Constants.public.Enums.blood_group.map((v) => ({ value: v, label: BLOOD_GROUP_LABELS[v] }));
const rhOptions = Constants.public.Enums.rh.map((v) => ({ value: v, label: RH_LABELS[v] }));

interface Initial {
  sex: string | null;
  blood_group: string | null;
  rh: string | null;
}

interface Props {
  initial: Initial;
  serverError?: string | null;
  saved?: boolean;
}

export default function ProfileForm({ initial, serverError, saved }: Props) {
  const [sex, setSex] = useState(initial.sex ?? "");
  const [bloodGroup, setBloodGroup] = useState(initial.blood_group ?? "");
  const [rh, setRh] = useState(initial.rh ?? "");
  const [sexError, setSexError] = useState<string | undefined>();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!sex) {
      e.preventDefault();
      setSexError("Płeć jest wymagana");
    }
  }

  return (
    <form method="POST" action="/api/profile" className="space-y-4" onSubmit={handleSubmit} noValidate>
      {saved && (
        <p className="rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          Zapisano
        </p>
      )}

      <SelectField
        id="sex"
        label="Płeć"
        value={sex}
        onChange={(v) => {
          setSex(v);
          if (v) setSexError(undefined);
        }}
        options={sexOptions}
        required
        error={sexError}
        icon={<User className="size-4" />}
      />

      <SelectField
        id="blood_group"
        label="Grupa krwi"
        value={bloodGroup}
        onChange={setBloodGroup}
        options={bloodGroupOptions}
        icon={<Droplets className="size-4" />}
      />

      <SelectField
        id="rh"
        label="Czynnik Rh"
        value={rh}
        onChange={setRh}
        options={rhOptions}
        icon={<Activity className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie…" icon={<Save className="size-4" />}>
        Zapisz
      </SubmitButton>
    </form>
  );
}

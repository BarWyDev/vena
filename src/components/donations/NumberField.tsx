import { CircleAlert, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface NumberFieldProps {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  required?: boolean;
  error?: string;
}

export function NumberField({
  id,
  name,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  required,
  error,
}: NumberFieldProps) {
  function clamp(n: number) {
    let result = n;
    if (min !== undefined) result = Math.max(min, result);
    if (max !== undefined) result = Math.min(max, result);
    return result;
  }

  function adjust(delta: number) {
    onChange(String(clamp((Number(value) || 0) + delta)));
  }

  const atMin = min !== undefined && Number(value) <= min;
  const atMax = max !== undefined && Number(value) >= max;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm" style={{ color: "rgba(254,202,202,0.7)" }}>
        {label}
      </label>
      <div
        className={cn(
          "flex items-stretch overflow-hidden rounded-lg border bg-white/10 transition-colors focus-within:ring-2 focus-within:outline-none",
          error ? "border-red-500/60 focus-within:ring-red-500" : "border-white/10 focus-within:ring-red-700",
        )}
      >
        <button
          type="button"
          onClick={() => {
            adjust(-step);
          }}
          disabled={atMin}
          aria-label="Zmniejsz"
          className="flex items-center justify-center px-3 text-white/60 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <Minus className="size-4" />
        </button>
        <input
          type="number"
          id={id}
          name={name ?? id}
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="w-full appearance-none border-x border-white/10 bg-transparent px-2 py-2 text-center text-white [-moz-appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => {
            adjust(step);
          }}
          disabled={atMax}
          aria-label="Zwiększ"
          className="flex items-center justify-center px-3 text-white/60 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-30"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}

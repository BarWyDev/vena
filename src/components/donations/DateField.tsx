import { useState } from "react";
import { format, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { CalendarDays, CircleAlert } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  max?: string;
  error?: string;
}

export function DateField({ id, name, label, value, onChange, required, max, error }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const maxDate = max ? parseISO(max) : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm" style={{ color: "rgba(254,202,202,0.7)" }}>
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border bg-white/10 px-3 py-2 text-left text-white transition-colors focus:ring-2 focus:outline-none",
              error ? "border-red-500/60 focus:ring-red-500" : "border-white/10 focus:ring-red-700",
            )}
          >
            <CalendarDays className="size-4 text-white/40" />
            {selected ? (
              format(selected, "d MMMM yyyy", { locale: pl })
            ) : (
              <span className="text-white/40">Wybierz datę…</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="dark w-auto border-white/10 bg-zinc-900 p-0 text-white">
          <Calendar
            mode="single"
            locale={pl}
            selected={selected}
            defaultMonth={selected}
            disabled={maxDate ? { after: maxDate } : undefined}
            onSelect={(date) => {
              if (date) {
                onChange(format(date, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
      <input type="hidden" name={name ?? id} value={value} required={required} />
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-red-300">
          <CircleAlert className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}

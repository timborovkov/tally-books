import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Labelled input with a confidence-driven background tint.
 *
 * The tint thresholds match the "confidence highlighting in UI for
 * low-confidence fields" v0.2 TODO line. Below 0.6 → amber, below
 * 0.4 → red. Above 0.6 gets no treatment — that's fine-quality OCR
 * and painting every field would train the user to ignore the
 * whole system.
 *
 * Confidence null (no OCR yet / field wasn't extracted) renders as
 * neutral so manually-entered receipts don't look like bad OCR.
 */
export interface ConfidenceFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  confidence?: number | null;
  helpText?: string;
}

function toneForConfidence(c: number | null | undefined): string {
  if (c === null || c === undefined) return "";
  if (c < 0.4) return "border-red-500/60 bg-red-50 dark:border-red-500/50 dark:bg-red-950/40";
  if (c < 0.6)
    return "border-amber-500/60 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-950/40";
  return "";
}

export function ConfidenceField({
  label,
  confidence,
  helpText,
  className,
  id,
  ...props
}: ConfidenceFieldProps): React.ReactElement {
  const fieldId = id ?? props.name;
  const pct =
    confidence === null || confidence === undefined
      ? null
      : `${Math.round(confidence * 100)}% confidence`;

  return (
    <label htmlFor={fieldId} className="flex flex-col gap-1 text-sm">
      <span className="flex items-center justify-between">
        <span className="font-medium">{label}</span>
        {pct && <span className="text-muted-foreground font-mono text-[10px]">{pct}</span>}
      </span>
      <Input id={fieldId} {...props} className={cn(toneForConfidence(confidence), className)} />
      {helpText && <span className="text-muted-foreground text-xs">{helpText}</span>}
    </label>
  );
}

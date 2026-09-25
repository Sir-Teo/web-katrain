import React from 'react';

type DraftNumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & {
  value: number;
};

/**
 * A number field whose owner clamps on change, without the clamp fighting the
 * typing.
 *
 * Writing the clamped number straight back into the field rewrote it under
 * the cursor: clearing it to type 60 made it the minimum 1 at once, and the
 * 6 and 0 then followed it -- 160. A lone "-" reads as empty, so it came back
 * as 0 and a negative could not be typed at all. Here the field shows what is
 * typed while it has focus, the owner hears each complete number (it still
 * clamps them), and on blur the field shows the owner's value again.
 */
export const DraftNumberInput: React.FC<DraftNumberInputProps> = ({ value, onChange, onBlur, ...rest }) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  return (
    <input
      {...rest}
      type="number"
      value={draft ?? value}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw.trim() !== '' && Number.isFinite(Number(raw))) onChange?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
};

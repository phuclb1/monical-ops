export function CountSelect({
  name,
  value,
  min,
  max,
  onChange,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  const lo = Math.min(min, value);
  const hi = Math.max(max, value);
  const options: number[] = [];
  for (let n = lo; n <= hi; n += 1) options.push(n);
  return (
    <select name={name} value={String(value)} onChange={(event) => onChange(Number(event.target.value))}>
      {options.map((count) => (
        <option key={count} value={count}>
          {count}
        </option>
      ))}
    </select>
  );
}

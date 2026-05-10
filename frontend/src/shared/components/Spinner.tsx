export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label="loading"
      style={{ width: size, height: size }}
      className="inline-block rounded-full border-2 border-zinc-400 border-r-transparent animate-spin"
    />
  );
}

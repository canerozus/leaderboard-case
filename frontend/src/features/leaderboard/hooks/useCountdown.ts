import { useEffect, useRef, useState } from 'react';

export function useCountdown(initialSeconds: number): number {
  const [remaining, setRemaining] = useState(initialSeconds);
  const lastInitial = useRef(initialSeconds);

  useEffect(() => {
    if (lastInitial.current !== initialSeconds) {
      lastInitial.current = initialSeconds;
      setRemaining(initialSeconds);
    }
  }, [initialSeconds]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  return remaining;
}

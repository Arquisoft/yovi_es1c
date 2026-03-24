import { useEffect, useMemo, useRef, useState } from 'react';

interface TurnTimerProps {
  timerEndsAt: number;
  onExpire?: () => void;
}

export default function TurnTimer({ timerEndsAt, onExpire }: Readonly<TurnTimerProps>) {
  const [now, setNow] = useState(Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
  }, [timerEndsAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = useMemo(() => Math.max(0, Math.ceil((timerEndsAt - now) / 1000)), [timerEndsAt, now]);

  useEffect(() => {
    if (remaining === 0 && !expiredRef.current && onExpire) {
      expiredRef.current = true;
      onExpire();
    }
  }, [remaining, onExpire]);

  return <span style={{ color: remaining <= 5 ? 'var(--phosphor-danger)' : 'var(--phosphor-primary)' }}>⏱ {remaining}s</span>;
}

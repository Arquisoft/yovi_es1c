import type { ConnectionBadgeState } from '../../realtime/onlineEvents';

const colorByState: Record<ConnectionBadgeState, string> = {
  CONNECTED: 'var(--phosphor-primary)',
  RECONNECTING: '#e7ff5f',
  DISCONNECTED: 'var(--phosphor-danger)',
};

export default function ConnectionBadge({ state }: Readonly<{ state: ConnectionBadgeState }>) {
  return (
    <span
      style={{
        display: 'inline-block',
        border: `1px solid ${colorByState[state]}`,
        color: colorByState[state],
        padding: '2px 8px',
        letterSpacing: '0.08em',
        fontSize: '0.9rem',
        textTransform: 'uppercase',
      }}
    >
      {state}
    </span>
  );
}

import { useCallback, useRef, useState } from 'react';
import type { StageTransition } from '../hooks/useWebRTC';

const HOLD_TO_REVEAL_MS = 800;

interface DevStageLogPanelProps {
  stageHistory: StageTransition[];
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function useHoldToReveal(onRevealed: () => void) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = useCallback(() => {
    holdTimerRef.current = setTimeout(onRevealed, HOLD_TO_REVEAL_MS);
  }, [onRevealed]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  return { startHold, cancelHold };
}

function StageLogEntry({ transition }: { transition: StageTransition }) {
  return (
    <li className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="text-velo-text-secondary">{formatTimestamp(transition.timestamp)}</span>
      <span className="text-velo-text-primary">{transition.stage}</span>
      {transition.detail && <span className="truncate text-velo-text-secondary">{transition.detail}</span>}
    </li>
  );
}

function StageLogList({ stageHistory }: { stageHistory: StageTransition[] }) {
  if (stageHistory.length === 0) {
    return <p className="text-xs text-velo-text-secondary">No stage transitions recorded yet</p>;
  }

  return (
    <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto font-mono text-xs">
      {stageHistory
        .slice()
        .reverse()
        .map((transition) => (
          <StageLogEntry key={transition.timestamp} transition={transition} />
        ))}
    </ul>
  );
}

export function DevStageLogPanel({ stageHistory }: DevStageLogPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const { startHold, cancelHold } = useHoldToReveal(() => setIsVisible(true));

  if (!isVisible) {
    return (
      <button
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        aria-label="Hold to reveal connection debug log"
        className="fixed bottom-3 right-3 h-6 w-6 rounded-md border border-transparent opacity-0 transition-colors hover:border-velo-text-secondary/40 hover:opacity-100 focus-visible:border-velo-text-secondary/40 focus-visible:opacity-100"
      />
    );
  }

  return (
    <div className="fixed bottom-3 right-3 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col gap-2 rounded-xl bg-velo-surface p-3 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-velo-text-primary">Connection debug log</span>
        <button onClick={() => setIsVisible(false)} className="text-xs text-velo-indigo underline">
          Hide
        </button>
      </div>
      <StageLogList stageHistory={stageHistory} />
    </div>
  );
}

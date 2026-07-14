import type { Socket } from 'socket.io';
import { formatLog, LogMessage } from './log-messages';

const WINDOW_MS = 10_000;
const MAX_EVENTS_PER_WINDOW = 30;
const UNTHROTTLED_EVENTS = new Set(['relay-frame']);

interface EventBudget {
  count: number;
  windowStart: number;
}

function isWithinBudget(budget: EventBudget): boolean {
  const now = Date.now();
  if (now - budget.windowStart >= WINDOW_MS) {
    budget.windowStart = now;
    budget.count = 0;
  }
  budget.count += 1;
  return budget.count <= MAX_EVENTS_PER_WINDOW;
}

export function attachSocketRateLimiting(socket: Socket): void {
  const budgets = new Map<string, EventBudget>();

  socket.use((packet, next) => {
    const eventName = packet[0] as string;
    if (UNTHROTTLED_EVENTS.has(eventName)) {
      next();
      return;
    }

    const budget = budgets.get(eventName) ?? { count: 0, windowStart: Date.now() };
    budgets.set(eventName, budget);

    if (!isWithinBudget(budget)) {
      console.warn(formatLog(LogMessage.RateLimitExceeded, { peerId: socket.id, eventName }));
      return;
    }
    next();
  });
}

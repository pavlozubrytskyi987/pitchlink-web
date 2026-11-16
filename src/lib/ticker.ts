// One requestAnimationFrame loop for the whole board. Tiles subscribe while
// they are on screen and mutate their own DOM nodes; nothing here touches
// React state.

type Subscriber = (dtMs: number) => void;

const subscribers = new Set<Subscriber>();
let rafId = 0;
let last = 0;

function frame(now: number) {
  rafId = requestAnimationFrame(frame);
  // Clamp so a backgrounded tab does not fast-forward the simulation.
  const dt = Math.min(now - last, 100);
  last = now;
  for (const fn of subscribers) fn(dt);
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  if (!rafId) {
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

export function subscriberCount(): number {
  return subscribers.size;
}

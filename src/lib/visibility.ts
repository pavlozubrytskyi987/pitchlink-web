// Two IntersectionObservers shared by every tile on the board.

type Callback = (visible: boolean) => void;

function createSharedObserver(options: IntersectionObserverInit) {
  let observer: IntersectionObserver | null = null;
  const callbacks = new Map<Element, Callback>();
  return (el: Element, cb: Callback): (() => void) => {
    observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
    }, options);
    callbacks.set(el, cb);
    observer.observe(el);
    return () => {
      callbacks.delete(el);
      observer?.unobserve(el);
    };
  };
}

/** Fires before the tile scrolls in, so the <video> can mount and fetch metadata. */
export const observeNear = createSharedObserver({ rootMargin: "600px 0px" });

/** Tile is actually on screen: play video, run the ticker. */
export const observeInView = createSharedObserver({ threshold: 0.1 });

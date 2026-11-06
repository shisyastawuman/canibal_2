import { useLayoutEffect, useRef, type RefObject } from 'react';

/** FLIP-animates elements with `data-flip-id` when `deps` change. */
export function useFlipList(deps: unknown): RefObject<HTMLUListElement | null> {
  const ref = useRef<HTMLUListElement | null>(null);
  const prev = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const next = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>('[data-flip-id]').forEach((el) => {
      const id = el.dataset.flipId;
      if (!id) return;
      const box = el.getBoundingClientRect();
      next.set(id, box);
      const first = prev.current.get(id);
      if (!first) return;
      const dx = first.left - box.left;
      const dy = first.top - box.top;
      if (dx === 0 && dy === 0) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 450ms ease';
        el.style.transform = '';
      });
    });
    prev.current = next;
  }, [deps]);

  return ref;
}

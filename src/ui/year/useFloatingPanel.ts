'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { Point } from '../../year/view/exploration';

const home: Point = { x: 0, y: 0 };

export function useFloatingPanel(panel: RefObject<HTMLElement | null>, enabled: boolean) {
  const [offset, setOffset] = useState<Point>(home);
  const offsetRef = useRef(home);
  const grip = useRef<{ pointer: number; point: Point; initial: Point } | null>(null);
  const [dragging, setDragging] = useState(false);

  function fit(next: Point) {
    const node = panel.current;
    if (!node || node.hidden) return next;
    const bounds = node.getBoundingClientRect();
    const x = node.offsetLeft;
    const y = node.offsetTop;
    const maxX = Math.max(8, window.innerWidth - bounds.width - 8);
    const minY = window.innerWidth <= 760 ? 60 : 64;
    const maxY = Math.max(minY, window.innerHeight - bounds.height - 86);
    return { x: Math.max(8, Math.min(maxX, x + next.x)) - x, y: Math.max(minY, Math.min(maxY, y + next.y)) - y };
  }

  function shift(next: Point) {
    const clamped = fit(next);
    offsetRef.current = clamped;
    setOffset(previous => previous.x === clamped.x && previous.y === clamped.y ? previous : clamped);
  }

  useEffect(() => {
    const updated = () => { if (enabled && !grip.current) shift(offsetRef.current); };
    window.addEventListener('resize', updated);
    const observer = new ResizeObserver(updated);
    if (panel.current) observer.observe(panel.current);
    return () => { window.removeEventListener('resize', updated); observer.disconnect(); };
    // The drag state and measured panel are updated through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, panel]);

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (!enabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    grip.current = { pointer: event.pointerId, point: { x: event.clientX, y: event.clientY }, initial: offsetRef.current };
    setDragging(true);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const held = grip.current;
    if (!held || held.pointer !== event.pointerId) return;
    shift({ x: held.initial.x + event.clientX - held.point.x, y: held.initial.y + event.clientY - held.point.y });
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (grip.current?.pointer !== event.pointerId) return;
    grip.current = null;
    setDragging(false);
  }

  function keyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = 24;
    const directions: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const direction = directions[event.key];
    if (!direction && event.key !== 'Home') return;
    event.preventDefault();
    event.stopPropagation();
    const last = offsetRef.current;
    shift(direction ? { x: last.x + direction.x, y: last.y + direction.y } : home);
  }

  return { dragging, style: enabled ? { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` } : undefined,
    gripProps: { onPointerDown: begin, onPointerMove: move, onPointerUp: finish, onPointerCancel: finish, onLostPointerCapture: finish, onKeyDown: keyboard },
    reset: () => shift(home) };
}

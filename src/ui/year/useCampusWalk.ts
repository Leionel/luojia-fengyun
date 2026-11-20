'use client';

import { useEffect, useRef, useState } from 'react';
import { distance, start, toward, walkable, type Point } from '../../year/view/exploration';
import type { PlaceId } from '../../year/model';

export type WalkTarget = {
  id: string; point: Point; label: string; kind: 'door' | 'person' | 'station' | 'task' | 'choice';
  run: (opener: HTMLElement | null) => void;
  unavailable?: boolean;
  patrol?: { pace: number; phase: number; span: number };
};
const inputKeys: Record<string, Point> = {
  KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 }, KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
  KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
};
const radius = 6.8;

function placeElement(element: HTMLElement | null | undefined, position: Point, moving: boolean, face: number) {
  if (!element) return;
  element.style.left = `${position.x}%`;
  element.style.top = `${position.y}%`;
  element.style.setProperty('--walk-depth', String(Math.ceil(position.y)));
  element.style.setProperty('--walk-face', String(face));
  element.dataset.moving = String(moving);
}

export function useCampusWalk(targets: WalkTarget[], scene: PlaceId) {
  const player = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const position = useRef(start);
  const actual = useRef(new Map<string, Point>());
  const controls = useRef(new Set<string>());
  const goal = useRef<{ point: Point; target?: string; opener?: HTMLElement } | null>(null);
  const facing = useRef(1);
  const activeId = useRef<string | null>(null);
  const [nearby, setNearby] = useState<string | null>(null);
  const current = useRef({ targets, scene });
  current.current = { targets, scene };

  function reset(point: Point) {
    position.current = point;
    controls.current.clear();
    goal.current = null;
    actual.current.clear();
    activeId.current = null;
    setNearby(null);
    placeElement(player.current, point, false, facing.current);
  }

  function pointAt(id: string, fallback: Point) {
    return actual.current.get(id) ?? fallback;
  }

  function activate(id: string, opener: HTMLElement | null) {
    const target = current.current.targets.find(item => item.id === id);
    if (target && !target.unavailable && distance(position.current, pointAt(id, target.point)) <= radius) {
      goal.current = null;
      target.run(opener);
      return true;
    }
    return false;
  }

  function walkTo(target: WalkTarget, opener: HTMLElement) {
    if (!activate(target.id, opener)) goal.current = { point: target.point, target: target.id, opener };
  }

  function moveTo(point: Point) {
    goal.current = { point: walkable(point, current.current.scene) };
  }

  function hold(key: string, active: boolean) {
    if (active) {
      const direction = inputKeys[key];
      if (direction && !controls.current.has(key)) {
        const point = position.current;
        position.current = toward(point, { x: point.x + direction.x * 100, y: point.y + direction.y * 100 * 16 / 9 }, .04, current.current.scene);
      }
      controls.current.add(key);
      goal.current = null;
    } else controls.current.delete(key);
  }

  useEffect(() => {
    const interactive = (event: KeyboardEvent) =>
      Boolean((event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]'));
    function keydown(event: KeyboardEvent) {
      if (interactive(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (inputKeys[event.code]) {
        event.preventDefault();
        hold(event.code, true);
      } else if (event.code === 'KeyE' && !event.repeat && activeId.current) {
        event.preventDefault();
        activate(activeId.current, document.activeElement as HTMLElement | null);
      }
    }
    function keyup(event: KeyboardEvent) { hold(event.code, false); }
    function stop() { controls.current.clear(); goal.current = null; }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let time = 0;
    function animate(now: number) {
      const dt = last ? Math.min(.048, (now - last) / 1000) : 0;
      last = now;
      const props = current.current;
      const paused = document.hidden || Boolean(document.querySelector('dialog[open]'));
      if (!paused) time += dt;
      for (const target of props.targets) {
        if (!target.patrol) continue;
        const turn = time * target.patrol.pace + target.patrol.phase;
        const p = media.matches ? target.point : walkable({
          x: target.point.x + Math.sin(turn) * target.patrol.span,
          y: target.point.y + Math.sin(turn * .8) * target.patrol.span * .58,
        }, props.scene);
        actual.current.set(target.id, p);
        placeElement(nodes.current.get(target.id), p, !paused && !media.matches && Math.abs(Math.cos(turn)) > .4, Math.cos(turn) > 0 ? 1 : -1);
      }
      const before = position.current;
      const walkingAcrossScene = controls.current.size > 0 || Boolean(goal.current && !goal.current.target);
      if (!paused && controls.current.size) {
        let x = 0, y = 0;
        for (const key of controls.current) {
          const direction = inputKeys[key];
          if (direction) { x += direction.x; y += direction.y; }
        }
        if (x || y) position.current = toward(before, { x: before.x + x * 100, y: before.y + y * 100 * 16 / 9 }, dt, props.scene);
      } else if (!paused && goal.current) {
        const queued = goal.current;
        const target = queued.target && props.targets.find(item => item.id === queued.target);
        if (queued.target && !target) goal.current = null;
        else if (target && activate(target.id, queued.opener ?? null)) goal.current = null;
        else {
          const destination = target ? pointAt(target.id, target.point) : queued.point;
          position.current = toward(before, destination, dt, props.scene);
          if (!target && distance(position.current, destination) < .1) goal.current = null;
        }
      }
      const point = position.current;
      const moving = distance(before, point) > .015;
      if (!paused && moving && walkingAcrossScene) {
        const door = props.targets.find(target => target.kind === 'door' &&
          distance(point, target.point) <= 2.5 && distance(point, target.point) < distance(before, target.point));
        if (door) {
          door.run(null);
          frame = requestAnimationFrame(animate);
          return;
        }
      }
      if (Math.abs(before.x - point.x) > .025) facing.current = point.x > before.x ? 1 : -1;
      placeElement(player.current, point, moving, facing.current);
      let next: string | null = null;
      let best = radius;
      for (const item of props.targets) {
        if (item.unavailable) continue;
        const gap = distance(point, pointAt(item.id, item.point));
        const score = gap - (item.kind === 'task' || item.kind === 'choice' ? 1.3 : 0);
        if (gap <= radius && score < best) { best = score; next = item.id; }
      }
      if (next !== activeId.current) { activeId.current = next; setNearby(next); }
      frame = requestAnimationFrame(animate);
    }
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
    };
    // Long-lived listeners read the current targets and scene through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { player, nodes, nearby, reset, activate, walkTo, moveTo, hold };
}

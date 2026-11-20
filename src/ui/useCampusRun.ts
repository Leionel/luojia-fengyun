'use client';

import { useEffect, useRef, useState } from 'react';
import { responseSchema } from '../game/contracts';
import { legalDecisions } from '../game/events';
import type { ActionId, GameState, Mode, RunMode, ScenarioId } from '../game/model';
import { commitDirector, directorRequest, initialState, respondToIncident, takeAction } from '../game/rules';
import { commitLocalDirector, restoreRun, serializeRun, storageKey } from '../game/save';

export type RunOptions = { startingMode: RunMode; startingSeed: string; startingScenario: ScenarioId; liveAvailable: boolean; allowResume: boolean };

export function useCampusRun({ startingMode, startingSeed, startingScenario, liveAvailable, allowResume }: RunOptions) {
  const [state, setState] = useState(() => initialState(startingSeed, 'preview', startingScenario));
  const [started, setStarted] = useState(false);
  const [runMode, setRunMode] = useState(startingMode);
  const [restored, setRestored] = useState(false);
  const [useOffer, setUseOffer] = useState(true);
  const current = useRef(state);
  const active = useRef<AbortController | null>(null);

  function persist(next: GameState, mode: RunMode) {
    current.current = next;
    setState(next);
    try {
      localStorage.setItem(storageKey, serializeRun(next, mode));
    } catch {
      // A browser without local storage can still finish the current session.
    }
  }

  useEffect(() => {
    if (allowResume) {
      try {
        const encoded = localStorage.getItem(storageKey);
        const saved = encoded && restoreRun(encoded);
        if (saved) {
          const savedMode = liveAvailable ? saved.mode : 'demo';
          setRunMode(savedMode);
          setStarted(true);
          setRestored(true);
          persist(saved.state, savedMode);
        }
      } catch {
        // The entrance remains available if storage is blocked.
      }
    }
    return () => {
      active.current?.abort();
      active.current = null;
    };
  }, [allowResume, liveAvailable]);

  function begin(seed: string, scenario: ScenarioId, mode: RunMode) {
    active.current?.abort();
    active.current = null;
    setRunMode(mode);
    setRestored(false);
    setUseOffer(true);
    setStarted(true);
    persist(initialState(seed, globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2), scenario), mode);
  }

  function respond(index: 0 | 1) {
    const next = respondToIncident(current.current, index);
    if (next !== current.current) persist(next, runMode);
  }

  function finishWithRules(pending: GameState, mode: Mode) {
    setUseOffer(true);
    persist(commitLocalDirector(pending, mode), runMode);
  }

  async function chooseAction(id: ActionId) {
    if (!started) return;
    const previous = current.current;
    const next = takeAction(previous, id, useOffer);
    if (next === previous) return;
    setRestored(false);
    persist(next, runMode);
    if (next.phase !== 'directing') return;
    const request = directorRequest(next);
    if (runMode === 'demo' || legalDecisions(request.snapshot).length === 1) {
      finishWithRules(next, 'demo');
      return;
    }

    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 6100);
    try {
      const response = await fetch('/api/campus/director', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal,
      });
      if (!response.ok) throw new Error('Director unavailable');
      const result = responseSchema.parse(await response.json());
      if (active.current !== controller) return;
      const committed = commitDirector(current.current, result);
      if (committed === current.current) throw new Error('Director response rejected');
      setUseOffer(true);
      persist(committed, runMode);
    } catch {
      if (active.current === controller) finishWithRules(next, 'fallback');
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) active.current = null;
    }
  }

  function skipDirector() {
    if (current.current.phase !== 'directing') return;
    active.current?.abort();
    active.current = null;
    finishWithRules(current.current, 'fallback');
  }

  const mode: Mode = state.incident?.mode === 'fallback' ? 'fallback' : runMode;
  return { state, started, runMode, mode, restored, begin, respond, chooseAction, skipDirector, useOffer, setUseOffer };
}

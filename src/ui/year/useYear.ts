'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { directorReplySchema } from '../../year/commands';
import { newWorld } from '../../year/content/scenarios';
import { execute, makeCommand, quietWindow } from '../../year/engine/reducer';
import { windowAt } from '../../year/calendar';
import type { Action, CampaignOrigin } from '../../year/model';
import { addArchive, loadArchive, readArchives, storeCommand } from '../../year/storage/idb';
import { copyArchive, decode, encode, type Archive, type Mode } from '../../year/storage/replay';
import { directorInput } from '../../year/view/directorInput';

export function useYear() {
  const [archive, setArchive] = useState<Archive | null>(null);
  const [saves, setSaves] = useState<Awaited<ReturnType<typeof readArchives>>>([]);
  const [transient, setTransient] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<AbortController | null>(null);
  const commitGuard = useRef(false);
  const refreshList = useCallback(async () => { setSaves(await readArchives()); }, []);

  useEffect(() => {
    void refreshList().catch(error => setError(error.message));
    return () => { active.current?.abort(); active.current = null; };
  }, [refreshList]);

  const report = (e: unknown) => setError(e instanceof Error ? e.message : '发生了未预期的错误');

  async function withWrite(task: () => Promise<void>) {
    if (commitGuard.current || active.current) return;
    commitGuard.current = true;
    setBusy(true);
    setError('');
    try { await task(); } catch (e) { report(e); }
    finally { commitGuard.current = false; setBusy(false); }
  }

  function start(seed: string, mode: Mode, memory = false, origin?: CampaignOrigin, opening?: Extract<Action, {kind: 'choose'}>) {
    return withWrite(async () => {
      const id = crypto.randomUUID();
      const world = newWorld(id, seed, origin);
      const next: Archive = { world, mode, receipts: [] };
      if (opening) {
        const outcome = execute(world, makeCommand(world, crypto.randomUUID(), opening));
        if (!outcome.ok) throw new Error(outcome.message);
        next.world = outcome.world;
        next.receipts = [outcome.receipt];
      }
      if (!memory) await addArchive(next);
      setTransient(memory);
      setArchive(next);
    });
  }

  function open(id: string) {
    return withWrite(async () => {
      setArchive(await loadArchive(id));
      setTransient(false);
    });
  }

  function upgrade() {
    if (!archive || archive.world.ended || archive.world.campaign) return;
    const current = archive;
    return withWrite(async () => {
      const copy = copyArchive(current, crypto.randomUUID());
      const result = execute(copy.world, makeCommand(copy.world, crypto.randomUUID(), { kind: 'enable-campaign' }));
      if (!result.ok) throw new Error(result.message);
      const next = { ...copy, world: result.world, receipts: [...copy.receipts, result.receipt] };
      if (!transient) await addArchive(next);
      setArchive(next);
    });
  }

  function importFrom(file: File) {
    return withWrite(async () => {
      if (file.size > 2_000_000) throw new Error('存档体积超过可读上限');
      const loaded = decode(await file.text());
      const items = await readArchives();
      const next = items.some(item => item.id === loaded.world.yearId) ? copyArchive(loaded, crypto.randomUUID()) : loaded;
      await addArchive(next);
      setArchive(next);
      setTransient(false);
    });
  }

  function download() {
    if (!archive) return;
    const object = URL.createObjectURL(new Blob([encode(archive)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = object;
    link.download = `campus-year-${archive.world.seed}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(object), 1000);
  }

  function submit(action: Action) {
    if (!archive) return;
    const current = archive;
    return withWrite(async () => {
      setArchive(await commit(current, action));
    });
  }

  async function commit(current: Archive, action: Action) {
    const command = makeCommand(current.world, crypto.randomUUID(), action);
    if (!transient) return storeCommand(current, command);
    const outcome = execute(current.world, command);
    if (!outcome.ok) throw new Error(outcome.message);
    return { ...current, world: outcome.world, receipts: [...current.receipts, outcome.receipt] };
  }

  function fastForward() {
    if (!archive) return;
    const start = archive;
    return withWrite(async () => {
      let current = start;
      const chapter = windowAt(start.world.window).chapter.id;
      while (quietWindow(current.world) && windowAt(current.world.window).chapter.id === chapter) {
        current = await commit(current, { kind: 'advance' });
        setArchive(current);
      }
    });
  }

  async function advance() {
    if (!archive || active.current || commitGuard.current) return;
    if (archive.mode !== 'live') { await submit({ kind: 'advance' }); return; }
    const input = directorInput(archive.world);
    if (!input.options.length) { await submit({ kind: 'advance' }); return; }
    const controller = new AbortController();
    active.current = controller;
    setWaiting(true);
    setError('');
    const timeout = setTimeout(() => controller.abort(), 6100);
    let action: Action = { kind: 'advance', fallback: true };
    try {
      const reply = await fetch('/api/campus/year/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: controller.signal,
      });
      if (reply.ok) {
        const parsed = directorReplySchema.safeParse(await reply.json());
        if (parsed.success && parsed.data.status === 'live' && parsed.data.yearId === input.yearId &&
            parsed.data.revision === input.revision && parsed.data.basisDigest === input.basisDigest && parsed.data.selection) {
          action = { kind: 'advance', selection: parsed.data.selection };
        }
      }
    } catch { /* The same window is still available for ordinary rule resolution. */ }
    finally {
      clearTimeout(timeout);
      if (active.current === controller) {
        active.current = null;
        setWaiting(false);
        await submit(action);
      }
    }
  }

  function skip() {
    if (!active.current) return;
    active.current.abort();
    active.current = null;
    setWaiting(false);
    void submit({ kind: 'advance', fallback: true });
  }

  function returnToMenu() {
    if (busy || waiting) return;
    setArchive(null);
    setError('');
    void refreshList().catch(report);
  }

  return { archive, saves, transient, busy, waiting, error, start, open, upgrade, importFrom, download, submit, advance, skip, fastForward, returnToMenu };
}

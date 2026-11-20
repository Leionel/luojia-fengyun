import { contentVersion, rulesVersion, type CampaignOrigin, type Command, type Receipt, type World } from '../model';
import { execute } from '../engine/reducer';
import { digest } from '../view/digest';
import { genesis, replay, type Archive, type Mode } from './replay';

type Head = { id: string; updated: number; seed: string; mode: Mode; revision: number; world: World; digest: string; rules: string; content: string; origin?: CampaignOrigin };
type StoredReceipt = { yearId: string; id: string; receipt: Receipt };
const ledger = ['years', 'receipts', 'snapshots'];
let connection: Promise<IDBDatabase> | undefined;

function db() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('campus-chaos-academic-year', 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('years', { keyPath: 'id' });
      database.createObjectStore('receipts', { keyPath: ['yearId', 'id'] }).createIndex('byYear', 'yearId');
      database.createObjectStore('snapshots', { keyPath: ['yearId', 'revision'] });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
    request.onerror = () => reject(new Error('浏览器无法打开年度存档'));
    request.onblocked = () => reject(new Error('另一个标签页正在占用存档，请关闭它再试'));
  }).catch(error => { connection = undefined; throw error; });
  return connection;
}

function head(archive: Archive): Head {
  const { world, mode } = archive;
  return { id: world.yearId, seed: world.seed, mode, revision: world.revision, world, origin: genesis(world),
    digest: digest(world), updated: Date.now(), rules: rulesVersion, content: contentVersion };
}

export async function readArchives(): Promise<{ id: string; window: number; ended: boolean; origin?: CampaignOrigin }[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const query = database.transaction('years').objectStore('years').getAll();
    query.onsuccess = () => resolve((query.result as Head[]).sort((a, b) => b.updated - a.updated)
      .map(item => ({ id: item.id, window: item.world?.window ?? 1, ended: Boolean(item.world?.ended), origin: item.world?.campaign?.origin })));
    query.onerror = () => reject(new Error('无法读取年度档案列表'));
  });
}

export async function loadArchive(id: string): Promise<Archive> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const storage = database.transaction(['years', 'receipts']);
    const stored = storage.objectStore('years').get(id);
    const trail = storage.objectStore('receipts').index('byYear').getAll(id);
    storage.oncomplete = () => {
      try {
        const header = stored.result as Head | undefined;
        if (!header) throw new Error('找不到这份年度档案');
        if (header.rules !== rulesVersion || header.content !== contentVersion) throw new Error('档案来自另一个规则版本，请用原版本导出');
        const records = (trail.result as StoredReceipt[]).map(row => row.receipt).sort((a, b) => a.command.expectedRevision - b.command.expectedRevision);
        if (records.length !== header.revision) throw new Error('档案缺少行动收据，请导入之前导出的年度 JSON');
        const restored = replay(id, header.seed, records, header.origin);
        const recovered = digest(header.world) !== header.digest || digest(restored.world) !== header.digest;
        resolve({ ...restored, recovered, mode: header.mode });
      } catch (error) { reject(error); }
    };
    storage.onabort = () => reject(new Error('读取档案中断'));
  });
}

export async function addArchive(archive: Archive) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction(ledger, 'readwrite');
    const { world, receipts } = archive;
    tx.objectStore('years').add(head(archive));
    for (const receipt of receipts) tx.objectStore('receipts').add({ yearId: world.yearId, id: receipt.command.id, receipt });
    tx.objectStore('snapshots').put({ yearId: world.yearId, revision: world.revision, world, digest: digest(world) });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(new Error('档案已存在或写入失败，当前进度未被覆盖'));
  });
}

export async function storeCommand(archive: Archive, command: Command): Promise<Archive> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const { yearId } = command;
    const tx = database.transaction(ledger, 'readwrite');
    const years = tx.objectStore('years');
    const receipts = tx.objectStore('receipts');
    const saved = years.get(yearId);
    const previous = receipts.get([yearId, command.id]);
    let next = archive;
    let message = '';
    let reload = false;
    const write = () => {
      if (saved.readyState !== 'done' || previous.readyState !== 'done') return;
      const current = saved.result as Head | undefined;
      const prior = previous.result as StoredReceipt | undefined;
      if (!current) { message = '档案不存在'; return; }
      if (prior) {
        if (digest(prior.receipt.command) !== digest(command)) message = '同一编号已用于另一项行动';
        else reload = true;
        return;
      }
      if (current.revision !== command.expectedRevision || current.digest !== command.basisDigest) {
        const known = archive.recovered && current.revision === command.expectedRevision;
        if (!known) { message = '另一个标签页已经推进。读取最新进度后再决定。'; return; }
      }
      const result = execute(archive.world, command);
      if (!result.ok) { message = result.message; return; }
      next = { world: result.world, mode: archive.mode, receipts: [...archive.receipts, result.receipt] };
      years.put(head(next));
      receipts.add({ yearId, id: command.id, receipt: result.receipt });
      if (next.world.revision % 8 === 0 || next.world.ended || result.receipt.events.some(event => event.type === 'chapter')) {
        tx.objectStore('snapshots').put({ yearId, revision: next.world.revision, world: next.world, digest: result.receipt.digest });
      }
    };
    saved.onsuccess = previous.onsuccess = write;
    tx.oncomplete = () => {
      if (message) reject(new Error(message));
      else if (reload) resolve(loadArchive(yearId));
      else resolve(next);
    };
    tx.onabort = () => reject(new Error('保存失败，本次行动已撤销'));
  });
}

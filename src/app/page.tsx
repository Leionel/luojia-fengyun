import { redirect } from 'next/navigation';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const legacy = params.legacy === '1';
  const query = new URLSearchParams();
  for (const name of ['seed', 'scenario', 'mode']) if (typeof params[name] === 'string') query.set(name, params[name]);
  redirect(`${legacy ? '/campus-chaos' : '/campus-chaos/year'}${query.size ? `?${query}` : ''}`);
}

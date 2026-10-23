import { redirect } from 'next/navigation';
import { SignOutForm } from '@/components/auth/auth-form';
import { currentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { loadSnapshot, type Snapshot } from '@/lib/study/data';
import { Workspace } from '@/components/study/workspace';
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect('/sign-in?next=/home');
  let initial: Snapshot | null = null;
  try { initial = await loadSnapshot(await createClient()); } catch { /* Recover through explicit synchronization without inventing empty progress. */ }
  return <Workspace userId={user.id} email={user.email ?? 'Your account'} initial={initial} signOut={<SignOutForm />} />;
}

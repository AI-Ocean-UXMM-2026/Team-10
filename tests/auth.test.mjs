import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server.js';
import { safeNext, validate, isRecentRecovery, authError } from '../src/lib/auth/policy.ts';

const form = (values) => {
  const result = new FormData();
  Object.entries(values).forEach(([key, value]) => result.set(key, value));
  return result;
};
const credentials = { email: 'student@example.com', password: 'a long passphrase', confirmPassword: 'a long passphrase' };
const now = Math.floor(Date.now() / 1000);
const claims = { sub: 'student-id', exp: now + 3600, amr: [{ method: 'recovery', timestamp: now }] };
const redirect = (url) => { throw new Error(`REDIRECT:${url}`); };

// Execute the actual server modules with controlled external Auth/Next boundaries.
// These tests establish application behavior, not Supabase service correctness.
async function load(relative, mocks) {
  const context = vm.createContext({ console, URL, FormData, Date, fetch, process });
  const cache = new Map();
  async function moduleFor(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const source = await readFile(filename, 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    }}).outputText;
    const sourceModule = new vm.SourceTextModule(output, { context, identifier: filename });
    cache.set(filename, sourceModule);
    await sourceModule.link(async (specifier, referencing) => {
      if (Object.hasOwn(mocks, specifier)) {
        const exports = mocks[specifier];
        const mock = new vm.SyntheticModule(Object.keys(exports), function () {
          Object.entries(exports).forEach(([key, value]) => this.setExport(key, value));
        }, { context });
        return mock;
      }
      const base = specifier.startsWith('@/') ? path.resolve('src', specifier.slice(2)) : path.resolve(path.dirname(referencing.identifier), specifier);
      return moduleFor(base + (base.endsWith('.ts') ? '' : '.ts'));
    });
    return sourceModule;
  }
  const result = await moduleFor(path.resolve(relative));
  await result.evaluate();
  return result.namespace;
}

async function actions(auth = {}, allowed = true) {
  return load('src/app/auth/actions.ts', {
    'next/headers': { headers: async () => new Headers({ origin: 'http://localhost:3000' }) },
    'next/navigation': { redirect },
    'next/cache': { revalidatePath() {} },
    '@/lib/supabase/server': { createClient: async () => ({ auth }) },
    '@/lib/auth/session': { recoveryAllowed: async () => allowed },
  });
}

test('redirect allowlist rejects external, protocol-relative and encoded destinations', () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil', '/%2f%2fevil', '/auth/callback', '/home?next=https://evil.example', null]) assert.equal(safeNext(value), '/home');
  assert.equal(safeNext('/home'), '/home');
});

test('validation checks email, new password length, confirmation, and preserves password whitespace', () => {
  assert.equal(validate(form(credentials), 'register').valid, true);
  assert.equal(validate(form({ ...credentials, email: '  student@example.com ' }), 'register').email, 'student@example.com');
  assert.equal(validate(form({ ...credentials, password: ' short ', confirmPassword: 'different' }), 'register').valid, false);
  assert.ok(validate(form({ email: 'invalid' }), 'forgot-password').fields.email);
  assert.equal(validate(form({ ...credentials, password: 'old' }), 'sign-in').valid, true);
  assert.equal(validate(form({ ...credentials, password: ' '.repeat(129) }), 'sign-in').valid, false);
  assert.equal(validate(form({ ...credentials, password: '  preserved phrase  ' }), 'sign-in').password, '  preserved phrase  ');
});

test('recovery requires fresh, unexpired, verified recovery claims, not ordinary login or metadata', () => {
  assert.equal(isRecentRecovery(claims, now), true);
  for (const bad of [undefined, {}, { ...claims, exp: now }, { ...claims, amr: [{ method: 'password', timestamp: now }] }, { ...claims, amr: [{ method: 'recovery', timestamp: now - 901 }] }, { ...claims, amr: [{ method: 'recovery', timestamp: now + 100 }] }, { ...claims, amr: ['recovery'] }, { ...claims, amr: [], user_metadata: { recovery: true } }]) assert.equal(isRecentRecovery(bad, now), false);
});

test('provider errors are safe and offer feedback for confirmation, credentials and throttling', () => {
  assert.match(authError({ code: 'email_not_confirmed' }), /Confirm your email/);
  assert.match(authError({ code: 'invalid_credentials' }), /incorrect/);
  assert.match(authError({ status: 429 }), /wait/);
  assert.doesNotMatch(authError({ message: 'secret-token' }), /secret-token/);
});

test('invalid forms never invoke authentication', async () => {
  const auth = await actions();
  for (const action of [auth.signIn, auth.register, auth.forgotPassword, auth.resetPassword]) assert.ok((await action({}, new FormData())).error);
});

test('successful sign-in redirects home and failed sign-in shows no success', async () => {
  let auth = await actions({ signInWithPassword: async () => ({ error: null }) });
  await assert.rejects(auth.signIn({}, form({ ...credentials, next: '//evil.example' })), /REDIRECT:\/home/);
  auth = await actions({ signInWithPassword: async () => ({ error: { code: 'invalid_credentials' } }) });
  assert.match((await auth.signIn({}, form(credentials))).error, /incorrect/);
});

test('registration distinguishes confirmation pending, immediate session and provider failure', async () => {
  let auth = await actions({ signUp: async () => ({ data: { session: null }, error: null }) });
  assert.match((await auth.register({}, form(credentials))).message, /confirmation link/);
  auth = await actions({ signUp: async () => ({ data: { session: {} }, error: null }) });
  await assert.rejects(auth.register({}, form(credentials)), /REDIRECT:\/home/);
  auth = await actions({ signUp: async () => ({ error: { status: 500 } }) });
  assert.ok((await auth.register({}, form(credentials))).error);
});

test('recovery request gives identical confirmation for known/unknown accounts and reports outages', async () => {
  const known = await actions({ resetPasswordForEmail: async () => ({ error: null }) });
  const unknown = await actions({ resetPasswordForEmail: async () => ({ error: { code: 'user_not_found', status: 400 } }) });
  assert.equal((await known.forgotPassword({}, form(credentials))).message, (await unknown.forgotPassword({}, form(credentials))).message);
  const unavailable = await actions({ resetPasswordForEmail: async () => { throw new Error('private service detail'); } });
  assert.ok((await unavailable.forgotPassword({}, form(credentials))).error);
});

test('password update is denied without verified recovery, even for valid input', async () => {
  const auth = await actions({ updateUser: async () => { assert.fail('must not update'); } }, false);
  assert.match((await auth.resetPassword({}, form(credentials))).error, /invalid or expired/);
});

test('password update success ends local session and returns to sign-in', async () => {
  const auth = await actions({ updateUser: async () => ({ error: null }), signOut: async ({ scope }) => {
    assert.equal(scope, 'local'); return { error: null };
  }});
  await assert.rejects(auth.resetPassword({}, form(credentials)), /REDIRECT:\/sign-in\?message=password-updated/);
});

test('password update failures and ambiguous response loss never claim success', async () => {
  let auth = await actions({ updateUser: async () => ({ error: { code: 'weak_password' } }) });
  assert.ok((await auth.resetPassword({}, form(credentials))).error);
  auth = await actions({ updateUser: async () => { throw new Error('lost response'); } });
  assert.match((await auth.resetPassword({}, form(credentials))).error, /may have changed/);
});

test('sign-out redirects only after success and shows retry on failure', async () => {
  let auth = await actions({ signOut: async () => ({ error: null }) });
  await assert.rejects(auth.signOut(), /REDIRECT:\/sign-in/);
  auth = await actions({ signOut: async () => ({ error: { status: 500 } }) });
  assert.match((await auth.signOut()).error, /try again/);
});

test('recovery protection verifies identity and claims and fails closed on service errors', async () => {
  async function session(auth) {
    return load('src/lib/auth/session.ts', { 'server-only': {}, '@/lib/supabase/server': { createClient: async () => ({ auth }) } });
  }
  const good = await session({ getUser: async () => ({ data: { user: { id: 'student-id' } }, error: null }), getClaims: async () => ({ data: { claims }, error: null }) });
  assert.equal(await good.recoveryAllowed(), true);
  const mismatch = await session({ getUser: async () => ({ data: { user: { id: 'other' } } }), getClaims: async () => ({ data: { claims } }) });
  assert.equal(await mismatch.recoveryAllowed(), false);
  const offline = await session({ getUser: async () => { throw new Error('offline'); }, getClaims: async () => { throw new Error('offline'); } });
  assert.equal(await offline.recoveryAllowed(), false);
  assert.equal(await offline.currentUser(), null);
});

for (const route of ['callback', 'confirm']) {
  test(`${route} accepts verified flows, rejects invalid links, and restricts redirects`, async () => {
    async function handler(auth) {
      return load(`src/app/auth/${route}/route.ts`, {
        'next/server': { NextResponse }, '@/lib/supabase/server': { createClient: async () => ({ auth }) },
      });
    }
    const query = route === 'callback' ? 'code=example' : 'token_hash=example&type=email';
    let api = await handler({ exchangeCodeForSession: async () => ({ error: null }), verifyOtp: async () => ({ error: null }), getClaims: async () => ({ data: { claims }, error: null }) });
    let result = await api.GET(new NextRequest(`http://localhost:3000/auth/${route}?${query}&next=https://evil.example`));
    assert.equal(result.headers.get('location'), route === 'callback' ? 'http://localhost:3000/reset-password' : 'http://localhost:3000/home');
    api = await handler({ exchangeCodeForSession: async () => ({ error: {} }), verifyOtp: async () => ({ error: {} }) });
    result = await api.GET(new NextRequest(`http://localhost:3000/auth/${route}?${query}`));
    assert.equal(result.headers.get('location'), 'http://localhost:3000/auth/error');
    result = await api.GET(new NextRequest(`http://localhost:3000/auth/${route}`));
    assert.equal(result.headers.get('location'), 'http://localhost:3000/auth/error');
  });
}

test('protected Home denies visitors at the page boundary and only renders verified email', async () => {
  const jsx = (type, props) => ({ type, props });
  async function home(user) {
    return load('src/app/(account)/home/page.tsx', {
      'next/navigation': { redirect }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
      '@/components/auth/auth-form': { SignOutForm() {} }, '@/lib/auth/session': { currentUser: async () => user },
      '@/components/study/workspace': { Workspace() {} }, '@/lib/supabase/server': { createClient: async () => ({}) }, '@/lib/study/data': { loadSnapshot: async () => null },
    });
  }
  await assert.rejects((await home(null)).default(), /REDIRECT:\/sign-in\?next=\/home/);
  assert.match(JSON.stringify(await (await home({ email: 'student@example.com' })).default()), /student@example.com/);
});

test('Proxy passes refreshed cookies to request and response and blocks shared caching', async () => {
  const api = await load('src/proxy.ts', {
    'next/server': { NextResponse }, '@/lib/supabase/config': { cookieOptions: {}, supabaseConfig: () => ({ url: 'https://example.supabase.co', key: 'public-key' }) },
    '@supabase/ssr': { createServerClient: (_url, _key, options) => ({ auth: { getClaims: async () => {
      options.cookies.setAll([{ name: 'session', value: 'refreshed', options: { path: '/', maxAge: 3600, sameSite: 'lax' } }], { 'Cache-Control': 'private, no-store' });
      return { data: { claims } };
    } } }) },
  });
  const request = new NextRequest('http://localhost:3000/home');
  const response = await api.proxy(request);
  assert.equal(request.cookies.get('session').value, 'refreshed');
  assert.equal(response.cookies.get('session').value, 'refreshed');
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('server client waits for a real request before initializing auth and retains cookie behavior', async () => {
  let allowRequest;
  const requestReady = new Promise(resolve => { allowRequest = resolve; });
  let initialized = false;
  const writes = [];
  const existingCookie = { name: 'session', value: 'existing-session' };
  const api = await load('src/lib/supabase/server.ts', {
    'server-only': {},
    'next/server': { connection: () => requestReady },
    'next/headers': { cookies: async () => ({
      getAll: () => [existingCookie],
      set: (...args) => writes.push(args),
    }) },
    './config': { cookieOptions: {}, supabaseConfig: () => ({ url: 'https://example.supabase.co', key: 'public-key' }) },
    '@supabase/ssr': { createServerClient: (_url, _key, options) => {
      initialized = true;
      return { options };
    } },
  });
  const clientPromise = api.createClient();
  await Promise.resolve();
  assert.equal(initialized, false, 'auth must not initialize during prerendering');
  allowRequest();
  const { options } = await clientPromise;
  assert.equal(initialized, true);
  assert.equal(options.cookies.getAll()[0], existingCookie);
  options.cookies.setAll([{ name: 'session', value: 'refreshed', options: { path: '/' } }]);
  assert.equal(writes.length, 0, 'rendering must not write cookies');
  const writable = await api.createClient(true);
  writable.options.cookies.setAll([{ name: 'session', value: 'refreshed', options: { path: '/' } }]);
  assert.equal(writes[0][0], 'session');
  assert.equal(writes[0][1], 'refreshed');
});

import assert from 'node:assert/strict';

// Read-only smoke checks. Run against an already-running local instance.
const base = process.env.AUTH_SMOKE_ORIGIN || 'http://localhost:3000';
for (const [route, content] of [['/sign-in', 'Sign in'], ['/register', 'Create your account'], ['/forgot-password', 'Forgot password?'], ['/reset-password', 'Recovery link required']]) {
  const response = await fetch(base + route);
  const body = await response.text();
  assert.equal(response.status, 200, route);
  assert.ok(body.includes(content), route);
  assert.match(response.headers.get('cache-control'), /no-store/);
  console.log(`PASS ${route}: expected screen and no-store headers`);
}
const home = await fetch(base + '/home', { redirect: 'manual' });
const body = await home.text();
assert.ok((home.headers.get('location') ?? body).includes('/sign-in?next='));
assert.ok(!body.includes('You are signed in as'));
console.log('PASS /home: signed-out access redirects without private account content');
for (const route of ['/auth/callback', '/auth/confirm?type=recovery&token_hash=invalid']) {
  const response = await fetch(base + route, { redirect: 'manual' });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('location'), base + '/auth/error');
  console.log(`PASS ${route.split('?')[0]}: invalid link redirects to safe error screen`);
}

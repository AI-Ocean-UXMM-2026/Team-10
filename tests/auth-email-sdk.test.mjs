import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServerClient} from '@supabase/ssr';

const user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.invalid',email_confirmed_at:'2026-10-23T00:00:00Z',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-10-23T00:00:00Z'};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:user.id,exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'otp',timestamp:Math.floor(Date.now()/1000)}]},'synthetic-signature'].map((part,i)=>i<2?Buffer.from(JSON.stringify(part)).toString('base64url'):part).join('.');
const session={access_token:jwt,refresh_token:'synthetic-refresh',token_type:'bearer',expires_in:3600,user};
function client(jar,requests){return createServerClient('https://fixture.invalid','synthetic-public-key',{
  cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>values.forEach(({name,value})=>value?jar.set(name,value):jar.delete(name))},
  global:{fetch:async(input,init)=>{const url=new URL(input);requests.push(url.pathname);let body;
    if(url.pathname.endsWith('/signup'))body={...user,email_confirmed_at:null};
    else if(url.pathname.endsWith('/verify')){assert.deepEqual(JSON.parse(init.body).token_hash,'synthetic-hash');body=session;}
    else if(url.pathname.endsWith('/user'))body=user;
    else assert.fail('Unexpected fake endpoint');
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  }},
});}

test('real Supabase SSR SDK: cross-device PKCE fails but token-hash verification establishes new-device cookies',async()=>{
  const originalJar=new Map(),originalRequests=[];
  const original=client(originalJar,originalRequests);
  const registration=await original.auth.signUp({email:user.email,password:'synthetic-passphrase',options:{emailRedirectTo:'https://app.invalid/auth/callback'}});
  assert.equal(registration.error,null);
  assert.ok([...originalJar.keys()].some(name=>name.includes('code-verifier')));
  const phoneJar=new Map(),phoneRequests=[];
  const phone=client(phoneJar,phoneRequests);
  const exchange=await phone.auth.exchangeCodeForSession('synthetic-code');
  assert.equal(exchange.error?.code,'pkce_code_verifier_not_found');
  assert.equal(phoneRequests.length,0,'PKCE must fail without borrowing another browser verifier');
  const verification=await phone.auth.verifyOtp({token_hash:'synthetic-hash',type:'email'});
  assert.equal(verification.error,null);
  assert.ok([...phoneJar.keys()].some(name=>name.includes('auth-token')),'new device receives its own session cookie');
  const verified=await phone.auth.getClaims();
  assert.equal(verified.error,null);assert.equal(verified.data.claims.sub,user.id);
});

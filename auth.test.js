import test from 'node:test';
import assert from 'node:assert/strict';
import { authorized, sameOrigin } from './auth.js';
const header = text => `Basic ${Buffer.from(text).toString('base64')}`;
test('password-protected demo rejects absent, wrong, and malformed credentials', () => {
 const password='test-password-for-unit-test';
 assert.equal(authorized(undefined,password),false);
 assert.equal(authorized(header('studio:wrong'),password),false);
 assert.equal(authorized(header(`other:${password}`),password),false);
 assert.equal(authorized('Basic !!!',password),false);
 assert.equal(authorized(header(`studio:${password}`),password),true);
});
test('same-origin form requests work through HTTPS hosting and reject other sites',()=>{
 assert(sameOrigin('https://demo.example','demo.example'));
 assert(!sameOrigin('https://evil.example','demo.example'));
 assert(!sameOrigin('null','demo.example'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptKey, decryptKey, publicKeyStatus, safeProviderError } from './credentials.js';
test('saved keys use authenticated encryption and require the original password',()=>{
 const key='sk-unit-test-not-a-real-key';const password='test-password-at-least-16';
 const record=encryptKey(key,password);
 assert(!JSON.stringify(record).includes(key));assert.equal(decryptKey(record,password),key);
 assert.throws(()=>decryptKey(record,'different-password-at-least-16'));
 assert.throws(()=>decryptKey({...record,ciphertext:Buffer.from('tampered').toString('base64')},password));
 assert.notDeepEqual(record,encryptKey(key,password));
 assert.throws(()=>encryptKey(key,'short'));
});
test('key status and provider failures never disclose saved credentials',()=>{
 const key='sk-private-test-key';
 assert(!JSON.stringify(publicKeyStatus({key,source:'app',hasSaved:true,hasEnvironment:false,unreadable:false})).includes(key));
 assert(!safeProviderError(`Invalid key: ${key}`,key).includes(key));
 assert(!safeProviderError('Invalid key: sk-partially***masked',key).includes('sk-'));
});

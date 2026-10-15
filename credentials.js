import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import * as storage from './storage.js';

function encryptionKey(password) {
 if (password.length < 16) throw new Error('Set a login password of at least 16 characters before saving an API key.');
 return scryptSync(password, 'coloring-studio-api-key-v1', 32);
}
export function encryptKey(value, password) {
 const nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',encryptionKey(password),nonce);
 const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return {v:1,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function decryptKey(record,password) {
 if(record.v!==1)throw new Error('Unsupported credential format.');
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey(password),Buffer.from(record.nonce,'base64'));
 decipher.setAuthTag(Buffer.from(record.tag,'base64'));
 return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64')),decipher.final()]).toString('utf8');
}
export async function keyStatus(password) {
 const record=await storage.readCredential();
 let saved='',unreadable=false;
 if(record)try{saved=decryptKey(record,password);}catch{unreadable=true;}
 const environment=process.env.COLORING_API_KEY||'';
 return {key:saved||environment,source:saved?'app':environment?'environment':'none',hasSaved:!!record,hasEnvironment:!!environment,unreadable};
}
export async function saveKey(value,password) {
 if(typeof value!=='string'||value.trim().length<20||value.trim().length>512||!/^sk-[A-Za-z0-9_-]+$/.test(value.trim()))throw new Error('Enter an OpenAI API key starting with sk- (no spaces).');
 await storage.writeCredential(encryptKey(value.trim(),password));
}
export async function removeKey(){await storage.writeCredential(null);}
export function publicKeyStatus(status) {
 return {configured:!!status.key,source:status.source,hasSaved:status.hasSaved,hasEnvironment:status.hasEnvironment,unreadable:status.unreadable};
}
export function safeProviderError(message,key) {
 return String(message).split(key||'\0').join('[redacted]').replace(/sk-[A-Za-z0-9_*.-]+/g,'[redacted]');
}

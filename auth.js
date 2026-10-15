import { createHash, timingSafeEqual } from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest();
export function authorized(header, password) {
  if (!password) return true;
  if (!header?.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const split = decoded.indexOf(':');
  return split >= 0 && timingSafeEqual(digest(decoded.slice(0, split)), digest('studio')) && timingSafeEqual(digest(decoded.slice(split + 1)), digest(password));
}
export function sameOrigin(origin, host) {
  return !origin || origin === `http://${host}` || origin === `https://${host}`;
}

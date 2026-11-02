import { env } from 'cloudflare:workers';

export const COOKIE = 'weeknote_session';
export const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
const unhex = (value: string) => Uint8Array.from(value.match(/.{2}/g) || [], v=>parseInt(v,16));
export const normalizeUsername = (value: unknown) => String(value || '').trim().toLowerCase();
export const validUsername = (value: string) => /^[a-z0-9][a-z0-9._-]{2,31}$/.test(value);
export const validPassword = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
export async function digest(value: string) { return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value))); }
export async function hashPassword(password: string, salt=hex(crypto.getRandomValues(new Uint8Array(32)))) {
 const key = await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits = await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:100000},key,256);
 return `pbkdf2-sha256$100000$${salt}$${hex(bits)}`;
}
export async function verifyPassword(password: string, stored: string) {
 const parts=stored.split('$');if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||parts[1]!=='100000')return false;
 const candidate=await hashPassword(password,parts[2]);let difference=candidate.length^stored.length;
 for(let i=0;i<Math.max(candidate.length,stored.length);i++)difference|=(candidate.charCodeAt(i)||0)^(stored.charCodeAt(i)||0);
 return difference===0;
}
export function sessionToken(h: Headers) { return h.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1) || ''; }
export function cookie(token: string, request: Request, clear=false) {
 return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:SESSION_AGE/1000}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
export async function newSession(member: string) {
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 await env.DB!.batch([env.DB!.prepare('DELETE FROM login_sessions WHERE expires<?').bind(Date.now()),env.DB!.prepare('INSERT INTO login_sessions (hash,member,expires) VALUES (?,?,?)').bind(await digest(token),member,Date.now()+SESSION_AGE)]);
 return token;
}
export async function getMember(request: Request): Promise<any | null> {
 const token=sessionToken(request.headers);if(!/^[a-f0-9]{64}$/.test(token))return null;
 return env.DB!.prepare('SELECT m.*,a.username,a.active FROM login_sessions s JOIN accounts a ON a.member=s.member JOIN members m ON m.id=a.member WHERE s.hash=? AND s.expires>? AND a.active=1 AND m.sample=0').bind(await digest(token),Date.now()).first();
}
export function sameOrigin(request: Request) {return request.headers.get('origin')===new URL(request.url).origin;}
export async function audit(actor:string,target:string,message:string) {await env.DB!.prepare('INSERT INTO admin_events (id,actor,target,message,time) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,target,message,Date.now()).run();}

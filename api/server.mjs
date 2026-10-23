import { createHmac, createHash, randomBytes, timingSafeEqual, scrypt as derive } from 'node:crypto';
import { promisify } from 'node:util';
import { put, get, list, del } from '@vercel/blob';

const scrypt = promisify(derive);
export const config = { maxDuration: 30 };
export const challenges = [
  'Atendimentos, agendamentos ou pós-venda se perdem no WhatsApp e em anotações',
  'Leads, propostas e orçamentos ficam sem acompanhamento e oportunidades se perdem',
  'Pedidos, serviços ou entregas atrasam por falhas na passagem de informações',
  'Compras, estoque e financeiro exigem conferências manuais e geram divergências',
  'Planilhas e sistemas não se integram; o time precisa digitar a mesma informação várias vezes',
  'Tarefas repetitivas, como cadastros, cobranças e relatórios, tomam tempo demais',
  'Processos e responsabilidades pouco claros geram erros, retrabalho e sobrecarga',
  'Faltam indicadores confiáveis para acompanhar custos, produtividade e resultados'
];
const sectors = ['Clínicas e saúde','Escritórios','Energia solar','Agro','Restaurantes','E-commerce','Comércio','Serviços','Outro'];
const teams = ['Só eu','2 a 5','6 a 15','16 a 50','Mais de 50'];
const sources = ['Instagram','LinkedIn','Google','Indicação','E-mail','Outro'];
const statuses = ['Nova','Em contato','Concluída'];
const ID = /^\d{13}-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const SESSION_SECONDS = 8 * 60 * 60;
function error(status, message) { return Object.assign(new Error(message), { status }); }
function authConfig() {
  try {
    const cfg = JSON.parse(process.env.ADMIN_AUTH_CONFIG || '');
    if (!/^[a-f0-9]{32}$/.test(cfg.salt) || !/^[a-f0-9]{64}$/.test(cfg.hash) || !/^[a-f0-9]{64}$/.test(cfg.secret)) throw Error();
    return cfg;
  } catch { throw error(503, 'O atendimento está temporariamente indisponível. Tente novamente em alguns instantes.'); }
}
function equal(a, b) {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
}
function mac(value, cfg) { return createHmac('sha256', cfg.secret).update(value).digest('base64url'); }
function cookieName() { return process.env.NODE_ENV === 'test' ? 'lo_session' : '__Host-lo_session'; }
function cookie(token, age) {
  return `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV === 'test' ? '' : '; Secure'}`;
}
function session(req, cfg) {
  const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);
  if (!raw || raw.length > 1500) return null;
  const [payload, sig, extra] = raw.split('.');
  if (extra || !equal(mac(payload, cfg), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.exp <= Date.now() || data.v !== createHash('sha256').update(cfg.hash).digest('hex').slice(0,16)) return null;
    return { csrf: mac(`csrf:${raw}`, cfg) };
  } catch { return null; }
}
function originCheck(req) {
  const allowed = process.env.NODE_ENV === 'test' ? 'http://127.0.0.1:4174' : 'https://entendo-seu-desafio.vercel.app';
  if (req.headers.origin !== allowed) throw error(403, 'Origem da solicitação não permitida.');
}
function authenticated(req, cfg, mutate = false) {
  const s = session(req, cfg);
  if (!s) throw error(401, 'Entre com a senha da equipe para continuar.');
  if (mutate) {
    originCheck(req);
    if (!equal(s.csrf, req.headers['x-csrf-token'])) throw error(403, 'Sua sessão precisa ser atualizada. Recarregue a página.');
  }
  return s;
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw error(415, 'Envie os dados no formato JSON.');
  let raw = req.body;
  if (raw === undefined) {
    let size = 0; const chunks = [];
    for await (const part of req) {
      size += part.length;
      if (size > 24576) throw error(413, 'O conteúdo enviado é muito grande.');
      chunks.push(part);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)) > 24576) throw error(413, 'O conteúdo enviado é muito grande.');
  try { const data = typeof raw === 'string' ? JSON.parse(raw) : raw; if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
  catch { throw error(400, 'Não foi possível ler os dados enviados.'); }
}
function field(data, key, min, max) {
  const value = typeof data[key] === 'string' ? data[key].trim() : '';
  if (value.length < min || value.length > max) throw error(400, `Confira o campo ${key}.`);
  return value;
}
export function validateSubmission(data, now = Date.now()) {
  if (data.website) throw error(400, 'Não foi possível enviar o formulário.');
  if (data.consentimento !== true) throw error(400, 'Autorize o contato para enviar suas respostas.');
  const result = { nome: field(data,'nome',2,120), empresa: field(data,'empresa',2,160), email: field(data,'email',3,254), telefone: field(data,'telefone',10,22), desafio: field(data,'desafio',15,4000) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw error(400, 'Informe um e-mail válido.');
  if (!/^\+?[\d\s().-]+$/.test(result.telefone) || !/^\d{10,15}$/.test(result.telefone.replace(/\D/g,''))) throw error(400, 'Informe um telefone com DDD.');
  for (const [key, allowed] of [['segmento',sectors],['equipe',teams],['origem',sources],['automacao',['Sim','Não']]]) {
    if (!allowed.includes(data[key])) throw error(400, `Selecione uma opção válida em ${key}.`);
    result[key] = data[key];
  }
  if (!Array.isArray(data.situacao) || data.situacao.length < 1 || data.situacao.length > challenges.length || data.situacao.some(x => !challenges.includes(x))) throw error(400, 'Selecione pelo menos um desafio válido.');
  result.situacao = [...new Set(data.situacao)];
  result.ferramentas = data.automacao === 'Sim' ? field(data,'ferramentas',2,500) : '';
  result.origem_outro = data.origem === 'Outro' ? field(data,'origem_outro',2,500) : '';
  if (!UUID.test(data.submissionId || '') || !Number.isSafeInteger(data.submissionAt) || Math.abs(now - data.submissionAt) > 86400000) throw error(400, 'Atualize a página e envie novamente.');
  result.id = `${String(9999999999999 - data.submissionAt).padStart(13,'0')}-${data.submissionId}`;
  result.createdAt = new Date(now).toISOString();
  result.status = 'Nova'; result.notas = ''; result.consentimento = true;
  return result;
}
const blobStore = {
  async read(path) {
    const result = await get(path, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return { data: await new Response(result.stream).json(), version: result.blob.etag };
  },
  async write(path, data, version) {
    return put(path, JSON.stringify(data), { access: 'private', addRandomSuffix: false, allowOverwrite: Boolean(version), ...(version ? { ifMatch: version } : {}), contentType: 'application/json' });
  },
  async listing(cursor) { return list({ prefix: 'responses/', limit: 50, ...(cursor ? { cursor } : {}) }); },
  async remove(path, version) { return del(path, { ifMatch: version }); }
};
async function rateLimit(store, req, cfg, kind, limit) {
  const ip = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  const window = Math.floor(Date.now() / 900000);
  const key = `limits/${kind}/${mac(String(ip), cfg).slice(0,24)}-${window}.json`;
  const prior = await store.read(key);
  if ((prior?.data.count || 0) >= limit) throw error(429, 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
  try { await store.write(key, { count: (prior?.data.count || 0) + 1 }, prior?.version); }
  catch { throw error(429, 'Outra tentativa está em andamento. Aguarde alguns instantes.'); }
}
export function createHandler(store = blobStore) {
  return async function handler(req, res) {
    const reply = (status, value) => { res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(value)); };
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      const cfg = authConfig();
      const url = new URL(req.url, 'https://entendo-seu-desafio.vercel.app');
      const action = url.searchParams.get('action');
      if (req.method === 'POST' && action === 'login') {
        originCheck(req); const data = await body(req);
        await rateLimit(store, req, cfg, 'login', 8);
        const password = typeof data.password === 'string' ? data.password : '';
        if (password.length > 200 || !equal((await scrypt(password,cfg.salt,32)).toString('hex'),cfg.hash)) throw error(401,'Senha incorreta. Confira e tente novamente.');
        const payload = Buffer.from(JSON.stringify({ exp: Date.now()+SESSION_SECONDS*1000, v: createHash('sha256').update(cfg.hash).digest('hex').slice(0,16), nonce: randomBytes(16).toString('hex') })).toString('base64url');
        const token = `${payload}.${mac(payload,cfg)}`;
        res.setHeader('Set-Cookie',cookie(token,SESSION_SECONDS));
        return reply(200,{ ok:true, csrf:mac(`csrf:${token}`,cfg) });
      }
      if (req.method === 'GET' && action === 'session') return reply(200,authenticated(req,cfg));
      if (req.method === 'POST' && action === 'logout') {
        authenticated(req,cfg,true); res.setHeader('Set-Cookie',cookie('',0)); return reply(200,{ok:true});
      }
      if (req.method === 'POST' && action === 'submit') {
        originCheck(req); const record = validateSubmission(await body(req));
        await rateLimit(store,req,cfg,'submission',20);
        const path = `responses/${record.id}.json`;
        try { await store.write(path,record); }
        catch (err) {
          const exists = await store.read(path);
          if (!exists) throw err;
          const { createdAt, status, notas, updatedAt, ...saved } = exists.data;
          const { createdAt: _, status: __, notas: ___, ...incoming } = record;
          if (JSON.stringify(saved) !== JSON.stringify(incoming)) throw error(409,'Este envio já foi utilizado. Atualize a página para enviar uma nova resposta.');
        }
        return reply(201,{ok:true,reference:record.id});
      }
      if (req.method === 'GET' && action === 'responses') {
        authenticated(req,cfg);
        const cursor=url.searchParams.get('cursor');
        if (cursor && cursor.length>2000) throw error(400,'Página inválida.');
        const page=await store.listing(cursor);
        const records=await Promise.all(page.blobs.map(async item=>{
          const result=await store.read(item.pathname);
          return result ? {...result.data,version:result.version} : null;
        }));
        return reply(200,{responses:records.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),cursor:page.hasMore?page.cursor:null});
      }
      if (['PATCH','DELETE'].includes(req.method) && action==='response') {
        authenticated(req,cfg,true);
        const data=await body(req);
        if (!ID.test(data.id || '')) throw error(400,'Resposta inválida.');
        const path=`responses/${data.id}.json`, saved=await store.read(path);
        if (!saved) throw error(404,'Esta resposta não foi encontrada.');
        if (!data.version || data.version!==saved.version) throw error(409,'A resposta mudou. Atualize o painel antes de salvar.');
        if (req.method==='DELETE') {await store.remove(path,saved.version);return reply(200,{ok:true});}
        if (!statuses.includes(data.status) || typeof data.notas!=='string' || data.notas.length>2000) throw error(400,'Confira o status e as anotações.');
        try { await store.write(path,{...saved.data,status:data.status,notas:data.notas.trim(),updatedAt:new Date().toISOString()},saved.version); }
        catch (err) { if (err.name==='BlobPreconditionFailedError') throw error(409,'Outra pessoa atualizou esta resposta. Recarregue o painel.'); throw err; }
        return reply(200,{ok:true});
      }
      throw error(404,'Rota não encontrada.');
    } catch (err) {
      if (!err.status) console.error('responses_api_failure',{name:err.name});
      if (err.status===429) res.setHeader('Retry-After','900');
      return reply(err.status || 503,{error:err.status?err.message:'Não foi possível concluir agora. Tente novamente em alguns instantes.'});
    }
  };
}
export default createHandler();

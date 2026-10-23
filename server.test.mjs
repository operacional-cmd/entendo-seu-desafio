import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync, randomUUID } from 'node:crypto';
import { createHandler, validateSubmission, challenges } from './api/server.mjs';

process.env.NODE_ENV='test';
const salt='a'.repeat(32),password='Local-test-only-password';
process.env.ADMIN_AUTH_CONFIG=JSON.stringify({salt,hash:scryptSync(password,salt,32).toString('hex'),secret:'b'.repeat(64)});
const sample=()=>({nome:'Pessoa de Teste',empresa:'Empresa Exemplo',email:'teste@example.com',telefone:'11999990000',segmento:'Clínicas e saúde',desafio:'Agendamentos e retornos precisam de organização.',automacao:'Não',equipe:'6 a 15',origem:'Outro',origem_outro:'Evento',situacao:challenges.slice(0,2),consentimento:true,submissionId:randomUUID(),submissionAt:Date.now()});
function memory(){
  const rows=new Map();let version=0;
  return {rows,async read(path){return rows.get(path)||null;},async write(path,data,expected){const current=rows.get(path);if((current&&!expected)||(expected&&current?.version!==expected))throw new Error('conflict');const result={data:structuredClone(data),version:String(++version)};rows.set(path,result);return result;},async listing(){return {blobs:[...rows.keys()].filter(x=>x.startsWith('responses/')).sort().map(pathname=>({pathname})),hasMore:false};},async remove(path,expected){assert.equal(rows.get(path).version,expected);rows.delete(path);}};
}
async function call(handler,action,method='GET',data,extra={}){
  const req={method,url:'/api/server?action='+action,headers:{origin:'http://127.0.0.1:4174','content-type':'application/json','x-forwarded-for':'127.0.0.1',...extra},body:data};
  const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(value){this.data=JSON.parse(value);}};
  await handler(req,res);return res;
}
test('server validation keeps multiple challenges and rejects incomplete conditional answers',()=>{
  assert.equal(validateSubmission(sample()).situacao.length,2);
  assert.throws(()=>validateSubmission({...sample(),situacao:[]}));
  assert.throws(()=>validateSubmission({...sample(),origem_outro:''}));
  assert.throws(()=>validateSubmission({...sample(),automacao:'Sim',ferramentas:''}));
  assert.throws(()=>validateSubmission({...sample(),consentimento:false}));
  assert.throws(()=>validateSubmission({...sample(),website:'spam'}));
  assert.throws(()=>validateSubmission({...sample(),email:'bad'}));
  assert.throws(()=>validateSubmission({...sample(),situacao:['arbitrary']}));
});
test('complete flow: private reads, login, persistence, replay, notes, conflict, logout and cleanup',async()=>{
  const store=memory(),handler=createHandler(store);
  assert.equal((await call(handler,'responses')).statusCode,401);
  const wrong=await call(handler,'login','POST',{password:'incorrect'});assert.equal(wrong.statusCode,401);
  const login=await call(handler,'login','POST',{password});assert.equal(login.statusCode,200);
  const auth={cookie:login.headers['set-cookie'].split(';')[0],'x-csrf-token':login.data.csrf};
  assert.match(login.headers['set-cookie'],/HttpOnly/);assert.match(login.headers['set-cookie'],/SameSite=Strict/);
  assert.equal((await call(handler,'responses','GET',undefined,{cookie:'lo_session=invalid'})).statusCode,401);
  const input=sample();
  const submit=await call(handler,'submit','POST',input);assert.equal(submit.statusCode,201);
  assert.equal((await call(handler,'submit','POST',input)).statusCode,201);
  let page=await call(handler,'responses','GET',undefined,auth);assert.equal(page.data.responses.length,1);assert.equal(page.headers['cache-control'],'private, no-store, max-age=0');
  let response=page.data.responses[0];assert.equal(response.origem_outro,'Evento');assert.deepEqual(response.situacao,input.situacao);
  assert.equal((await call(handler,'response','PATCH',{id:response.id,version:response.version,status:'Em contato',notas:'Contato amanhã'},{...auth,origin:'https://attacker.example'})).statusCode,403);
  assert.equal((await call(handler,'response','PATCH',{id:response.id,version:response.version,status:'Em contato',notas:'Contato amanhã'},{cookie:auth.cookie})).statusCode,403);
  assert.equal((await call(handler,'response','PATCH',{id:response.id,version:response.version,status:'Em contato',notas:'Contato amanhã'},auth)).statusCode,200);
  assert.equal((await call(handler,'response','PATCH',{id:response.id,version:response.version,status:'Concluída',notas:''},auth)).statusCode,409);
  assert.equal((await call(handler,'submit','POST',input)).statusCode,201,'retry must not duplicate or overwrite follow-up');
  page=await call(handler,'responses','GET',undefined,auth);response=page.data.responses[0];assert.equal(response.status,'Em contato');assert.equal(response.notas,'Contato amanhã');
  assert.equal((await call(handler,'submit','POST',{...input,empresa:'different'})).statusCode,409);
  assert.equal((await call(handler,'response','DELETE',{id:'../../secret',version:'x'},auth)).statusCode,400);
  assert.equal((await call(handler,'response','DELETE',{id:response.id,version:response.version},auth)).statusCode,200);
  assert.equal((await call(handler,'responses','GET',undefined,auth)).data.responses.length,0);
  assert.match((await call(handler,'logout','POST',{},auth)).headers['set-cookie'],/Max-Age=0/);
});
test('login rate limits are persisted across handler instances',async()=>{
  const store=memory();for(let i=0;i<8;i++)assert.equal((await call(createHandler(store),'login','POST',{password:'wrong'})).statusCode,401);
  const blocked=await call(createHandler(store),'login','POST',{password});assert.equal(blocked.statusCode,429);assert.equal(blocked.headers['retry-after'],'900');
});
test('missing credentials fail closed, including public submission',async()=>{
  const old=process.env.ADMIN_AUTH_CONFIG;delete process.env.ADMIN_AUTH_CONFIG;
  try{const h=createHandler(memory());assert.equal((await call(h,'responses')).statusCode,503);assert.equal((await call(h,'submit','POST',sample())).statusCode,503);}finally{process.env.ADMIN_AUTH_CONFIG=old;}
});

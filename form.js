
(function(){
const form=document.getElementById('form'),panels=[...document.querySelectorAll('.panel')],steps=[...document.querySelectorAll('.step')];
let stage=0, sending=false, attempt=null;
function options(id,name,values,multiple=false){
const host=document.getElementById(id);
values.forEach(value=>{
const label=document.createElement('label');label.className='choice';
const input=document.createElement('input');input.type=multiple?'checkbox':'radio';input.name=name;input.value=value;input.required=!multiple;
if(multiple)input.setAttribute('aria-describedby','challenges-hint challenges-error');
const text=document.createElement('span');text.textContent=value;
label.append(input,text);host.append(label);
});
}
options('sectors','segmento',['Clínicas e saúde','Escritórios','Energia solar','Agro','Restaurantes','E-commerce','Comércio','Serviços','Outro']);
options('automation','automacao',['Sim','Não']);
options('situations','situacao',[
'Atendimentos, agendamentos ou pós-venda se perdem no WhatsApp e em anotações',
'Leads, propostas e orçamentos ficam sem acompanhamento e oportunidades se perdem',
'Pedidos, serviços ou entregas atrasam por falhas na passagem de informações',
'Compras, estoque e financeiro exigem conferências manuais e geram divergências',
'Planilhas e sistemas não se integram; o time precisa digitar a mesma informação várias vezes',
'Tarefas repetitivas, como cadastros, cobranças e relatórios, tomam tempo demais',
'Processos e responsabilidades pouco claros geram erros, retrabalho e sobrecarga',
'Faltam indicadores confiáveis para acompanhar custos, produtividade e resultados'
],true);
options('sources','origem',['Instagram','LinkedIn','Google','Indicação','E-mail','Outro']);
function render(){
panels.forEach((p,i)=>{p.hidden=i!==stage;p.querySelectorAll('input,textarea,select').forEach(input=>input.disabled=i!==stage)});
steps.forEach((step,i)=>{step.classList.toggle('active',i<=stage);if(i===stage)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current')});
syncTools();
syncChallenges();
syncOtherSource();
document.getElementById('previous').hidden=stage===0;
document.getElementById('start-note').hidden=stage!==0;
document.getElementById('next').textContent=stage===2?'Enviar diagnóstico ↗':'Continuar ↗';
}
function syncTools(){
const selected=form.querySelector('input[name="automacao"]:checked');
const active=selected&&selected.value==='Sim';
document.getElementById('tools-label').hidden=!active;
form.elements.ferramentas.required=!!active;
form.elements.ferramentas.disabled=stage!==1||!active;
}
function syncChallenges(){
const checks=[...form.querySelectorAll('input[name="situacao"]')];
const hasSelection=checks.some(input=>input.checked);
checks[0].setCustomValidity(hasSelection?'':'Selecione pelo menos um desafio para continuar.');
if(hasSelection||stage!==2)document.getElementById('challenges-error').hidden=true;
}
function syncOtherSource(){
const active=form.elements.origem.value==='Outro';
document.getElementById('other-source-field').hidden=!active;
form.elements.origem_outro.required=active;
form.elements.origem_outro.disabled=stage!==2||!active;
}
form.addEventListener('change',()=>{syncTools();syncChallenges();syncOtherSource()});
form.addEventListener('invalid',event=>{
if(event.target.name==='situacao')document.getElementById('challenges-error').hidden=false;
},true);
function focusPanel(){panels[stage].querySelector('h2').focus();}

form.elements.telefone.addEventListener('input',function(){
const length=this.value.replace(/\D/g,'').length;
this.setCustomValidity(length>=10&&length<=15?'':'Informe um telefone com DDD.');
});
form.addEventListener('submit',async event=>{
event.preventDefault();
if(sending||!form.reportValidity())return;
if(stage<2){stage++;render();focusPanel();return;}
const keys=['nome','empresa','email','telefone','segmento','desafio','automacao','ferramentas','equipe','origem','origem_outro','website'];
const payload=Object.fromEntries(keys.map(key=>[key,form.elements.namedItem(key)?.value||'']));
payload.situacao=[...form.querySelectorAll('input[name="situacao"]:checked')].map(input=>input.value);
payload.consentimento=form.elements.consentimento.checked;
const fingerprint=JSON.stringify(payload);
if(!attempt||attempt.fingerprint!==fingerprint)attempt={fingerprint,submissionId:crypto.randomUUID(),submissionAt:Date.now()};
const submitButton=document.getElementById('next'),previous=document.getElementById('previous'),sendError=document.getElementById('send-error');
sending=true;submitButton.disabled=true;previous.disabled=true;submitButton.textContent='Enviando…';sendError.hidden=true;
try{
const response=await fetch('/_diagnostico/api/server?action=submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,submissionId:attempt.submissionId,submissionAt:attempt.submissionAt})});
const result=await response.json().catch(()=>({}));
if(!response.ok)throw new Error(result.error||'Não foi possível enviar agora. Tente novamente.');
}catch(error){sendError.textContent=error.message||'Confira sua conexão e tente novamente.';sendError.hidden=false;return;}
finally{sending=false;submitButton.disabled=false;previous.disabled=false;submitButton.textContent='Enviar diagnóstico ↗';}
const labels={nome:'Nome',empresa:'Empresa',email:'E-mail',telefone:'WhatsApp',segmento:'Segmento',desafio:'Desafio',automacao:'Usa automação',ferramentas:'Ferramentas',equipe:'Equipe',situacao:'Desafios da operação',origem:'Como nos conheceu',origem_outro:'Detalhes da origem'};
const lines=[];
Object.entries(labels).forEach(([key,label])=>{
const control=form.elements.namedItem(key);
const value=key==='situacao'?[...form.querySelectorAll('input[name="situacao"]:checked')].map(input=>'• '+input.value).join('\n'):(control?control.value:'');
if(key==='origem_outro'&&form.elements.origem.value!=='Outro')return;
if(key==='ferramentas'&&form.elements.automacao.value!=='Sim')return;
if(value)lines.push(label+': '+value);
});
document.getElementById('summary').textContent=lines.join('\n\n');
document.getElementById('flow').hidden=true;
document.getElementById('completed').hidden=false;
document.querySelector('#completed h2').focus();
});
document.getElementById('previous').addEventListener('click',()=>{stage=Math.max(0,stage-1);render();focusPanel()});
document.getElementById('edit').addEventListener('click',()=>location.reload());
const motionToggle=document.getElementById('motion-toggle');
motionToggle.addEventListener('click',()=>{
const paused=motionToggle.getAttribute('aria-pressed')!=='true';
motionToggle.setAttribute('aria-pressed',String(paused));
document.getElementById('tactical-field').classList.toggle('is-paused',paused);
motionToggle.textContent=paused?'Retomar movimento':'Pausar movimento';
});
const privacy=document.getElementById('privacy');
document.getElementById('privacy-open').addEventListener('click',()=>privacy.showModal());
document.getElementById('privacy-close').addEventListener('click',()=>privacy.close());
render();
})();

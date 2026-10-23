(() => {
  const $ = id => document.getElementById(id);
  let records = [], cursor = null, csrf = '', selected = null, loading = false;
  const date = value => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
  function message(id, value) { $(id).textContent=value;$(id).hidden=!value; }
  function loggedOut() {
    records=[];csrf='';selected=null;cursor=null;
    $('response-rows').replaceChildren();$('detail-content').replaceChildren();$('detail-contacts').replaceChildren();
    $('detail-notes').value='';$('detail-title').textContent='';$('detail-meta').textContent='';
    $('response-dialog').close();$('delete-dialog').close();
    $('dashboard').hidden=true;$('login-view').hidden=false;
  }
  async function api(action, {method='GET',data,signal}={}) {
    const url=new URL('/api/server',location.origin);url.searchParams.set('action',action);
    if(action==='responses'&&data?.cursor)url.searchParams.set('cursor',data.cursor);
    const options={method,credentials:'same-origin',cache:'no-store',signal,headers:{}};
    if(method!=='GET'){options.headers={'Content-Type':'application/json','X-CSRF-Token':csrf};options.body=JSON.stringify(data||{});}
    const response=await fetch(url,options);
    const result=await response.json().catch(()=>({error:'Não foi possível ler a resposta do servidor.'}));
    if(!response.ok){if(response.status===401&&action!=='login')loggedOut();throw new Error(result.error||'Não foi possível concluir. Tente novamente.');}
    return result;
  }
  function text(tag,value,cls){const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;return node;}
  function render() {
    const search=$('search').value.trim().toLocaleLowerCase('pt-BR'),status=$('status-filter').value,sector=$('sector-filter').value;
    const filtered=records.filter(r=>(!status||r.status===status)&&(!sector||r.segmento===sector)&&(!search||`${r.nome} ${r.empresa} ${r.email}`.toLocaleLowerCase('pt-BR').includes(search)));
    $('count-total').textContent=records.length;
    $('count-new').textContent=records.filter(r=>r.status==='Nova').length;
    $('count-progress').textContent=records.filter(r=>r.status==='Em contato').length;
    $('count-done').textContent=records.filter(r=>r.status==='Concluída').length;
    $('result-count').textContent=`${filtered.length} ${filtered.length===1?'resposta':'respostas'}${records.length!==filtered.length?' de '+records.length+' carregadas':''}${cursor?' · há mais respostas para carregar':''}`;
    $('empty').hidden=filtered.length>0;$('table-wrap').hidden=filtered.length===0;
    $('empty-title').textContent=records.length?'Nenhuma resposta com estes filtros.':'O próximo movimento começa aqui.';
    $('empty-copy').textContent=records.length?'Tente outro nome, segmento ou status para encontrar a conversa.':'As respostas enviadas pelo formulário aparecerão neste painel.';
    $('response-rows').replaceChildren();
    for(const record of filtered){
      const row=document.createElement('tr'),identity=document.createElement('td');
      identity.append(text('strong',record.empresa),text('small',record.nome));
      const stamp=text('span',record.status,'status '+({Nova:'new','Em contato':'progress','Concluída':'done'}[record.status]||''));
      const cell=document.createElement('td');cell.append(stamp);
      const actions=document.createElement('td'),button=text('button','Ver resposta ↗');button.type='button';button.setAttribute('aria-label',`Ver resposta de ${record.empresa}`);button.addEventListener('click',()=>details(record));actions.append(button);
      row.append(identity,text('td',record.segmento),text('td',date(record.createdAt)),cell,actions);$('response-rows').append(row);
    }
    $('load-more').hidden=!cursor;
  }
  async function load(more=false) {
    if(loading)return;loading=true;message('page-error','');
    $('refresh').disabled=true;$('load-more').disabled=true;
    if(!records.length)$('loading').hidden=false;
    try {
      const result=await api('responses',{data:more?{cursor}:undefined});
      const map=new Map((more?records:[]).map(r=>[r.id,r]));result.responses.forEach(r=>map.set(r.id,r));
      records=[...map.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));cursor=result.cursor;
      render();$('updated-at').textContent='Atualizado em '+date(Date.now());
    } catch(err){message('page-error',err.message);$('updated-at').textContent='Não foi possível atualizar a lista.';}
    finally{loading=false;$('loading').hidden=true;$('refresh').disabled=false;$('load-more').disabled=false;}
  }
  async function openDashboard(){ $('login-view').hidden=true;$('dashboard').hidden=false;$('password').value='';await load(); }
  function details(record){
    selected=record;$('detail-title').textContent=record.empresa;$('detail-meta').textContent=`${record.nome} · ${record.segmento} · ${date(record.createdAt)}`;
    const contacts=$('detail-contacts');contacts.replaceChildren();
    const email=text('a','Enviar e-mail ↗');email.href='mailto:'+encodeURIComponent(record.email);contacts.append(email);
    const phone=record.telefone.replace(/\D/g,'');
    if(/^\d{10,15}$/.test(phone)){const whatsapp=text('a','Abrir WhatsApp ↗');whatsapp.href='https://wa.me/'+(phone.length<=11?'55':'')+phone;whatsapp.target='_blank';whatsapp.rel='noopener noreferrer';contacts.append(whatsapp);}
    const list=document.createElement('dl');
    for(const [label,value] of [['E-mail',record.email],['WhatsApp',record.telefone],['Desafio principal',record.desafio],['Desafios da operação',record.situacao],['Sistemas ou automação',record.automacao==='Sim'?record.ferramentas:'Ainda não utiliza'],['Tamanho do time',record.equipe],['Como nos conheceu',record.origem==='Outro'?`Outro: ${record.origem_outro}`:record.origem]]){
      const item=document.createElement('div');item.className='detail-item';item.append(text('dt',label));const dd=document.createElement('dd');
      if(Array.isArray(value)){const ul=document.createElement('ul');value.forEach(v=>ul.append(text('li',v)));dd.append(ul);}else dd.textContent=value;
      item.append(dd);list.append(item);
    }
    $('detail-content').replaceChildren(list);$('detail-status').value=record.status;$('detail-notes').value=record.notas||'';message('detail-error','');$('response-dialog').showModal();
  }
  $('show-password').addEventListener('click',()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('show-password').textContent=show?'Ocultar':'Mostrar';$('show-password').setAttribute('aria-pressed',String(show));});
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();message('login-error','');$('login-button').disabled=true;$('login-button').textContent='Entrando…';
    try{const result=await api('login',{method:'POST',data:{password:$('password').value}});csrf=result.csrf;await openDashboard();}
    catch(err){message('login-error',err.message);}
    finally{$('login-button').disabled=false;$('login-button').textContent='Entrar no painel ↗';}
  });
  $('logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST'});loggedOut();}catch(err){message('page-error',err.message);}});
  $('refresh').addEventListener('click',()=>load());$('load-more').addEventListener('click',()=>load(true));
  ['search','status-filter','sector-filter'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
  $('close-dialog').addEventListener('click',()=>$('response-dialog').close());
  $('update-form').addEventListener('submit',async event=>{
    event.preventDefault();$('save-response').disabled=true;message('detail-error','');
    try{await api('response',{method:'PATCH',data:{id:selected.id,version:selected.version,status:$('detail-status').value,notas:$('detail-notes').value}});$('response-dialog').close();await load();}
    catch(err){message('detail-error',err.message);}
    finally{$('save-response').disabled=false;}
  });
  $('delete-response').addEventListener('click',()=>{message('delete-error','');$('delete-dialog').showModal();});
  $('cancel-delete').addEventListener('click',()=>$('delete-dialog').close());
  $('confirm-delete').addEventListener('click',async()=>{
    $('confirm-delete').disabled=true;message('delete-error','');
    try{await api('response',{method:'DELETE',data:{id:selected.id,version:selected.version}});$('delete-dialog').close();$('response-dialog').close();await load();}
    catch(err){message('delete-error',err.message);}finally{$('confirm-delete').disabled=false;}
  });
  api('session').then(result=>{csrf=result.csrf;return openDashboard();}).catch(()=>{});
})();

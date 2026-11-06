export class ApiError extends Error {constructor(message,status=0,code=''){super(message);this.status=status;this.code=code;}}
export class SupabaseAPI {
  constructor(config){this.url=config.supabaseUrl.replace(/\/$/,'');this.key=config.supabasePublishableKey;this.storageKey=`coleta-session:${this.url}`;this.refreshPromise=null;}
  readSession(){try{return JSON.parse(localStorage.getItem(this.storageKey)||'null');}catch{return null;}}
  saveSession(session){if(!session.expires_at)session.expires_at=Math.floor(Date.now()/1000)+session.expires_in;localStorage.setItem(this.storageKey,JSON.stringify(session));return session;}
  async request(path,{method='GET',body,token,headers={},timeout=30000}={}){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(this.url+path,{method,signal:controller.signal,headers:{apikey:this.key,...(token?{Authorization:`Bearer ${token}`}:{ }),...(body instanceof Blob?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body)});
      const raw=await response.text();let data;try{data=raw?JSON.parse(raw):null;}catch{data={message:raw};}
      if(!response.ok)throw new ApiError(data?.message||data?.msg||data?.error_description||data?.error||'Falha no serviço de coleta.',response.status,data?.error_code||data?.code||data?.error||'');
      return data;
    }catch(error){if(error.name==='AbortError')throw new Error('O envio demorou mais que o esperado. Sua gravação continua aqui; tente novamente.');if(error instanceof TypeError)throw new Error('Não foi possível conectar. Confira sua internet e tente novamente.');throw error;}finally{clearTimeout(timer);}
  }
  async session(force=false){
    if(this.refreshPromise)return this.refreshPromise;
    const work=async()=>{const s=this.readSession();if(!s)return null;if(!force&&s.expires_at>Date.now()/1000+90)return s;
      try{return this.saveSession(await this.request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh_token}}));}
      catch(error){if(error.status===400||error.status===401)throw new Error('Sua sessão expirou. Não crie outra participação para continuar a mesma; entre em contato com a equipe.');throw error;}};
    this.refreshPromise=(navigator.locks?navigator.locks.request(this.storageKey,work):work());
    try{return await this.refreshPromise;}finally{this.refreshPromise=null;}
  }
  async authRequest(path,options={}){let s=await this.session();if(!s)throw new Error('Inicie sua participação para continuar.');try{return await this.request(path,{...options,token:s.access_token});}catch(e){if(e.status!==401)throw e;s=await this.session(true);return this.request(path,{...options,token:s.access_token});}}
  async createParticipant(p){
    // Acesso sem e-mail/senha, mas com identidade Auth e políticas RLS individuais.
    if(!this.readSession()){
      try{localStorage.setItem(this.storageKey+'-check','1');localStorage.removeItem(this.storageKey+'-check');}catch{throw new Error('Permita o armazenamento deste site no navegador para continuar.');}
      this.saveSession(await this.request('/auth/v1/signup',{method:'POST',body:{data:{}}}));
    }
    await this.authRequest('/rest/v1/rpc/register_participant',{method:'POST',body:{p_name:p.name.trim(),p_sex:p.sex,p_age:p.age,p_consent:p.consent}});
    return this.snapshot();
  }
  async snapshot(){
    if(!this.readSession())return null;
    const people=await this.authRequest('/rest/v1/participants?select=*');if(!people.length)return null;
    let recordings=await this.authRequest('/rest/v1/recordings?select=*&source_recording_id=is.null&order=repetition,phrase_id');
    // Se houve interrupção após o upload, conclui a confirmação sem duplicar o áudio.
    for(const r of recordings.filter(r=>r.status==='pending'&&r.duration_ms)){
      try{await this.authRequest('/rest/v1/rpc/complete_recording',{method:'POST',body:{p_recording_id:r.id}});}catch(e){if(!e.message.includes('AUDIO_NOT_UPLOADED'))throw e;}
    }
    recordings=await this.authRequest('/rest/v1/recordings?select=*&source_recording_id=is.null&order=repetition,phrase_id');
    return {participant:people[0],recordings};
  }
  async save(recording,blob,duration){
    const mime=blob.type.split(';')[0];
    const prepared=await this.authRequest('/rest/v1/rpc/prepare_recording',{method:'POST',body:{p_recording_id:recording.id,p_duration_ms:Math.round(duration),p_mime_type:mime,p_byte_size:blob.size}});
    const row=Array.isArray(prepared)?prepared[0]:prepared;
    if(row.status!=='complete'){
      try{await this.authRequest('/storage/v1/object/voice-recordings/'+row.object_path,{method:'POST',body:blob,headers:{'Content-Type':mime,'x-upsert':'false'},timeout:60000});}
      catch(e){if(!(e.status===409||e.code==='Duplicate'||e.message==='The resource already exists'))throw e;}
      await this.authRequest('/rest/v1/rpc/complete_recording',{method:'POST',body:{p_recording_id:row.id}});
    }
    return this.snapshot();
  }
  async reset(){localStorage.removeItem(this.storageKey);}
}
export class DemoAPI {
  constructor(){this.data=null;}
  async snapshot(){return this.data;}
  async createParticipant(p){if(!this.data)this.data={participant:{id:`demo-${Date.now()}`,name:p.name},recordings:[1,2].flatMap(repetition=>[1,2,3,4,5,6].map(phrase_id=>({id:`demo-${phrase_id}-${repetition}`,phrase_id,repetition,noise_type:0,status:'pending',source_recording_id:null})))};return this.data;}
  async save(r){this.data.recordings.find(x=>x.id===r.id).status='complete';return this.data;}
  async reset(){this.data=null;}
}

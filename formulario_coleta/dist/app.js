import {TASKS,nextTask,completedCount,validateParticipant,recordingMime} from './core.js';
import {SupabaseAPI,DemoAPI} from './api.js';
const $=id=>document.getElementById(id);
const config=window.APP_CONFIG||{};
const demo=config.demo===true;
const api=demo?new DemoAPI():new SupabaseAPI({supabaseUrl:config.supabaseUrl||'',supabasePublishableKey:config.supabasePublishableKey||''});
let data=null,task=null,recorder=null,stream=null,chunks=[],blob=null,playURL=null,duration=0,started=0,interval=null,stopTimer=null,sending=false,uploadAttempted=false,acquiring=false,interrupted=false;
function error(message){$('error').textContent=message;$('error').hidden=false;}
function clearError(){$('error').hidden=true;}
function screen(id){for(const name of ['intro','recorder-panel','paused','complete','loading'])$(name).hidden=name!==id;$(id).querySelector('h1')?.focus();}
function release(){clearInterval(interval);clearTimeout(stopTimer);if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}document.body.classList.remove('recording');}
function clearAudio(){blob=null;uploadAttempted=false;if(playURL){URL.revokeObjectURL(playURL);playURL=null;}$('audio').removeAttribute('src');$('audio').load();$('review').hidden=true;$('record').hidden=false;$('record').disabled=false;$('record').textContent='● Gravar áudio';$('timer').textContent='00:00';$('record-status').textContent='Pronto para gravar';$('redo').disabled=false;$('send').disabled=false;$('pause').disabled=false;}
function renderTask(){
  const count=completedCount(data.recordings);$('progress').value=count;$('step-count').textContent=`${count} de 12 ${demo?'concluídas':'enviadas'}`;
  task=nextTask(data.recordings);
  if(!task){clearAudio();$('participant-code').textContent=data.participant.id;$('complete-message').textContent=demo?'Você concluiu o teste das 12 gravações. Este é o modo de demonstração: nenhum áudio ou dado foi enviado.':'Suas 12 gravações foram recebidas. Sua contribuição ajuda nossa pesquisa.';screen('complete');return;}
  $('round-label').textContent=`Rodada ${task.repetition} de 2`;$('repeat-label').textContent=task.repetition===1?'Primeira gravação desta frase':'Segunda gravação da mesma frase';$('phrase').textContent=`“${task.text}”`;
  clearAudio();$('send').textContent=count===11?'Enviar e concluir ✓':'Enviar e continuar →';screen('recorder-panel');
}
function explain(e){
  if(['NotAllowedError','SecurityError'].includes(e.name))return 'O microfone não foi autorizado. Permita o acesso nas configurações deste site e tente novamente.';
  if(e.name==='NotFoundError')return 'Nenhum microfone foi encontrado. Conecte um microfone ou use outro aparelho.';
  if(e.name==='NotReadableError')return 'O microfone está indisponível. Feche outros aplicativos que o estejam usando e tente novamente.';
  if(e.message?.includes('Anonymous sign-ins are disabled'))return 'A coleta ainda não foi habilitada. A equipe precisa ativar o acesso anônimo no Supabase.';
  if(e.status===429)return 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.';
  if(e.message?.includes('AUDIO_METADATA_MISMATCH'))return 'O arquivo enviado não corresponde à gravação. Entre em contato com a equipe antes de continuar.';
  return e.message||'Não foi possível concluir. Tente novamente.';
}
$('participant-form').addEventListener('submit',async event=>{
  event.preventDefault();clearError();$('start').disabled=true;
  try{const p={name:$('name').value,sex:$('sex').value,age:Number($('age').value),consent:$('consent').checked};validateParticipant(p);data=await api.createParticipant(p);renderTask();}catch(e){error(explain(e));}finally{$('start').disabled=false;}
});
async function startRecording(){
  if(acquiring||sending)return;clearError();clearAudio();acquiring=true;$('record').disabled=true;$('record-status').textContent='Aguardando acesso ao microfone…';$('pause').disabled=true;
  try{
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Abra o site em HTTPS em um navegador atualizado para gravar.');
    stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    const mime=recordingMime(MediaRecorder);recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);chunks=[];interrupted=false;
    recorder.addEventListener('dataavailable',e=>{if(e.data.size)chunks.push(e.data);});
    recorder.addEventListener('error',()=>{interrupted=true;error('A gravação foi interrompida. Grave novamente.');});
    recorder.addEventListener('stop',()=>{
      duration=performance.now()-started;release();$('pause').disabled=false;
      if(interrupted){clearAudio();return;}
      blob=new Blob(chunks,{type:recorder.mimeType||chunks[0]?.type||'audio/webm'});
      if(duration<500||blob.size<100){clearAudio();error('A gravação ficou muito curta. Grave a frase inteira e tente novamente.');return;}
      if(blob.size>2*1024*1024){clearAudio();error('O arquivo ficou grande demais. Grave uma frase mais curta, em até 10 segundos.');return;}
      if(!['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav'].includes(blob.type.split(';')[0])){clearAudio();error('Este navegador usa um formato não compatível. Tente Chrome, Firefox ou Safari atualizado.');return;}
      playURL=URL.createObjectURL(blob);$('audio').src=playURL;$('record').hidden=true;$('review').hidden=false;$('record-status').textContent='Áudio pronto. Ouça antes de enviar.';$('send').focus();
    },{once:true});
    stream.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(recorder?.state==='recording'){interrupted=true;recorder.stop();error('O microfone foi desconectado. Grave novamente.');}}));
    recorder.start();started=performance.now();$('record').disabled=false;$('record').textContent='■ Parar gravação';$('record-status').textContent='Gravando…';document.body.classList.add('recording');
    interval=setInterval(()=>{$('timer').textContent='00:'+String(Math.min(10,Math.floor((performance.now()-started)/1000))).padStart(2,'0');},100);
    stopTimer=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},10000);
  }catch(e){release();clearAudio();error(explain(e));}finally{acquiring=false;}
}
$('record').addEventListener('click',()=>{if(recorder?.state==='recording'){$('record').disabled=true;recorder.stop();}else startRecording();});
$('redo').addEventListener('click',()=>{if(!uploadAttempted){clearError();clearAudio();$('record').focus();}});
$('send').addEventListener('click',async()=>{
  if(!blob||sending)return;sending=true;uploadAttempted=true;clearError();$('send').disabled=true;$('redo').disabled=true;$('pause').disabled=true;$('send').textContent=demo?'Concluindo…':'Enviando…';$('record-status').textContent=demo?'Concluindo etapa de demonstração…':'Enviando e confirmando recebimento…';
  try{const row=data.recordings.find(r=>r.phrase_id===task.id&&r.repetition===task.repetition&&!r.source_recording_id);data=await api.save(row,blob,duration);renderTask();}
  catch(e){error(explain(e));$('send').disabled=false;$('send').textContent='Tentar enviar novamente';$('record-status').textContent='Envio não confirmado. Sua gravação está preservada nesta página.';}
  finally{sending=false;}
});
$('pause').addEventListener('click',()=>{
  if(blob&&!confirm('O áudio ainda não enviado será descartado. Deseja pausar?'))return;
  release();clearAudio();$('pause-message').textContent=demo?'Mantenha esta aba aberta para continuar o teste. Na demonstração, o progresso é descartado ao recarregar.':'As gravações enviadas estão salvas. Volte neste mesmo navegador, sem limpar os dados do site, para continuar.';screen('paused');
});
$('resume').addEventListener('click',()=>renderTask());
$('new-person').addEventListener('click',async()=>{await api.reset();data=null;clearError();$('participant-form').reset();screen('intro');});
window.addEventListener('beforeunload',e=>{if(blob||sending||recorder?.state==='recording'){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&recorder?.state==='recording'){interrupted=true;recorder.stop();error('A gravação foi interrompida ao sair da tela. Grave novamente com esta página aberta.');}});
(async()=>{
  $('demo-notice').hidden=!demo;
  if(!demo&&(!/^https:\/\/[a-z0-9.-]+$/i.test(config.supabaseUrl||'')||!config.supabasePublishableKey)){error('A coleta ainda não está configurada. A equipe precisa preencher o arquivo config.js antes de receber participações.');$('start').disabled=true;return;}
  if(!demo&&api.readSession()){
    screen('loading');try{data=await api.snapshot();data?renderTask():screen('intro');}catch(e){screen('intro');$('start').disabled=true;error(explain(e)+' Recarregue a página para tentar recuperar sua participação.');}
  }
})();

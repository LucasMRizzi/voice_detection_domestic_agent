export const PHRASES = [
  {id:1,text:'Acender a luz',label:'acender_luz'},
  {id:2,text:'Apagar a luz',label:'apagar_luz'},
  {id:3,text:'Ligar o ventilador',label:'ligar_ventilador'},
  {id:4,text:'Desligar o ventilador',label:'desligar_ventilador'},
  {id:5,text:'Abrir a cortina',label:'abrir_cortina'},
  {id:6,text:'Fechar a cortina',label:'fechar_cortina'}
];
export const TASKS = [1,2].flatMap(repetition=>PHRASES.map(phrase=>({...phrase,repetition})));
export const taskKey = x=>`${x.phrase_id??x.id}:${x.repetition}`;
export function nextTask(recordings){const done=new Set(recordings.filter(r=>r.status==='complete' && !r.source_recording_id).map(taskKey));return TASKS.find(t=>!done.has(taskKey(t)))??null;}
export function completedCount(recordings){return TASKS.length-recordingsRemaining(recordings);}
function recordingsRemaining(recordings){const done=new Set(recordings.filter(r=>r.status==='complete' && !r.source_recording_id).map(taskKey));return TASKS.filter(t=>!done.has(taskKey(t))).length;}
export function validateParticipant(p){if(p.name.trim().length<2||p.name.trim().length>100)throw new Error('Informe um nome entre 2 e 100 caracteres.');if(!['feminino','masculino','intersexo','nao_informado'].includes(p.sex))throw new Error('Selecione uma opção no campo sexo.');if(!Number.isInteger(p.age)||p.age<1||p.age>120)throw new Error('Informe uma idade inteira entre 1 e 120 anos.');if(!p.consent)throw new Error('É necessário autorizar o uso dos dados para participar.');}
export function recordingMime(Recorder){return ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(t=>Recorder.isTypeSupported(t))||'';}

-- Execute estas consultas como pesquisador no SQL Editor, não no navegador.

-- Acompanhar a coleta (inclui dados pessoais; acesso restrito à equipe).
select p.id,p.name,p.sex,p.age,count(r.id) filter(where r.status='complete') as audios_recebidos,
       p.created_at,p.completed_at
from public.participants p
left join public.recordings r on r.participant_id=p.id and r.source_recording_id is null
group by p.id order by p.created_at desc;

-- Manifesto do dataset sem nome, sexo, idade ou identificador de autenticação.
-- Download do áudio usa bucket_id + object_path via Storage autenticado.
select r.id,r.participant_id,f.label,f.text as expected_text,r.repetition,
       r.noise_type,n.name as noise_name,r.source_recording_id,r.snr_db,
       r.bucket_id,r.object_path,r.mime_type,r.duration_ms,r.byte_size
from public.recordings r
join public.phrases f on f.id=r.phrase_id
join public.noise_types n on n.id=r.noise_type
where r.status='complete'
order by r.participant_id,r.repetition,r.phrase_id;

-- Cadastre tipos de ruído quando forem usados na preparação do dataset.
-- insert into public.noise_types(id,name,description)
-- values (1,'ventilador','Ruído de ventilador adicionado artificialmente');
-- Versões aumentadas devem ter source_recording_id, noise_type>0 e snr_db.
-- Nunca altere a linha original: ela deve permanecer com noise_type=0.

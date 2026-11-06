-- Execute uma vez no SQL Editor de um projeto Supabase novo.
-- Bucket privado; participantes só enxergam sua própria participação.
begin;

create table public.noise_types (
  id integer primary key check (id >= 0),
  name text not null unique,
  description text
);
insert into public.noise_types values
 (0,'original','Gravação original, sem ruído adicionado artificialmente. Pode conter ruído ambiente natural.');

create table public.phrases (
  id smallint primary key check (id between 1 and 6),
  text text not null,
  label text not null unique
);
insert into public.phrases values
 (1,'Acender a luz','acender_luz'),(2,'Apagar a luz','apagar_luz'),
 (3,'Ligar o ventilador','ligar_ventilador'),(4,'Desligar o ventilador','desligar_ventilador'),
 (5,'Abrir a cortina','abrir_cortina'),(6,'Fechar a cortina','fechar_cortina');

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 100),
  sex text not null check (sex in ('feminino','masculino','intersexo','nao_informado')),
  age smallint not null check (age between 1 and 120),
  consent_version text not null default '2026-10-30-v1',
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  phrase_id smallint not null references public.phrases(id),
  repetition smallint not null check (repetition in (1,2)),
  noise_type integer not null default 0 references public.noise_types(id),
  -- Para versões com ruído, referencie a gravação original e informe o SNR.
  source_recording_id uuid references public.recordings(id),
  snr_db numeric(6,2),
  bucket_id text not null default 'voice-recordings' check (bucket_id='voice-recordings'),
  object_path text not null unique,
  status text not null default 'pending' check (status in ('pending','complete')),
  duration_ms integer check (duration_ms between 500 and 15000),
  mime_type text check (mime_type in ('audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav')),
  byte_size integer check (byte_size between 100 and 2097152),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz,
  constraint original_has_no_added_noise check (
    (source_recording_id is null and noise_type=0 and snr_db is null)
    or (source_recording_id is not null and noise_type>0)
  ),
  constraint complete_has_metadata check (
    status<>'complete' or (duration_ms is not null and mime_type is not null and byte_size is not null and uploaded_at is not null)
  )
);
create unique index recordings_original_slot on public.recordings(participant_id,phrase_id,repetition) where source_recording_id is null;
create index recordings_participant_idx on public.recordings(participant_id);

alter table public.participants enable row level security;
alter table public.recordings enable row level security;
alter table public.phrases enable row level security;
alter table public.noise_types enable row level security;

revoke all on public.participants,public.recordings,public.phrases,public.noise_types from anon,authenticated;
grant select on public.participants,public.recordings,public.phrases,public.noise_types to authenticated;
-- Supabase: usuários sem e-mail criados por Anonymous Sign-ins usam authenticated.
create policy participants_read_own on public.participants for select to authenticated using (auth_user_id=(select auth.uid()));
create policy recordings_read_own on public.recordings for select to authenticated using (
 exists(select 1 from public.participants p where p.id=participant_id and p.auth_user_id=(select auth.uid()))
);
create policy phrases_read on public.phrases for select to authenticated using(true);
create policy noise_types_read on public.noise_types for select to authenticated using(true);

create function public.register_participant(p_name text,p_sex text,p_age integer,p_consent boolean)
returns public.participants
language plpgsql security definer set search_path=''
as $$
declare person public.participants; slot_id uuid; phrase public.phrases; rep integer;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_consent is distinct from true then raise exception 'CONSENT_REQUIRED'; end if;
 if p_age is null or p_age<1 or p_age>120 then raise exception 'INVALID_AGE'; end if;
 insert into public.participants(auth_user_id,name,sex,age)
 values(auth.uid(),btrim(p_name),p_sex,p_age)
 on conflict(auth_user_id) do nothing;
 select * into person from public.participants where auth_user_id=auth.uid() for update;
 for rep in 1..2 loop
   for phrase in select * from public.phrases order by id loop
     slot_id:=gen_random_uuid();
     insert into public.recordings(id,participant_id,phrase_id,repetition,noise_type,object_path)
     values(slot_id,person.id,phrase.id,rep,0,auth.uid()::text||'/'||slot_id::text)
     on conflict(participant_id,phrase_id,repetition) where source_recording_id is null do nothing;
   end loop;
 end loop;
 return person;
end;
$$;

create function public.prepare_recording(p_recording_id uuid,p_duration_ms integer,p_mime_type text,p_byte_size integer)
returns public.recordings
language plpgsql security definer set search_path=''
as $$
declare rec public.recordings;
begin
 select r.* into rec from public.recordings r join public.participants p on p.id=r.participant_id
 where r.id=p_recording_id and p.auth_user_id=auth.uid() and r.source_recording_id is null for update of r;
 if not found then raise exception 'RECORDING_NOT_FOUND'; end if;
 if rec.status='complete' then return rec; end if;
 -- Não mude os metadados de um arquivo que já foi recebido.
 if exists(select 1 from storage.objects where bucket_id='voice-recordings' and name=rec.object_path) then return rec; end if;
 if p_duration_ms is null or p_mime_type is null or p_byte_size is null then raise exception 'INVALID_METADATA'; end if;
 update public.recordings set duration_ms=p_duration_ms,mime_type=p_mime_type,byte_size=p_byte_size
 where id=rec.id returning * into rec;
 return rec;
end;
$$;

create function public.complete_recording(p_recording_id uuid)
returns public.recordings
language plpgsql security definer set search_path=''
as $$
declare rec public.recordings; object_metadata jsonb; received_size bigint; received_mime text;
begin
 select r.* into rec from public.recordings r join public.participants p on p.id=r.participant_id
 where r.id=p_recording_id and p.auth_user_id=auth.uid() and r.source_recording_id is null for update of r;
 if not found then raise exception 'RECORDING_NOT_FOUND'; end if;
 if rec.status='complete' then return rec; end if;
 select metadata into object_metadata from storage.objects where bucket_id='voice-recordings' and name=rec.object_path;
 if not found then raise exception 'AUDIO_NOT_UPLOADED'; end if;
 received_size:=(object_metadata->>'size')::bigint;
 received_mime:=split_part(object_metadata->>'mimetype',';',1);
 if received_size is distinct from rec.byte_size or received_mime is distinct from rec.mime_type or rec.duration_ms is null then
   raise exception 'AUDIO_METADATA_MISMATCH';
 end if;
 update public.recordings set status='complete',uploaded_at=now() where id=rec.id returning * into rec;
 if (select count(*) from public.recordings where participant_id=rec.participant_id and source_recording_id is null and status='complete')=12 then
   update public.participants set completed_at=coalesce(completed_at,now()) where id=rec.participant_id;
 end if;
 return rec;
end;
$$;

revoke all on function public.register_participant(text,text,integer,boolean) from public,anon;
revoke all on function public.prepare_recording(uuid,integer,text,integer) from public,anon;
revoke all on function public.complete_recording(uuid) from public,anon;
grant execute on function public.register_participant(text,text,integer,boolean),public.prepare_recording(uuid,integer,text,integer),public.complete_recording(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('voice-recordings','voice-recordings',false,2097152,array['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Apenas os 12 caminhos reservados, após informar os metadados, aceitam upload.
create policy voice_upload_own_pending on storage.objects for insert to authenticated with check (
 bucket_id='voice-recordings' and exists(
   select 1 from public.recordings r join public.participants p on p.id=r.participant_id
   where r.object_path=storage.objects.name and p.auth_user_id=(select auth.uid()) and r.status='pending'
   and r.source_recording_id is null and r.noise_type=0 and r.duration_ms is not null
 )
);
create policy voice_read_own on storage.objects for select to authenticated using (
 bucket_id='voice-recordings' and exists(
   select 1 from public.recordings r join public.participants p on p.id=r.participant_id
   where r.object_path=storage.objects.name and p.auth_user_id=(select auth.uid())
 )
);
-- Sem UPDATE/DELETE públicos: gravações confirmadas não podem ser sobrescritas.
commit;

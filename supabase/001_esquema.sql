-- Estoque do galpão — esquema do servidor (Supabase). Rode uma vez no SQL Editor do projeto.
-- Cada tabela guarda o objeto do app em "dados" (jsonb); as permissões ficam no servidor (RLS).

-- 1. Perfis: nome e papel (admin, almoxarife, consultor)
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel text not null default 'consultor' check (papel in ('admin', 'almoxarife', 'consultor')),
  criado_em timestamptz not null default now()
);

create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- Administrador e almoxarife lançam e veem valores; consultor só vê saldos.
create or replace function public.pode_lancar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select papel in ('admin', 'almoxarife') from public.perfis where id = auth.uid()), false)
$$;

-- 2. Dados
do $$
declare t text;
begin
  foreach t in array array['itens', 'locais', 'funcionarios', 'movimentos', 'anexos'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
        dados jsonb not null,
        alterado_por uuid references auth.users (id) default auth.uid(),
        servidor_em timestamptz not null default now()
      );
      create index if not exists %2$I on public.%1$I (servidor_em);
    $f$, t, 'idx_' || t || '_servidor_em');
  end loop;
end $$;

-- Horário do servidor e autor de cada gravação (os aparelhos baixam só o que mudou)
create or replace function public.marcar_gravacao() returns trigger
language plpgsql as $$
begin
  new.servidor_em := clock_timestamp();
  new.alterado_por := auth.uid();
  return new;
end $$;

-- 3. Permissões (RLS). Não há exclusão: lançamentos são cancelados, cadastros desativados.
alter table public.perfis enable row level security;
drop policy if exists "perfis: leitura" on public.perfis;
create policy "perfis: leitura" on public.perfis for select to authenticated using (true);

do $$
declare t text;
begin
  foreach t in array array['itens', 'locais', 'funcionarios', 'movimentos', 'anexos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists marcar on public.%I', t);
    execute format('create trigger marcar before insert or update on public.%I for each row execute function public.marcar_gravacao()', t);
    execute format('drop policy if exists "leitura" on public.%I', t);
    execute format('drop policy if exists "criar" on public.%I', t);
    execute format('drop policy if exists "alterar" on public.%I', t);
    -- Só quem lança lê as tabelas (elas têm valores). O consultor usa a função saldos().
    execute format('create policy "leitura" on public.%I for select to authenticated using (public.pode_lancar())', t);
    execute format('create policy "criar" on public.%I for insert to authenticated with check (public.pode_lancar())', t);
    execute format('create policy "alterar" on public.%I for update to authenticated using (public.pode_lancar()) with check (public.pode_lancar())', t);
  end loop;
end $$;

-- Saldos sem valores (R$), para todos os usuários logados — é o que o consultor enxerga.
create or replace function public.saldos() returns table (item_id text, nome text, unidade text, embalagem jsonb, estoque_minimo numeric, saldo numeric)
language sql stable security definer set search_path = public as $$
  select i.id, i.dados ->> 'nome', i.dados ->> 'unidade', i.dados -> 'embalagem',
         coalesce((i.dados ->> 'estoqueMinimo')::numeric, 0),
         coalesce(sum(case m.dados ->> 'tipo'
           when 'entrada' then (m.dados ->> 'quantidade')::numeric
           when 'devolucao' then (m.dados ->> 'quantidade')::numeric
           when 'ajuste' then (m.dados ->> 'quantidade')::numeric
           when 'saida' then -(m.dados ->> 'quantidade')::numeric
           else 0 end), 0)
  from public.itens i
  left join public.movimentos m on m.dados ->> 'itemId' = i.id and m.dados -> 'cancelado' is null
  where auth.uid() is not null and coalesce((i.dados ->> 'ativo')::boolean, true)
  group by i.id
  order by 2
$$;
revoke all on function public.saldos() from public, anon;
grant execute on function public.saldos() to authenticated;

-- 4. Fotos anexadas (privado; só quem lança)
insert into storage.buckets (id, name, public) values ('anexos', 'anexos', false)
  on conflict (id) do nothing;

drop policy if exists "anexos arquivos: leitura" on storage.objects;
create policy "anexos arquivos: leitura" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and public.pode_lancar());
drop policy if exists "anexos arquivos: enviar" on storage.objects;
create policy "anexos arquivos: enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and public.pode_lancar());
drop policy if exists "anexos arquivos: substituir" on storage.objects;
create policy "anexos arquivos: substituir" on storage.objects for update to authenticated
  using (bucket_id = 'anexos' and public.pode_lancar()) with check (bucket_id = 'anexos' and public.pode_lancar());

-- 5. Tempo real
do $$
declare t text;
begin
  foreach t in array array['itens', 'locais', 'funcionarios', 'movimentos', 'anexos'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

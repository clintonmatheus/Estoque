-- Financeiro, etapa 1 (rode uma vez no SQL Editor do Supabase "Estoque", depois do 005). É seguro rodar de novo.
-- Cria o perfil do financeiro (independente do papel no galpão) e os cadastros: empresas, contas bancárias,
-- centros de custo (com os custos fixos mensais), fornecedores, tipos de despesa e percentuais de encargos.
-- As frentes de serviço continuam na tabela "locais". Se você já rodou uma versão anterior, rode de novo (cria o que faltar).

-- 1. Perfil do financeiro: admin (cadastra, aprova, vê tudo), pagador (paga e opera a folha), solicitante (pede).
alter table public.perfis add column if not exists financeiro text;
alter table public.perfis drop constraint if exists perfis_financeiro_check;
alter table public.perfis add constraint perfis_financeiro_check check (financeiro in ('admin', 'pagador', 'solicitante'));

create or replace function public.papel_financeiro() returns text
language sql stable security definer set search_path = public as $$
  select financeiro from public.perfis where id = auth.uid()
$$;
create or replace function public.tem_financeiro() returns boolean
language sql stable security definer set search_path = public as $$
  select public.papel_financeiro() is not null
$$;
create or replace function public.admin_financeiro() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_financeiro() = 'admin', false)
$$;

-- Ninguém muda o próprio perfil pelo app (a política de perfis só permite leitura). Os perfis são definidos
-- pelo administrador no SQL Editor (veja 006b_perfis_financeiro.sql).

-- 2. Cadastros do financeiro: todo usuário do financeiro lê (para escolher nos pedidos); só o admin grava.
do $$
declare t text;
begin
  foreach t in array array['empresas', 'contas', 'centros', 'fornecedores', 'tipos_despesa', 'encargos'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
        dados jsonb not null,
        alterado_por uuid references auth.users (id) default auth.uid(),
        servidor_em timestamptz not null default now()
      );
      create index if not exists %2$I on public.%1$I (servidor_em);
    $f$, t, 'idx_' || t || '_servidor_em');

    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists marcar on public.%I', t);
    execute format('create trigger marcar before insert or update on public.%I for each row execute function public.marcar_gravacao()', t);
    execute format('drop policy if exists "leitura" on public.%I', t);
    execute format('drop policy if exists "criar" on public.%I', t);
    execute format('drop policy if exists "alterar" on public.%I', t);
    execute format('create policy "leitura" on public.%I for select to authenticated using (public.tem_financeiro())', t);
    execute format('create policy "criar" on public.%I for insert to authenticated with check (public.admin_financeiro())', t);
    execute format('create policy "alterar" on public.%I for update to authenticated using (public.admin_financeiro()) with check (public.admin_financeiro())', t);

    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- 3. Frentes de serviço (locais): o financeiro também lê; o admin do financeiro também cria e liga a um centro de custo.
drop policy if exists "leitura" on public.locais;
drop policy if exists "criar" on public.locais;
drop policy if exists "alterar" on public.locais;
create policy "leitura" on public.locais for select to authenticated using (public.pode_lancar() or public.tem_financeiro());
create policy "criar" on public.locais for insert to authenticated with check (public.pode_lancar() or public.admin_financeiro());
create policy "alterar" on public.locais for update to authenticated
  using (public.pode_lancar() or public.admin_financeiro()) with check (public.pode_lancar() or public.admin_financeiro());

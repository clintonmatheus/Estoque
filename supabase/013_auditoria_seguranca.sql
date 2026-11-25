-- Segurança dos dados. Rode uma vez no SQL Editor do Supabase "Estoque", depois da 012. É seguro rodar de novo.
-- 1) Auditoria: toda criação, alteração ou exclusão em qualquer tabela do app guarda a versão anterior e a nova,
--    quem fez e quando, numa tabela que o app não lê nem altera (só o SQL Editor). Serve para investigar e restaurar.
-- 2) A função de saldos passa a responder só a quem tem acesso ao estoque (antes: qualquer login).

-- 1. Auditoria
create table if not exists public.auditoria (
  id bigserial primary key,
  tabela text not null,
  registro text not null,
  acao text not null check (acao in ('criou', 'alterou', 'apagou')),
  antes jsonb,
  depois jsonb,
  por uuid,
  em timestamptz not null default now()
);
create index if not exists idx_auditoria_registro on public.auditoria (tabela, registro, em desc);
create index if not exists idx_auditoria_em on public.auditoria (em desc);
alter table public.auditoria enable row level security; -- sem políticas: nenhum login do app lê ou grava aqui
revoke all on public.auditoria from anon, authenticated;
revoke all on sequence public.auditoria_id_seq from anon, authenticated;

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare a jsonb; d jsonb;
begin
  if tg_op <> 'INSERT' then a := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then d := to_jsonb(new); end if;
  -- gravação sem mudança real (só a hora do servidor ou o autor técnico) não entra
  if tg_op = 'UPDATE' and (a - 'servidor_em' - 'alterado_por') = (d - 'servidor_em' - 'alterado_por') then return null; end if;
  insert into public.auditoria (tabela, registro, acao, antes, depois, por)
  values (tg_table_name, coalesce(d ->> 'id', a ->> 'id'),
          case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'apagou' end, a, d, auth.uid());
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['perfis', 'itens', 'locais', 'funcionarios', 'movimentos', 'anexos', 'bens', 'movimentos_bens',
    'empresas', 'contas', 'centros', 'fornecedores', 'tipos_despesa', 'encargos', 'pedidos', 'compras'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists auditar on public.%I', t);
    execute format('create trigger auditar after insert or update or delete on public.%I for each row execute function public.auditar()', t);
    -- "always": registra também durante uma restauração (quando os outros gatilhos ficam desligados)
    execute format('alter table public.%I enable always trigger auditar', t);
  end loop;
end $$;

-- 2. Saldos: só quem vê o estoque (inclui o papel "saldos")
drop function if exists public.saldos();
create function public.saldos() returns table (item_id text, nome text, unidade text, embalagem jsonb, estoque_minimo numeric, categoria text, saldo numeric)
language sql stable security definer set search_path = public as $$
  select i.id, i.dados ->> 'nome', i.dados ->> 'unidade', i.dados -> 'embalagem',
         coalesce((i.dados ->> 'estoqueMinimo')::numeric, 0),
         i.dados ->> 'categoria',
         coalesce(sum(case m.dados ->> 'tipo'
           when 'entrada' then (m.dados ->> 'quantidade')::numeric
           when 'devolucao' then (m.dados ->> 'quantidade')::numeric
           when 'ajuste' then (m.dados ->> 'quantidade')::numeric
           when 'saida' then -(m.dados ->> 'quantidade')::numeric
           when 'epi' then -(m.dados ->> 'quantidade')::numeric
           else 0 end), 0)
  from public.itens i
  left join public.movimentos m on m.dados ->> 'itemId' = i.id and m.dados -> 'cancelado' is null
  where auth.uid() is not null and (public.ve_estoque() or public.papel_estoque() = 'saldos')
    and coalesce((i.dados ->> 'ativo')::boolean, true)
  group by i.id
  order by 2
$$;
revoke all on function public.saldos() from public, anon;
grant execute on function public.saldos() to authenticated;

-- Consultas úteis (SQL Editor):
--   Últimas alterações:            select em, tabela, registro, acao, por from public.auditoria order by em desc limit 50;
--   História de um pedido:         select em, acao, antes -> 'dados' ->> 'status' de, depois -> 'dados' ->> 'status' para, por
--                                    from public.auditoria where tabela = 'pedidos' and registro = '<id>' order by em;
--   Voltar um registro a uma versão: update public.<tabela> set dados = (select antes -> 'dados' from public.auditoria where id = <nº da linha>)
--                                    where id = '<id>';

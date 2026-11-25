-- 1) Caio e Augusto passam a ver os saldos do galpão (quantidades, sem valores).
-- 2) Remove o login construtorapassosrn@gmail.com (segunda conta da Joana).
-- Rode uma vez no SQL Editor do Supabase "Estoque", depois da 010/010b. É seguro rodar de novo.

-- Novo papel no estoque: "saldos" (só a tela de saldos do galpão, pela função saldos(), sem ler as tabelas)
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('admin', 'almoxarife', 'controle', 'consultor', 'saldos', 'nenhum'));

update public.perfis p set papel = 'saldos'
  from auth.users u
 where u.id = p.id and lower(u.email) in ('caioosouza6@gmail.com', lower('EMAIL_DO_AUGUSTO'));

-- Remove o login: primeiro desliga a autoria técnica das gravações dele (coluna alterado_por), depois apaga o usuário.
-- O histórico dentro dos registros (quem lançou, quando) continua como estava.
do $$
declare uid uuid; t record;
begin
  select id into uid from auth.users where lower(email) = 'construtorapassosrn@gmail.com';
  if uid is null then raise notice 'Login construtorapassosrn@gmail.com não encontrado (já removido?)'; return; end if;
  for t in select c.table_name from information_schema.columns c
            where c.table_schema = 'public' and c.column_name = 'alterado_por' loop
    execute format('update public.%I set alterado_por = null where alterado_por = $1', t.table_name) using uid;
  end loop;
  begin
    execute 'update storage.objects set owner = null where owner = $1' using uid;
  exception when undefined_column then null; end;
  delete from auth.users where id = uid;
  raise notice 'Login removido';
end $$;

-- Conferência
select u.email, p.nome, p.papel as estoque, p.financeiro as pagamentos, p.paga
  from public.perfis p join auth.users u on u.id = p.id
 order by p.nome;

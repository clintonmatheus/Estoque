\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c5', 'caioosouza6@gmail.com', '{}'),
  ('00000000-0000-0000-0000-0000000000c6', 'construtorapassosrn@gmail.com', '{}');
-- a conta a remover gravou um item
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c6', false);
insert into public.itens (id, dados) values ('x-joana2', '{"id":"x-joana2","nome":"X","unidade":"un","ativo":true}');
select set_config('request.jwt.claim.sub', '', false);
\i supabase/011_saldos_e_login.sql
\i supabase/011_saldos_e_login.sql
do $$ begin
  assert (select papel from public.perfis where id = '00000000-0000-0000-0000-0000000000c5') = 'saldos', 'Caio com saldos';
  assert not exists (select 1 from auth.users where email = 'construtorapassosrn@gmail.com'), 'login removido';
  assert exists (select 1 from public.itens where id = 'x-joana2' and alterado_por is null), 'registro mantido';
end $$;
-- Caio (saldos) usa a função de saldos, mas não lê as tabelas
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  assert (select count(*) from public.saldos()) > 0, 'saldos() responde';
  assert (select count(*) from public.itens) = 0, 'saldos não lê a tabela de itens';
  assert (select count(*) from public.movimentos) = 0, 'saldos não lê lançamentos (com valores)';
end $$;
reset role;
\echo 'Saldos e remoção de login OK'
\i supabase/012_saldos_ferramentas.sql
\i supabase/012_saldos_ferramentas.sql
insert into public.bens (id, dados) values ('f-bet', '{"id":"f-bet","nome":"BETONEIRA","ativo":true}');
insert into public.movimentos_bens (id, dados) values ('f-mb', '{"id":"f-mb","bemId":"f-bet","quantidade":1}');
insert into public.funcionarios (id, dados) values ('f-g', '{"id":"f-g","nome":"JOAO","ativo":true}'), ('f-e', '{"id":"f-e","nome":"ZE","ativo":true,"grupo":"epi","cpf":"1"}');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  assert (select count(*) from public.bens where id = 'f-bet') = 1, 'saldos vê ferramentas';
  assert (select count(*) from public.movimentos_bens where id = 'f-mb') = 1, 'saldos vê onde estão';
  assert (select count(*) from public.funcionarios where id = 'f-g') = 1, 'saldos vê funcionário do galpão';
  assert (select count(*) from public.funcionarios where id = 'f-e') = 0, 'FALHA: saldos viu funcionário de EPI';
  assert (select count(*) from public.itens) = 0, 'saldos continua sem ler itens';
  begin
    insert into public.bens (id, dados) values ('f-x', '{"id":"f-x","nome":"X"}');
    raise exception 'FALHA: saldos cadastrou ferramenta';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
\echo 'Ferramentas para saldos OK'

-- Cenários de permissão. Qualquer falha interrompe com erro.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000ad', 'clinton@x.com', '{}'),
  ('00000000-0000-0000-0000-00000000000a', 'marilia@x.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'arthur@x.com', '{}');
\i supabase/teste/usuarios_teste.sql

do $$ begin
  assert (select papel from public.perfis where nome = 'Marilia') = 'almoxarife', 'papel da Marilia';
  assert (select papel from public.perfis where nome = 'Arthur') = 'consultor', 'papel do Arthur';
end $$;

-- Marilia cadastra item e lança entrada e saída
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.itens (id, dados) values ('tinta', '{"id":"tinta","nome":"TINTA","unidade":"lata","estoqueMinimo":2,"ativo":true,"custoReferencia":50}');
insert into public.itens (id, dados) values ('velho', '{"id":"velho","nome":"VELHO","unidade":"un","estoqueMinimo":0,"ativo":false}');
insert into public.movimentos (id, dados) values
  ('e1', '{"tipo":"entrada","itemId":"tinta","quantidade":10,"custoUnitario":50}'),
  ('s1', '{"tipo":"saida","itemId":"tinta","quantidade":3,"localId":"a"}'),
  ('s2', '{"tipo":"saida","itemId":"tinta","quantidade":1,"localId":"a","cancelado":{"motivo":"x"}}'),
  ('t1', '{"tipo":"transferencia","itemId":"tinta","quantidade":1,"localId":"a","localDestinoId":"b"}'),
  ('d1', '{"tipo":"devolucao","itemId":"tinta","quantidade":1,"localId":"a"}'),
  ('a1', '{"tipo":"ajuste","itemId":"tinta","quantidade":-2}');
insert into storage.objects (bucket_id, name) values ('anexos', 'g1/x.jpg');
do $$ begin
  assert (select alterado_por from public.movimentos where id = 'e1') = '00000000-0000-0000-0000-00000000000a', 'autor gravado pelo servidor';
  assert (select saldo from public.saldos() where item_id = 'tinta') = 6, 'saldo: 10 - 3 + 1 - 2 (cancelada e transferência não contam)';
  assert (select count(*) from public.saldos()) = 1, 'item inativo fora da lista';
end $$;

-- Arthur (consultor): não lê tabelas com valores, não grava; vê saldos sem valores
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ declare n int; begin
  assert (select count(*) from public.itens) = 0, 'FALHA: consultor leu itens (custo de referência)';
  assert (select count(*) from public.movimentos) = 0, 'FALHA: consultor leu movimentos';
  assert (select count(*) from storage.objects) = 0, 'FALHA: consultor leu fotos';
  assert (select saldo from public.saldos() where item_id = 'tinta') = 6, 'consultor vê saldo';
  begin
    insert into public.movimentos (id, dados) values ('x', '{"tipo":"saida"}');
    raise exception 'FALHA: consultor lançou';
  exception when insufficient_privilege then null;
  end;
  update public.itens set dados = '{}' where id = 'tinta';
  get diagnostics n = row_count;
  assert n = 0, 'FALHA: consultor alterou item';
end $$;

-- Sem login: nada
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.saldos()) = 0, 'FALHA: saldos sem login';
end $$;

-- Administrador corrige lançamento da Marilia
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
update public.movimentos set dados = jsonb_set(dados, '{quantidade}', '4') where id = 's1';
do $$ begin
  assert (select alterado_por from public.movimentos where id = 's1') = '00000000-0000-0000-0000-0000000000ad', 'alteração registra o administrador';
end $$;
reset role;
\echo 'Permissões OK'

-- Etapa 2: EPI no saldo e equipamentos (bens e movimentações). Roda depois de cenarios.sql.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.bens (id, dados) values ('b1', '{"id":"b1","nome":"ESCORA","tipo":"locado","controle":"quantidade","ativo":true,"locacao":{"locadora":"Agaé"}}');
insert into public.movimentos_bens (id, dados) values ('mb1', '{"id":"mb1","bemId":"b1","quantidade":100,"origem":{"tipo":"externo"},"destino":{"tipo":"galpao"}}');
insert into public.movimentos (id, dados) values ('epi1', '{"tipo":"epi","itemId":"tinta","quantidade":2,"funcionarioId":"j","ca":"123"}'),
  ('epi2', '{"tipo":"epi","itemId":"tinta","quantidade":1,"funcionarioId":"j","cancelado":{"motivo":"x"}}');
do $$ begin
  assert (select alterado_por from public.movimentos_bens where id = 'mb1') = '00000000-0000-0000-0000-00000000000a', 'autor da movimentação';
  -- 10 entrada - 4 saída (já corrigida pelo admin) + 1 devolução - 2 ajuste - 2 EPI = 3 (EPI cancelado não conta)
  assert (select saldo from public.saldos() where item_id = 'tinta') = 3, 'EPI baixa o saldo (cancelada não conta)';
end $$;

-- Consultor: não vê nem grava bens e movimentações, mas o saldo já considera o EPI
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.bens) = 0, 'FALHA: consultor leu bens';
  assert (select count(*) from public.movimentos_bens) = 0, 'FALHA: consultor leu movimentações de bens';
  assert (select saldo from public.saldos() where item_id = 'tinta') = 3, 'consultor vê saldo com EPI baixado';
  begin
    insert into public.movimentos_bens (id, dados) values ('x', '{}');
    raise exception 'FALHA: consultor movimentou bem';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Sem login: nada
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.movimentos_bens) = 0, 'FALHA: movimentações sem login';
end $$;
reset role;
\echo 'Etapa 2 OK'

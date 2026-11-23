-- Etapa 2: ferramentas, empréstimos e EPI. Roda depois de cenarios.sql.
\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.ferramentas (id, dados) values ('f1', '{"id":"f1","nome":"FURADEIRA","codigo":"03","ativo":true}');
insert into public.emprestimos (id, dados) values ('e1', '{"id":"e1","ferramentaId":"f1","funcionarioId":"j","saida":"2026-11-10","prevista":"2026-11-17"}');
insert into public.movimentos (id, dados) values ('epi1', '{"tipo":"epi","itemId":"tinta","quantidade":2,"funcionarioId":"j","ca":"123"}'),
  ('epi2', '{"tipo":"epi","itemId":"tinta","quantidade":1,"funcionarioId":"j","cancelado":{"motivo":"x"}}');
do $$ begin
  assert (select alterado_por from public.emprestimos where id = 'e1') = '00000000-0000-0000-0000-00000000000a', 'autor do empréstimo';
  -- 10 entrada - 4 saída (já corrigida pelo admin) + 1 devolução - 2 ajuste - 2 EPI = 3 (EPI cancelado não conta)
  assert (select saldo from public.saldos() where item_id = 'tinta') = 3, 'EPI baixa o saldo (cancelada não conta)';
end $$;

-- Consultor: não vê nem grava ferramentas/empréstimos, mas o saldo já considera o EPI
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ declare n int; begin
  assert (select count(*) from public.ferramentas) = 0, 'FALHA: consultor leu ferramentas';
  assert (select count(*) from public.emprestimos) = 0, 'FALHA: consultor leu empréstimos';
  assert (select saldo from public.saldos() where item_id = 'tinta') = 3, 'consultor vê saldo com EPI baixado';
  begin
    insert into public.emprestimos (id, dados) values ('x', '{}');
    raise exception 'FALHA: consultor emprestou';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Sem login: nada
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.emprestimos) = 0, 'FALHA: empréstimos sem login';
end $$;
reset role;
\echo 'Etapa 2 OK'

\set ON_ERROR_STOP on
\i supabase/013_auditoria_seguranca.sql
\i supabase/013_auditoria_seguranca.sql
set role authenticated;
-- almoxarife altera um item: fica na auditoria com antes e depois
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.itens (id, dados) values ('au-1', '{"id":"au-1","nome":"AREIA","unidade":"m3","ativo":true}');
insert into public.itens (id, dados) values ('au-1', '{"id":"au-1","nome":"AREIA MEDIA","unidade":"m3","ativo":true}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin
  begin
    perform count(*) from public.auditoria;
    raise exception 'FALHA: login do app leu a auditoria';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.auditoria (tabela, registro, acao) values ('x', 'x', 'criou');
    raise exception 'FALHA: login do app gravou na auditoria';
  exception when insufficient_privilege then null; end;
end $$;
-- sem acesso ao estoque, saldos() não responde; com o papel saldos, responde
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
do $$ begin
  assert (select count(*) from public.saldos()) = 0, 'FALHA: login sem estoque leu saldos';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c5', false);
do $$ begin
  assert (select count(*) from public.saldos()) > 0, 'papel saldos lê saldos';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.auditoria where tabela = 'itens' and registro = 'au-1') = 2, 'criou + alterou';
  assert (select antes -> 'dados' ->> 'nome' from public.auditoria where registro = 'au-1' and acao = 'alterou') = 'AREIA', 'versão anterior guardada';
  assert (select por from public.auditoria where registro = 'au-1' and acao = 'criou') = '00000000-0000-0000-0000-00000000000a', 'quem fez';
end $$;
\echo 'Auditoria e saldos protegidos OK'

-- Financeiro etapa 1: perfis e permissões dos cadastros. Roda depois de cenarios_etapa2.sql.
\set ON_ERROR_STOP on
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'pagadora@x.com', '{}'),
  ('00000000-0000-0000-0000-0000000000f2', 'encarregado@x.com', '{}');
update public.perfis set financeiro = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';
update public.perfis set financeiro = 'pagador' where id = '00000000-0000-0000-0000-0000000000f1';
update public.perfis set financeiro = 'solicitante' where id = '00000000-0000-0000-0000-0000000000f2';
do $$ begin
  begin
    update public.perfis set financeiro = 'chefe' where id = '00000000-0000-0000-0000-0000000000f2';
    raise exception 'FALHA: aceitou perfil financeiro inválido';
  exception when check_violation then null;
  end;
end $$;

set role authenticated;
-- Admin do financeiro cadastra empresa, centro e liga uma frente
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
insert into public.empresas (id, dados) values ('aln', '{"id":"aln","apelido":"ALN","nome":"ALN","ativo":true}');
insert into public.centros (id, dados) values ('rmg', '{"id":"rmg","nome":"RMG Água","empresaId":"aln","apelidos":[],"ativo":true}');
insert into public.fornecedores (id, dados) values ('aco', '{"id":"aco","nome":"Aço Potiguar","forma":"pix","apelidos":[],"ativo":true}');
insert into public.locais (id, dados) values ('pureza', '{"id":"pureza","nome":"RMG Pureza","centroCusto":"RMG Água","centroId":"rmg","ativo":true}');

-- Pagador: lê cadastros e frentes; não grava cadastros; não lê o estoque (itens, movimentos)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$ begin
  assert (select count(*) from public.empresas) = 1, 'pagador lê empresas';
  assert (select count(*) from public.fornecedores) = 1, 'pagador lê fornecedores';
  assert (select count(*) from public.locais) >= 1, 'pagador lê frentes';
  assert (select count(*) from public.itens) = 0, 'FALHA: pagador leu itens do estoque';
  assert (select count(*) from public.movimentos) = 0, 'FALHA: pagador leu movimentos do estoque';
  begin
    insert into public.fornecedores (id, dados) values ('x', '{}');
    raise exception 'FALHA: pagador cadastrou fornecedor';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.locais (id, dados) values ('x', '{}');
    raise exception 'FALHA: pagador criou frente';
  exception when insufficient_privilege then null;
  end;
  update public.empresas set dados = '{}' where id = 'aln';
  assert (select dados ->> 'apelido' from public.empresas where id = 'aln') = 'ALN', 'FALHA: pagador alterou empresa';
end $$;

-- Solicitante: lê os cadastros para pedir
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin
  assert (select count(*) from public.centros) = 1, 'solicitante lê centros';
end $$;

-- Almoxarife sem financeiro: continua com as frentes, mas não vê os cadastros do financeiro
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from public.locais) >= 1, 'almoxarife lê frentes';
  assert (select count(*) from public.empresas) = 0, 'FALHA: almoxarife leu empresas';
  assert (select count(*) from public.fornecedores) = 0, 'FALHA: almoxarife leu fornecedores';
  begin
    insert into public.centros (id, dados) values ('x', '{}');
    raise exception 'FALHA: almoxarife criou centro de custo';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Consultor sem financeiro: nada
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.locais) = 0, 'FALHA: consultor leu frentes';
  assert (select count(*) from public.empresas) = 0, 'FALHA: consultor leu empresas';
end $$;

-- Sem login: nada
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.centros) = 0, 'FALHA: centros sem login';
end $$;
reset role;
\echo 'Financeiro etapa 1 OK'

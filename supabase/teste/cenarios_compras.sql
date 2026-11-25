-- Financeiro: compras a faturar (fatura semanal). Roda depois de cenarios_pedidos.sql.
\set ON_ERROR_STOP on
set role authenticated;
-- ids: admin ...ad · pagadora ...f1 · solicitante ...f2 · almoxarife ...0a · consultor ...0c

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
insert into public.fornecedores (id, dados) values ('loja', '{"id":"loja","nome":"Casa do Construtor","forma":"fatura","diaFechamento":"sexta","apelidos":[],"ativo":true}');

-- Solicitante e almoxarife lançam; loja que não é de fatura é recusada
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
insert into public.compras (id, dados) values
  ('c1', '{"id":"c1","fornecedorId":"loja","valor":450,"centroId":"rmg","status":"aberta","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"}}');
do $$ begin
  begin
    insert into public.compras (id, dados) values ('x1', '{"id":"x1","fornecedorId":"aco","valor":10,"centroId":"rmg","status":"aberta","criado":{"id":"00000000-0000-0000-0000-0000000000f2"}}');
    raise exception 'FALHA: aceitou compra em loja que não é de fatura';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    insert into public.compras (id, dados) values ('x2', '{"id":"x2","fornecedorId":"loja","valor":10,"centroId":"rmg","status":"em_fatura","criado":{"id":"00000000-0000-0000-0000-0000000000f2"}}');
    raise exception 'FALHA: criou compra já faturada';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.compras (id, dados) values ('x3', '{"id":"x3","fornecedorId":"loja","valor":10,"centroId":"rmg","status":"aberta","criado":{"id":"00000000-0000-0000-0000-0000000000ad"}}');
    raise exception 'FALHA: lançou em nome de outro';
  exception when insufficient_privilege then null; end;
  -- não altera o valor depois de lançada
  begin
    update public.compras set dados = jsonb_set(dados, '{valor}', '1') where id = 'c1';
    raise exception 'FALHA: solicitante mudou o valor';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  -- não marca como faturada
  begin
    update public.compras set dados = jsonb_set(dados, '{status}', '"em_fatura"') where id = 'c1';
    raise exception 'FALHA: solicitante fechou fatura';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.anexos (id, dados) values ('ac1', '{"id":"ac1","grupo":"c1","formato":"imagem"}');
insert into storage.objects (bucket_id, name) values ('anexos', 'c1/ac1.jpg');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.compras (id, dados) values
  ('c2', '{"id":"c2","fornecedorId":"loja","valor":100,"centroId":"rmg","status":"aberta","criado":{"id":"00000000-0000-0000-0000-00000000000a","nome":"Marilia"}}');
do $$ begin
  assert (select count(*) from public.compras) = 1, 'almoxarife vê só a que lançou';
  assert (select count(*) from storage.objects where name = 'c1/ac1.jpg') = 1, 'almoxarife do galpão lê arquivos';
end $$;

-- Pagadora vê todas e fecha a fatura
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$ begin
  assert (select count(*) from public.compras) = 2, 'pagadora vê todas';
  update public.compras set dados = jsonb_set(jsonb_set(dados, '{status}', '"em_fatura"'), '{pedidoId}', '"p9"') where id = 'c1';
  assert (select dados ->> 'status' from public.compras where id = 'c1') = 'em_fatura', 'pagadora fecha fatura';
  begin
    update public.compras set dados = jsonb_set(dados, '{status}', '"cancelada"') where id = 'c1';
    raise exception 'FALHA: cancelou compra faturada';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  update public.compras set dados = jsonb_set(dados, '{status}', '"aberta"') where id = 'c1';  -- pedido cancelado: volta
end $$;

-- Quem lançou cancela a sua; outro solicitante não vê a compra alheia
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin
  update public.compras set dados = jsonb_set(dados, '{status}', '"cancelada"') where id = 'c1';
  assert (select dados ->> 'status' from public.compras where id = 'c1') = 'cancelada', 'solicitante cancela a sua';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from public.compras) = 0, 'FALHA: consultor leu compras';
  assert (select count(*) from storage.objects where name = 'c1/ac1.jpg') = 0, 'FALHA: consultor leu comprovante';
end $$;
reset role;
\echo 'Financeiro: compras a faturar OK'

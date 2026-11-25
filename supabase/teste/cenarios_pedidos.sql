-- Financeiro etapa 2: pedidos de pagamento. Roda depois de cenarios_financeiro.sql.
\set ON_ERROR_STOP on
set role authenticated;
-- ids: admin ...ad · pagadora ...f1 · solicitante ...f2

-- Solicitante abre pedidos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
insert into public.pedidos (id, dados) values
  ('p1', '{"id":"p1","tipo":"pix","status":"enviado","valor":120,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc","em":"2026-11-25T10:00:00Z"},"historico":[]}'),
  ('p2', '{"id":"p2","tipo":"pix","status":"enviado","valor":800,"aprovador":"admin","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc","em":"2026-11-25T10:00:00Z"},"historico":[]}'),
  ('p3', '{"id":"p3","tipo":"reembolso","status":"enviado","valor":100,"aprovador":"pagador","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc","em":"2026-11-25T10:00:00Z"},"historico":[]}');
do $$ begin
  -- aprovação exigida errada é recusada (valor alto declarado como "nenhum")
  begin
    insert into public.pedidos (id, dados) values ('x1', '{"id":"x1","tipo":"pix","status":"enviado","valor":5000,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2"},"historico":[]}');
    raise exception 'FALHA: aceitou aprovação exigida errada';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  -- pedido em nome de outra pessoa
  begin
    insert into public.pedidos (id, dados) values ('x2', '{"id":"x2","tipo":"pix","status":"enviado","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000ad"},"historico":[]}');
    raise exception 'FALHA: criou pedido em nome de outro';
  exception when insufficient_privilege then null; end;
  -- novo já como pago
  begin
    insert into public.pedidos (id, dados) values ('x3', '{"id":"x3","tipo":"pix","status":"pago","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2"},"historico":[]}');
    raise exception 'FALHA: criou pedido já pago';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  assert (select count(*) from public.pedidos) = 3, 'solicitante vê os seus';
  -- edita o próprio enquanto enviado e cancela
  update public.pedidos set dados = jsonb_set(dados, '{descricao}', '"cimento"') where id = 'p1';
  assert (select dados ->> 'descricao' from public.pedidos where id = 'p1') = 'cimento', 'solicitante edita o seu';
  -- não consegue aprovar nem pagar
  begin
    update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 'p1';
    raise exception 'FALHA: solicitante aprovou o próprio pedido';
  exception when insufficient_privilege then null; end;
end $$;

-- Pagadora: vê todos, confere, aprova o que pode, não aprova o que é do administrador
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$ begin
  assert (select count(*) from public.pedidos) = 3, 'pagadora vê todos';
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 'p1';       -- até R$ 300: sem aprovação
  assert (select dados ->> 'status' from public.pedidos where id = 'p1') = 'pronto', 'pagadora libera pedido pequeno';
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"aprovacao"') where id = 'p3';
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 'p3';        -- reembolso até 150: pagadora aprova
  assert (select dados ->> 'status' from public.pedidos where id = 'p3') = 'pronto', 'pagadora aprova reembolso pequeno';
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"aprovacao"') where id = 'p2';
  begin
    update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 'p2';
    raise exception 'FALHA: pagadora aprovou pedido de R$ 800';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    update public.pedidos set dados = jsonb_set(dados, '{status}', '"rejeitado"') where id = 'p2';
    raise exception 'FALHA: pagadora rejeitou';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    update public.pedidos set dados = jsonb_set(jsonb_set(dados, '{valor}', '50'), '{status}', '"pronto"') where id = 'p2';
    raise exception 'FALHA: pagadora baixou o valor e liberou';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  -- paga
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"pago"') where id = 'p1';
  assert (select dados ->> 'status' from public.pedidos where id = 'p1') = 'pago', 'pagadora paga';
  begin
    update public.pedidos set dados = jsonb_set(dados, '{status}', '"pago"') where id = 'p2';
    raise exception 'FALHA: pagou sem estar pronto';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;

-- Pedido da própria pagadora: sempre precisa de administrador
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
insert into public.pedidos (id, dados) values
  ('p4', '{"id":"p4","tipo":"pix","status":"enviado","valor":50,"aprovador":"admin","criado":{"id":"00000000-0000-0000-0000-0000000000f1","nome":"Pag","em":"2026-11-25T10:00:00Z"},"historico":[]}');
do $$ begin
  begin
    insert into public.pedidos (id, dados) values ('p5', '{"id":"p5","tipo":"pix","status":"enviado","valor":50,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f1"},"historico":[]}');
    raise exception 'FALHA: pedido da pagadora sem aprovação do administrador';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 'p4';
    raise exception 'FALHA: pagadora liberou o próprio pedido';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;

-- Administrador: aprova o que a pagadora não pode e rejeita
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
do $$ begin
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 'p2';
  assert (select dados ->> 'status' from public.pedidos where id = 'p2') = 'pronto', 'admin aprova';
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"aprovacao"') where id = 'p4';
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"pronto"') where id = 'p4';
  assert (select dados ->> 'status' from public.pedidos where id = 'p4') = 'pronto', 'admin aprova o pedido da pagadora';
  update public.pedidos set dados = jsonb_set(dados, '{status}', '"rejeitado"') where id = 'p3';
  assert (select count(*) from public.pedidos) = 4, 'admin vê todos';
end $$;

-- Outro solicitante e o almoxarife não veem pedidos dos outros
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin assert (select count(*) from public.pedidos) = 0, 'FALHA: almoxarife sem financeiro leu pedidos'; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin assert (select count(*) from public.pedidos) = 3, 'solicitante vê só os seus'; end $$;

-- Anexos: financeiro envia; só quem pode ler os pedidos lê os arquivos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
insert into public.anexos (id, dados) values ('a1', '{"id":"a1","grupo":"p1","formato":"pdf"}');
insert into storage.objects (bucket_id, name) values ('anexos', 'p1/a1.pdf');
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'anexos') = 1, 'solicitante lê o arquivo do próprio pedido';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'anexos' and name = 'p1/a1.pdf') = 1, 'pagadora lê arquivos'; end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin assert (select count(*) from storage.objects where bucket_id = 'anexos') = 0, 'FALHA: consultor leu arquivos'; end $$;
reset role;
\echo 'Financeiro etapa 2 (pedidos) OK'

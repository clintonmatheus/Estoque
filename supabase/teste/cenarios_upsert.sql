-- O app grava com "upsert" (INSERT ... ON CONFLICT DO UPDATE). As regras de criação não podem
-- barrar quem tem direito de alterar um registro que já existe (conferir, aprovar, pagar, fechar fatura).
-- Roda depois de cenarios_compras.sql. ids: admin ...ad · pagadora ...f1 · solicitante ...f2 · almoxarife ...0a
\set ON_ERROR_STOP on
set role authenticated;

-- Solicitante abre um pedido e uma compra (insert normal)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
insert into public.pedidos (id, dados) values
  ('u1', '{"id":"u1","tipo":"pix","status":"enviado","valor":135,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"},"historico":[]}');
insert into public.compras (id, dados) values
  ('uc1', '{"id":"uc1","fornecedorId":"loja","valor":50,"centroId":"rmg","status":"aberta","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"}}');
insert into public.pedidos (id, dados) values
  ('u3', '{"id":"u3","tipo":"pix","status":"enviado","valor":800,"aprovador":"admin","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"},"historico":[]}');
-- o solicitante regrava o próprio pedido (editar) e cancela outro: também por upsert
insert into public.pedidos (id, dados) values
  ('u2', '{"id":"u2","tipo":"pix","status":"enviado","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"},"historico":[]}');
insert into public.pedidos (id, dados) values
  ('u2', '{"id":"u2","tipo":"pix","status":"cancelado","valor":10,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"},"historico":[]}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin assert (select dados ->> 'status' from public.pedidos where id = 'u2') = 'cancelado', 'solicitante cancela por upsert'; end $$;

-- Pagadora confere (enviado -> pronto) e paga por upsert
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
insert into public.pedidos (id, dados) values
  ('u1', '{"id":"u1","tipo":"pix","status":"pronto","valor":135,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"},"historico":[]}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin assert (select dados ->> 'status' from public.pedidos where id = 'u1') = 'pronto', 'pagadora confere por upsert'; end $$;
insert into public.pedidos (id, dados) values
  ('u1', '{"id":"u1","tipo":"pix","status":"pago","valor":135,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"},"historico":[]}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin assert (select dados ->> 'status' from public.pedidos where id = 'u1') = 'pago', 'pagadora paga por upsert'; end $$;

-- As travas continuam valendo por upsert: pagadora não aprova o que é do administrador nem baixa o valor
do $$ begin
  begin
    insert into public.pedidos (id, dados) values
      ('u3', '{"id":"u3","tipo":"pix","status":"pronto","valor":800,"aprovador":"admin","criado":{"id":"00000000-0000-0000-0000-0000000000f2"},"historico":[]}')
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: pagadora liberou por upsert pedido de R$ 800';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
  begin
    insert into public.pedidos (id, dados) values
      ('u3', '{"id":"u3","tipo":"pix","status":"pronto","valor":50,"aprovador":"nenhum","criado":{"id":"00000000-0000-0000-0000-0000000000f2"},"historico":[]}')
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: pagadora baixou valor e liberou por upsert';
  exception when raise_exception then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;

-- Solicitante não consegue "pagar" nem mexer no pedido alheio por upsert
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin
  begin
    insert into public.pedidos (id, dados) values
      ('u3', '{"id":"u3","tipo":"pix","status":"pago","valor":800,"aprovador":"admin","criado":{"id":"00000000-0000-0000-0000-0000000000f2"},"historico":[]}')
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: solicitante pagou por upsert';
  exception when raise_exception or insufficient_privilege then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;

-- Administrador aprova por upsert pedido de outra pessoa
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', false);
insert into public.pedidos (id, dados) values
  ('u3', '{"id":"u3","tipo":"pix","status":"aprovacao","valor":800,"aprovador":"admin","criado":{"id":"00000000-0000-0000-0000-0000000000f2"},"historico":[]}')
  on conflict (id) do update set dados = excluded.dados;
insert into public.pedidos (id, dados) values
  ('u3', '{"id":"u3","tipo":"pix","status":"pronto","valor":800,"aprovador":"admin","criado":{"id":"00000000-0000-0000-0000-0000000000f2"},"historico":[]}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin assert (select dados ->> 'status' from public.pedidos where id = 'u3') = 'pronto', 'admin aprova por upsert'; end $$;

-- Pagadora fecha a fatura (marca a compra do solicitante) por upsert
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
insert into public.compras (id, dados) values
  ('uc1', '{"id":"uc1","fornecedorId":"loja","valor":50,"centroId":"rmg","status":"em_fatura","pedidoId":"u1","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"}}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin assert (select dados ->> 'status' from public.compras where id = 'uc1') = 'em_fatura', 'pagadora fecha fatura por upsert'; end $$;

-- Solicitante cancela a própria compra aberta por upsert; não consegue faturar por upsert
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
insert into public.compras (id, dados) values
  ('uc2', '{"id":"uc2","fornecedorId":"loja","valor":20,"centroId":"rmg","status":"aberta","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"}}');
do $$ begin
  begin
    insert into public.compras (id, dados) values
      ('uc2', '{"id":"uc2","fornecedorId":"loja","valor":20,"centroId":"rmg","status":"em_fatura","criado":{"id":"00000000-0000-0000-0000-0000000000f2"}}')
      on conflict (id) do update set dados = excluded.dados;
    raise exception 'FALHA: solicitante fechou fatura por upsert';
  exception when raise_exception or insufficient_privilege then if sqlerrm like 'FALHA%' then raise; end if; end;
end $$;
insert into public.compras (id, dados) values
  ('uc2', '{"id":"uc2","fornecedorId":"loja","valor":20,"centroId":"rmg","status":"cancelada","criado":{"id":"00000000-0000-0000-0000-0000000000f2","nome":"Enc"}}')
  on conflict (id) do update set dados = excluded.dados;
do $$ begin assert (select dados ->> 'status' from public.compras where id = 'uc2') = 'cancelada', 'solicitante cancela compra por upsert'; end $$;
reset role;
\echo 'Gravação por upsert OK'

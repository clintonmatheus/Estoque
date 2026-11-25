\set ON_ERROR_STOP on
do $$ begin
  assert (select dados ->> 'status' from public.pedidos where id = 'r-p1') = 'pago', 'pedido pago restaurado apesar do gatilho';
  assert (select dados ->> 'descricao' from public.pedidos where id = 'r-p1') = 'Restaurado d''água', 'texto com aspas';
  assert (select nome from public.perfis where id = '00000000-0000-0000-0000-0000000000e1') = 'Augusto R', 'perfil restaurado';
  assert not exists (select 1 from public.perfis where id = '00000000-0000-0000-0000-0000000000ff'), 'perfil sem login ignorado';
  assert (select count(*) from public.auditoria where registro = 'r-p1') >= 1, 'restauração fica na auditoria';
end $$;
\echo 'Restauração OK'

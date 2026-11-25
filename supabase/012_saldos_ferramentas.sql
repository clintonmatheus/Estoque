-- Caio e Augusto (papel "saldos") também veem as ferramentas e equipamentos locados: onde estão e com quem.
-- Só leitura. Funcionários de EPI (com CPF e tamanhos) continuam fora; materiais seguem só pela função saldos().
-- Rode uma vez no SQL Editor do Supabase "Estoque", depois da 011. É seguro rodar de novo.
create or replace function public.ve_ferramentas() returns boolean
language sql stable security definer set search_path = public as $$
  select public.ve_estoque() or coalesce(public.papel_estoque() = 'saldos', false)
$$;

drop policy if exists "leitura" on public.bens;
create policy "leitura" on public.bens for select to authenticated using (public.ve_ferramentas());
drop policy if exists "leitura" on public.movimentos_bens;
create policy "leitura" on public.movimentos_bens for select to authenticated using (public.ve_ferramentas());
drop policy if exists "leitura" on public.funcionarios;
create policy "leitura" on public.funcionarios for select to authenticated using (
  public.ve_estoque() or (public.papel_estoque() = 'saldos' and coalesce(dados ->> 'grupo', 'galpao') <> 'epi')
);

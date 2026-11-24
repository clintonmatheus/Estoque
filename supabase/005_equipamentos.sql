-- Etapa 2 (rode uma vez no SQL Editor do Supabase "Estoque"): ferramentas e equipamentos locados.
-- Cria as tabelas de cadastro (bens) e de movimentações de posse. É seguro rodar de novo.
--
-- Se você rodou a primeira versão da Etapa 2 (004 com ferramentas/emprestimos), essas duas tabelas antigas
-- ficam sem uso; o app novo não as lê. Podem ser apagadas depois, se estiverem vazias:
--   drop table public.emprestimos; drop table public.ferramentas;

do $$
declare t text;
begin
  foreach t in array array['bens', 'movimentos_bens'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
        dados jsonb not null,
        alterado_por uuid references auth.users (id) default auth.uid(),
        servidor_em timestamptz not null default now()
      );
      create index if not exists %2$I on public.%1$I (servidor_em);
    $f$, t, 'idx_' || t || '_servidor_em');

    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists marcar on public.%I', t);
    execute format('create trigger marcar before insert or update on public.%I for each row execute function public.marcar_gravacao()', t);
    execute format('drop policy if exists "leitura" on public.%I', t);
    execute format('drop policy if exists "criar" on public.%I', t);
    execute format('drop policy if exists "alterar" on public.%I', t);
    -- Só admin e almoxarife (como nas demais tabelas); o consultor não vê empréstimos.
    execute format('create policy "leitura" on public.%I for select to authenticated using (public.pode_lancar())', t);
    execute format('create policy "criar" on public.%I for insert to authenticated with check (public.pode_lancar())', t);
    execute format('create policy "alterar" on public.%I for update to authenticated using (public.pode_lancar()) with check (public.pode_lancar())', t);

    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;


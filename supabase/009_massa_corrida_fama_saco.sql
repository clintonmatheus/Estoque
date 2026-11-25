-- Corrige a embalagem da MASSA CORRIDA FAMA: é saco, não balde. Rode uma vez no SQL Editor do Supabase "Estoque".
-- É seguro rodar de novo. Os aparelhos recebem a correção na próxima sincronização; as quantidades não mudam, só o nome da unidade.
update public.itens
   set dados = case
         when dados -> 'embalagem' ->> 'nome' = 'balde'
           then jsonb_set(jsonb_set(dados, '{unidade}', '"saco"'), '{embalagem,nome}', '"saco"')
         else jsonb_set(dados, '{unidade}', '"saco"')
       end
 where (id = 'i-massa-corrida-fama' or upper(dados ->> 'nome') = 'MASSA CORRIDA FAMA')
   and (dados ->> 'unidade' is distinct from 'saco' or dados -> 'embalagem' ->> 'nome' = 'balde');

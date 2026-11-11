-- Rode depois de criar os usuários em Authentication → Users → Add user (marque "Auto Confirm User").
-- Troque os e-mails pelos reais e rode no SQL Editor.
update public.perfis p set nome = v.nome, papel = v.papel
from (values
  ('EMAIL_DO_CLINTON', 'Clinton', 'admin'),
  ('EMAIL_DA_MARILIA', 'Marilia', 'almoxarife'),
  ('EMAIL_DO_ARTHUR',  'Arthur',  'consultor'),
  ('EMAIL_DA_JOANA',   'Joana',   'consultor')
) as v (email, nome, papel)
join auth.users u on lower(u.email) = lower(v.email)
where p.id = u.id;

-- Conferência: deve listar os 4 usuários com o papel certo
select u.email, p.nome, p.papel from public.perfis p join auth.users u on u.id = p.id order by p.papel, p.nome;

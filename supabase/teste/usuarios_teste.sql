update public.perfis p set nome = v.nome, papel = v.papel
from (values ('clinton@x.com', 'Clinton', 'admin'), ('marilia@x.com', 'Marilia', 'almoxarife'), ('arthur@x.com', 'Arthur', 'consultor')) as v (email, nome, papel)
join auth.users u on lower(u.email) = lower(v.email)
where p.id = u.id;

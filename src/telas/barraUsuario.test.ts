import { textoSync } from './BarraUsuario';

describe('texto do estado de sincronização', () => {
  it('só diz "sem conexão" quando é falta de conexão; recusa do servidor mostra o motivo', () => {
    expect(textoSync({ sincronizando: false, recebidos: 0, erro: 'Sem conexão' })).toBe('Sem conexão — dados salvos no aparelho');
    expect(textoSync({ sincronizando: false, recebidos: 0, erro: 'new row violates row-level security policy for table "pedidos"' }))
      .toBe('Servidor recusou uma alteração: new row violates row-level security policy for table "pedidos"');
  });
});

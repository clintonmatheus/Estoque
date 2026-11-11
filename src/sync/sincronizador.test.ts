import { Estoque } from '../dados/estoque';
import type { Usuario } from '../domain/tipos';
import { criarArmazenamentoMemoria } from '../storage/memoria';
import { CLINTON, MARILIA } from '../testes/fabricas';
import { RemotoFalso } from './remoto-falso';
import { Sincronizador } from './sincronizador';

let relogio = 0;
function aparelho(usuario: Usuario, remoto: RemotoFalso) {
  const armazenamento = criarArmazenamentoMemoria();
  const estoque = new Estoque(armazenamento, usuario, {
    agora: () => new Date(Date.UTC(2026, 10, 11, 12, 0, relogio++)).toISOString(),
    novoId: () => `${usuario.id}-${relogio++}`,
  });
  return { estoque, armazenamento, sync: new Sincronizador(armazenamento, remoto) };
}

async function preparar() {
  const remoto = new RemotoFalso();
  const a = aparelho(MARILIA, remoto);
  const b = aparelho(CLINTON, remoto);
  const tinta = await a.estoque.salvarItem({ nome: 'Tinta', unidade: 'lata', estoqueMinimo: 0, ativo: true });
  const local = await a.estoque.salvarLocal({ nome: 'Riachuelo', centroCusto: 'RMG', ativo: true });
  const joao = await a.estoque.salvarFuncionario({ nome: 'João', ativo: true });
  return { remoto, a, b, tinta, local, joao };
}

describe('Sincronizador', () => {
  it('cadastros e lançamentos de um aparelho aparecem no outro', async () => {
    const { a, b, tinta } = await preparar();
    await a.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 10, custoUnitario: 50 }] });
    expect(await a.sync.sincronizar()).toEqual({ enviados: 4, recebidos: 0 });
    expect(await a.armazenamento.fila.listar()).toEqual([]);
    expect((await b.sync.sincronizar()).recebidos).toBe(4);
    expect((await b.estoque.posicao()).itens[tinta.id].quantidade).toBe(10);
    expect((await b.sync.sincronizar()).recebidos).toBe(0);
  });

  it('sem conexão mantém a fila e tenta de novo depois', async () => {
    const { remoto, a, tinta } = await preparar();
    await a.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 1, custoUnitario: 5 }] });
    remoto.falharEnvios = true;
    await expect(a.sync.sincronizar()).rejects.toThrow('Sem conexão');
    expect(await a.armazenamento.fila.listar()).toHaveLength(4);
    remoto.falharEnvios = false;
    expect((await a.sync.sincronizar()).enviados).toBe(4);
  });

  it('alteração local pendente não é sobrescrita pelo servidor', async () => {
    const { a, b, tinta } = await preparar();
    await a.sync.sincronizar();
    await b.sync.sincronizar();
    await b.estoque.salvarItem({ ...tinta, estoqueMinimo: 9 });
    await a.estoque.salvarItem({ ...tinta, estoqueMinimo: 3 });
    await b.sync.sincronizar();
    // A ainda não enviou: ao baixar, a versão local (3) prevalece e depois vai para o servidor
    await a.sync.sincronizar();
    expect((await a.armazenamento.itens.obter(tinta.id))?.estoqueMinimo).toBe(3);
    await b.sync.sincronizar();
    expect((await b.armazenamento.itens.obter(tinta.id))?.estoqueMinimo).toBe(3);
  });

  it('item recusado pelo servidor sai da fila e a cópia local volta à do servidor', async () => {
    const { remoto, a, tinta } = await preparar();
    await a.sync.sincronizar();
    await a.estoque.salvarItem({ ...tinta, estoqueMinimo: 7 });
    remoto.recusar.add(tinta.id);
    await expect(a.sync.sincronizar()).rejects.toThrow('Sem permissão');
    expect(await a.armazenamento.fila.listar()).toEqual([]);
    expect((await a.armazenamento.itens.obter(tinta.id))?.estoqueMinimo).toBe(0);
  });

  it('foto anexada: envia o arquivo antes dos dados e o outro aparelho baixa', async () => {
    const { remoto, a, b, tinta, local, joao } = await preparar();
    await a.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: tinta.id, quantidade: 5, custoUnitario: 5 }] });
    const [s] = await a.estoque.lancar({ tipo: 'saida', data: '2026-11-11', localId: local.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] });
    const anexo = await a.estoque.anexarFoto(s.grupo, 'file://local/pedido.jpg');
    await a.sync.sincronizar();
    expect(remoto.arquivosEnviados).toEqual([anexo.id]);
    expect((await a.armazenamento.anexos.obter(anexo.id))?.uri).toBe('file://local/pedido.jpg');
    await b.sync.sincronizar();
    const [noB] = await b.estoque.anexos(s.grupo);
    expect(noB.uri).toBe(`file://baixadas/${anexo.id}.jpg`);
    // nova sincronização não apaga o arquivo baixado
    await b.sync.sincronizar();
    expect((await b.estoque.anexos(s.grupo))[0].uri).toBe(`file://baixadas/${anexo.id}.jpg`);
  });

  it('chamadas simultâneas compartilham a mesma sincronização', async () => {
    const { a } = await preparar();
    const [r1, r2] = await Promise.all([a.sync.sincronizar(), a.sync.sincronizar()]);
    expect(r1).toBe(r2);
  });
});

import { saldosPorTamanho } from '../domain/epi';
import { estoqueComCadastros } from '../testes/fabricas';

async function cenario() {
  const c = await estoqueComCadastros();
  const bota = await c.estoque.salvarItem({ nome: 'Bota', unidade: 'par', estoqueMinimo: 0, ativo: true, categoria: 'EPI', tamanhos: ['38', '39', '40'] });
  const ze = await c.estoque.salvarFuncionario({ nome: 'Zé', ativo: true, grupo: 'epi', tamanhos: { calcado: '39' } });
  return { ...c, bota, ze };
}
const saldo = async (c: Awaited<ReturnType<typeof cenario>>) => saldosPorTamanho(await c.estoque.movimentos()).get(c.bota.id);

describe('saldo de EPI por tamanho', () => {
  it('compra por tamanho, entrega baixa só o tamanho entregue e tamanho sem saldo é recusado', async () => {
    const c = await cenario();
    await expect(c.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: c.bota.id, quantidade: 3 }] })).rejects.toThrow('Informe o tamanho de BOTA');
    await c.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [
      { itemId: c.bota.id, quantidade: 2, tamanho: '38' }, { itemId: c.bota.id, quantidade: 3, tamanho: '39' }, { itemId: c.bota.id, quantidade: 4, tamanho: '40' }] });
    expect(await saldo(c)).toEqual(new Map([['38', 2], ['39', 3], ['40', 4]]));
    expect((await c.estoque.posicao()).itens[c.bota.id].quantidade).toBe(9);

    await c.estoque.lancar({ tipo: 'epi', data: '2026-11-11', funcionarioId: c.ze.id, linhas: [{ itemId: c.bota.id, quantidade: 2, tamanho: '38' }] });
    await expect(c.estoque.lancar({ tipo: 'epi', data: '2026-11-11', funcionarioId: c.ze.id, linhas: [{ itemId: c.bota.id, quantidade: 1, tamanho: '38' }] }))
      .rejects.toThrow('Saldo insuficiente: BOTA tamanho 38 — disponível 0');
    await expect(c.estoque.lancar({ tipo: 'epi', data: '2026-11-11', funcionarioId: c.ze.id, linhas: [{ itemId: c.bota.id, quantidade: 1, tamanho: '44' }] }))
      .rejects.toThrow('BOTA não tem o tamanho 44 cadastrado (tamanhos: 38, 39, 40)');
    expect(await saldo(c)).toEqual(new Map([['38', 0], ['39', 3], ['40', 4]]));
  });

  it('compra de tamanho novo acrescenta o tamanho ao item; cancelar a compra não pode deixar tamanho negativo', async () => {
    const c = await cenario();
    const [compra] = await c.estoque.lancar({ tipo: 'entrada', data: '2026-11-10', linhas: [{ itemId: c.bota.id, quantidade: 1, tamanho: '41' }] });
    expect((await c.estoque.itens(true)).find((i) => i.id === c.bota.id)?.tamanhos).toEqual(['38', '39', '40', '41']);
    await c.estoque.lancar({ tipo: 'epi', data: '2026-11-11', funcionarioId: c.ze.id, linhas: [{ itemId: c.bota.id, quantidade: 1, tamanho: '41' }] });
    await expect(c.estoque.cancelarMovimento(compra.id, 'erro')).rejects.toThrow('tamanho 41');
  });

  it('inventário conta por tamanho e zera o saldo antigo lançado sem tamanho', async () => {
    const c = await cenario();
    // saldo antigo, de antes do controle por tamanho
    const semTam = await c.estoque.salvarItem({ ...c.bota, tamanhos: [] });
    await c.estoque.lancar({ tipo: 'entrada', data: '2026-11-01', linhas: [{ itemId: semTam.id, quantidade: 9 }] });
    await c.estoque.salvarItem({ ...semTam, tamanhos: ['38', '39', '40'] });
    expect(await saldo(c)).toEqual(new Map([['', 9]]));
    await expect(c.estoque.lancar({ tipo: 'epi', data: '2026-11-11', funcionarioId: c.ze.id, linhas: [{ itemId: c.bota.id, quantidade: 1, tamanho: '39' }] }))
      .rejects.toThrow('tamanho 39 — disponível 0');
    await expect(c.estoque.registrarInventario('2026-11-12', [{ itemId: c.bota.id, contado: 9 }])).rejects.toThrow('Informe o tamanho');
    const aj = await c.estoque.registrarInventario('2026-11-12', [
      { itemId: c.bota.id, tamanho: '38', contado: 2 }, { itemId: c.bota.id, tamanho: '39', contado: 3 }, { itemId: c.bota.id, tamanho: '40', contado: 4 }]);
    expect(aj.map((m) => `${m.tamanho ?? 'sem'}:${m.quantidade}`)).toEqual(['38:2', '39:3', '40:4', 'sem:-9']);
    expect(await saldo(c)).toEqual(new Map([['', 0], ['38', 2], ['39', 3], ['40', 4]]));
    expect((await c.estoque.posicao()).itens[c.bota.id].quantidade).toBe(9);
  });
});

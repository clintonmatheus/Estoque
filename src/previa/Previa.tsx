import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { SaldoSimples } from '../auth/autenticacao';
import { Estoque } from '../dados/estoque';
import { Financeiro } from '../dados/financeiro';
import { calcularPosicao } from '../domain/estoque';
import type { Posse, Usuario } from '../domain/tipos';
import { criarArmazenamentoMemoria } from '../storage/memoria';
import { cores } from '../telas/estilos';
import { LoginTela } from '../telas/LoginTela';
import { Raiz } from '../telas/Raiz';

/**
 * Prévia com dados de exemplo (só para as telas do manual de treinamento).
 * Ativada no build web com EXPO_PUBLIC_PREVIA=1. ?perfil= almoxarife (Marilia, padrão), financeiro (Clinton), pagador (Joana),
 * consultor (Arthur, administrador), solicitante (Caio) ou login muda a pessoa.
 */
const HOJE = '2026-11-24';
const MARILIA: Usuario = { id: 'u-marilia', nome: 'Marilia', papel: 'almoxarife', financeiro: 'solicitante' };
const ARTHUR: Usuario = { id: 'u-arthur', nome: 'Arthur', papel: 'consultor', financeiro: 'admin' };
const CLINTON: Usuario = { id: 'u-clinton', nome: 'Clinton', papel: 'admin', financeiro: 'admin', paga: true };
const JOANA: Usuario = { id: 'u-joana', nome: 'Joana', papel: 'controle', financeiro: 'pagador' };
const CAIO: Usuario = { id: 'u-caio', nome: 'Caio', papel: 'nenhum', financeiro: 'solicitante' };
const PERFIS: Record<string, Usuario> = { consultor: ARTHUR, financeiro: CLINTON, pagador: JOANA, solicitante: CAIO, almoxarife: MARILIA };

const armazenamento = criarArmazenamentoMemoria();

/** Cadastros do financeiro de exemplo (os mesmos nomes da planilha modelo). */
async function montarFinanceiro(): Promise<void> {
  let s = 0;
  const f = new Financeiro(armazenamento, CLINTON, { agora: () => `${HOJE}T12:00:00.000Z`, novoId: () => `f${++s}` });
  await f.criarCadastrosIniciais();
  const [aln, passos] = await f.empresas();
  await f.salvarEmpresa({ ...aln, cnpj: '11.222.333/0001-81' }); // CNPJ fictício (exemplo)
  const rmg = await f.salvarCentro({ nome: 'RMG ÁGUA', empresaId: aln.id, apelidos: ['CAIXA RMG'], ativo: true });
  await f.salvarCustoFixo(rmg.id, { descricao: 'Despesa geral', tipo: 'Despesa geral', valor: 20000, inicio: '2026-08' });
  for (const n of ['RMG MACAIBA', 'RMG PUREZA', 'RMG PEDRA GRANDE', 'RMG SÃO PEDRO DO POTENGI']) await f.salvarFrente({ nome: n, centroId: rmg.id, ativo: true });
  const funpec = await f.salvarCentro({ nome: 'FUNPEC', empresaId: passos.id, apelidos: ['CAIXA FUNPEC'], ativo: true });
  await f.salvarFrente({ nome: 'FUNPEC', centroId: funpec.id, ativo: true });
  await f.salvarFornecedor({ nome: 'Aço Potiguar', documento: '05948553000275', chavePix: '05948553000275', forma: 'pix', ativo: true });
  await f.salvarFornecedor({ nome: 'Casa do Construtor', forma: 'fatura', diaFechamento: 'sexta', ativo: true });
  await f.salvarFornecedor({ nome: 'Iquine Distribuidora', forma: 'boleto', ativo: true });
}

async function montar(): Promise<Estoque> {
  let s = 0;
  let t = Date.UTC(2026, 10, 1, 11);
  const e = new Estoque(armazenamento, MARILIA, { agora: () => new Date((t += 60_000)).toISOString(), novoId: () => `d${++s}` });
  await e.importarItensIniciais();
  const itens = await e.itens();
  const riach = await e.salvarLocal({ nome: 'Riachuelo', centroCusto: 'Escritórios da RMG', ativo: true });
  const pedra = await e.salvarLocal({ nome: 'Pedra Grande', centroCusto: 'Escritórios da RMG', ativo: true });
  await e.salvarLocal({ nome: 'Macaíba', centroCusto: 'Escritórios da RMG', ativo: true });
  const ubs = await e.salvarLocal({ nome: 'UBS Felipe Camarão', centroCusto: 'Reforma UBS', ativo: true });
  const joao = await e.salvarFuncionario({ nome: 'João Batista (mestre)', ativo: true });
  const carlos = await e.salvarFuncionario({ nome: 'Carlos Lima (encarregado)', ativo: true });
  await e.salvarFuncionario({ nome: 'Pedro Santos', ativo: true });
  const ze = await e.salvarFuncionario({ nome: 'José Almeida', ativo: true, grupo: 'epi', funcao: 'Servente', tamanhos: { calcado: '41', camisa: 'G', luva: 'G' } });
  const ana = await e.salvarFuncionario({ nome: 'Antônio Costa', ativo: true, grupo: 'epi', funcao: 'Pedreiro', tamanhos: { calcado: '42', camisa: 'M', luva: 'M' } });
  const bota = await e.salvarItem({ nome: 'BOTA DE SEGURANÇA', unidade: 'par', estoqueMinimo: 4, ativo: true, categoria: 'EPI', vidaUtilDias: 180, tipoTamanho: 'calcado', tamanhos: ['38', '39', '40', '41', '42', '43'] });
  const luva = await e.salvarItem({ nome: 'LUVA DE VAQUETA', unidade: 'par', estoqueMinimo: 10, ativo: true, categoria: 'EPI' });

  const comPreco = itens.filter((i) => i.custoReferencia).slice(0, 30);
  await e.lancar({
    tipo: 'entrada', data: '2026-11-03', notaFiscal: '4521', fornecedor: 'Iquine Distribuidora',
    linhas: comPreco.map((i, k) => ({ itemId: i.id, quantidade: k % 7 === 0 ? 2 : 6 + (k % 5) * 3, custoUnitario: i.custoReferencia! })),
  });
  await e.lancar({ tipo: 'entrada', data: '2026-04-01', notaFiscal: '889', fornecedor: 'Casa do EPI', linhas: [{ itemId: bota.id, quantidade: 2, custoUnitario: 89.9, tamanho: '39' }, { itemId: bota.id, quantidade: 3, custoUnitario: 89.9, tamanho: '41' }, { itemId: bota.id, quantidade: 1, custoUnitario: 89.9, tamanho: '42' }, { itemId: luva.id, quantidade: 20, custoUnitario: 18.5 }] });
  for (const [k, i] of comPreco.entries()) if (k % 7 === 0) await e.salvarItem({ ...i, estoqueMinimo: 5 });
  const tinta = comPreco[1];
  await e.lancar({ tipo: 'saida', data: '2026-11-10', localId: riach.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 3 }, { itemId: comPreco[4].id, quantidade: 2 }] });
  await e.lancar({ tipo: 'saida', data: '2026-11-18', localId: ubs.id, funcionarioId: carlos.id, observacao: 'Pedido pelo WhatsApp', linhas: [{ itemId: comPreco[8].id, quantidade: 4 }] });
  await e.lancar({ tipo: 'devolucao', data: '2026-11-20', localId: riach.id, funcionarioId: joao.id, linhas: [{ itemId: tinta.id, quantidade: 1 }] });
  await e.lancar({ tipo: 'epi', data: '2026-05-20', funcionarioId: ze.id, linhas: [{ itemId: bota.id, quantidade: 1, ca: '42291', tamanho: '41', validade: '2026-11-20' }] });
  await e.lancar({ tipo: 'epi', data: '2026-11-05', funcionarioId: ana.id, linhas: [{ itemId: luva.id, quantidade: 2, ca: '31478', tamanho: 'G', validade: '2026-12-05' }] });

  const galpao: Posse = { tipo: 'galpao' };
  const campo = (f: string, l: string): Posse => ({ tipo: 'campo', funcionarioId: f, localId: l });
  const fur = await e.cadastrarBem({ nome: 'Furadeira de impacto', codigo: '03', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
  await e.movimentarBem({ bemId: fur.id, data: '2026-11-12', quantidade: 1, origem: galpao, destino: campo(joao.id, riach.id), prevista: '2026-11-19' });
  await e.cadastrarBem({ nome: 'Furadeira de impacto', codigo: '04', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: galpao, quantidade: 1, data: '2026-11-01' });
  await e.cadastrarBem({ nome: 'Esmerilhadeira', codigo: '01', tipo: 'ferramenta', controle: 'unidade', ativo: true }, { posse: campo(carlos.id, ubs.id), quantidade: 1, data: '2026-11-01' });
  await e.cadastrarBem({ nome: 'Carrinho de mão', tipo: 'ferramenta', controle: 'quantidade', ativo: true }, { posse: galpao, quantidade: 4, data: '2026-11-01' });
  const esc = await e.cadastrarBem({
    nome: 'Escora metálica', tipo: 'locado', controle: 'quantidade', ativo: true,
    locacao: { locadora: 'Agaé Locação', contrato: '1234', valor: 2.5, periodo: 'mes', inicio: '2026-10-01', prevista: '2026-11-28', localCobrancaId: riach.id },
  }, { posse: galpao, quantidade: 100, data: '2026-10-01' });
  await e.movimentarBem({ bemId: esc.id, data: '2026-11-05', quantidade: 60, origem: galpao, destino: campo(joao.id, riach.id) });
  await e.movimentarBem({ bemId: esc.id, data: '2026-11-15', quantidade: 20, origem: campo(joao.id, riach.id), destino: campo(carlos.id, pedra.id), observacao: 'Emprestadas para a laje' });
  await e.cadastrarBem({
    nome: 'Andaime tubular 1,0 x 1,5 m', tipo: 'locado', controle: 'quantidade', ativo: true,
    locacao: { locadora: 'Casa do Construtor', contrato: 'NT-778', valor: 1.2, periodo: 'dia', inicio: '2026-11-01', prevista: '2027-01-31', localCobrancaId: ubs.id },
  }, { posse: campo(carlos.id, ubs.id), quantidade: 30, data: '2026-11-01' });
  await montarFinanceiro();
  return e;
}

export function Previa() {
  const perfil = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('perfil') : null;
  const [estoque, setEstoque] = useState<Estoque>();
  useEffect(() => { void montar().then(setEstoque); }, []);
  if (!estoque) return <ActivityIndicator style={{ flex: 1 }} />;
  const saldos = async (): Promise<SaldoSimples[]> => {
    const p = calcularPosicao(await estoque.movimentos(), {});
    return (await estoque.itens()).map((i) => ({ itemId: i.id, nome: i.nome, unidade: i.unidade, embalagem: i.embalagem, estoqueMinimo: i.estoqueMinimo, categoria: i.categoria, saldo: p.itens[i.id]?.quantidade ?? 0 }));
  };
  let conteudo;
  if (perfil === 'login') conteudo = <LoginTela entrar={async () => { throw new Error('Prévia'); }} onEntrou={() => {}} />;
  else {
    const usuario = PERFIS[perfil ?? ''] ?? MARILIA;
    const opcoes = { agora: () => `${HOJE}T15:00:00.000Z`, novoId: () => `n${Date.now()}${Math.round(Math.random() * 1e6)}` };
    const financeiro = new Financeiro(armazenamento, usuario, opcoes);
    const doUsuario = usuario === MARILIA ? estoque : new Estoque(armazenamento, usuario, opcoes);
    conteudo = (
      <Raiz usuario={usuario} estoque={doUsuario} financeiro={financeiro} carregarSaldos={saldos}
        servicoFotos={{ tirarFoto: async () => undefined, escolherDaGaleria: async () => undefined, escolherDocumento: async () => ({ uri: 'file:///exemplo.pdf', nome: 'exemplo.pdf', formato: 'pdf' as const, bytes: new Uint8Array() }) }}
        saida={{ pdf: async () => {}, xlsx: async () => {} }} hoje={HOJE} agora={() => `${HOJE}T15:00:00.000Z`}
        estadoSync={{ sincronizando: false, recebidos: 0, ultimaEm: `${HOJE}T14:58:00.000Z` }}
        escolherPlanilha={async () => undefined} onSair={() => {}} onSincronizar={() => {}} />
    );
  }
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: cores.fundo }}>{conteudo}</View>
    </SafeAreaProvider>
  );
}

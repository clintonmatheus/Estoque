"""Gera modelos/Cadastros_Financeiro.xlsx (cadastros do financeiro que o app importa).
Os cabeçalhos devem ser iguais aos de src/importacao/cadastrosFinanceiro.ts (há teste conferindo).
Centros e frentes vêm pré-preenchidos com o agrupamento da lista de presença de outubro/2026 e o caixa FUNPEC."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = sys.argv[1] if len(sys.argv) > 1 else '.'
GRAFITE = PatternFill('solid', fgColor='333333')
AZUL = PatternFill('solid', fgColor='E3EEF6')
CAB = Font(bold=True, color='FFFFFF')

wb = Workbook()
ins = wb.active
ins.title = 'Instruções'
texto = [
    ('CADASTROS DO FINANCEIRO', 'titulo'),
    ('Preencha as abas e importe no app: Financeiro → Importar planilha (só administrador do financeiro). O app confere tudo antes de gravar e mostra os erros com aba e linha.', ''),
    ('Não mude o nome das abas nem dos cabeçalhos (linha 1). Pode deixar abas vazias. O que já existe no app não é duplicado.', ''),
    ('', ''),
    ('ABAS', 'secao'),
    ('1. Empresas — nome curto (ALN, Passos), razão social e CNPJ.', ''),
    ('2. Contas bancárias — empresa, banco, agência e conta. "Nome da conta" em branco vira, por exemplo, "BB ALN".', ''),
    ('3. Centros de custo — Tipo: Obra, Administração (rateada entre as obras) ou Estoque/Galpão; há um só de Administração e um só de Galpão para as duas empresas.', ''),
    ('   Situação: Ativo ou Parado (parado continua cadastrado e pode voltar). Empresa do contrato é opcional: qualquer empresa pode pagar custos de qualquer centro.', ''),
    ('   Outros nomes: grafias usadas nos caixas e planilhas, separadas por ponto e vírgula (ex.: CAIXA RMG; RMG AGUA 2). Acentos e maiúsculas já são ignorados.', ''),
    ('4. Frentes de serviço — cada frente e o centro de custo a que pertence. Frente com o mesmo nome que já existe no estoque é só ligada ao centro.', ''),
    ('   As frentes já cadastradas no estoque com um contrato igual ao nome (ou a um outro nome) de um centro são ligadas sozinhas.', ''),
    ('5. Fornecedores — CPF ou CNPJ, chave Pix e forma de pagamento (Pix, Boleto ou Fatura semanal). Dia de fechamento só para fatura semanal.', ''),
    ('6. Tipos de despesa — a lista já vem pronta; acrescente ou complete os outros nomes.', ''),
    ('7. Custos fixos — valor que entra todo mês num centro de custo (lançado no último dia do mês). "Até" em branco = sem fim.', ''),
    ('8. Encargos — percentuais sobre a folha. "A partir de" em branco = vale para todo o histórico. Para mudar depois, use o app (Financeiro → Encargos) ou uma linha com o novo percentual e o mês.', ''),
    ('', ''),
    ('CONFIRA ANTES DE IMPORTAR', 'secao'),
    ('• Centros e frentes vieram da lista de presença de outubro (agrupamento da tabela de contratos) e dos caixas. Corrija o que estiver diferente.', ''),
    ('• CODERN está como Parado. ADM da lista de presença é a frente do centro Administração.', ''),
    ('• Custos fixos: RMG ÁGUA R$ 20.000 desde 08/2026 e PARNAMIRIM R$ 10.000 (confira o mês de início de Parnamirim).', ''),
    ('• CNPJ, conta e chave Pix ficam como texto: digite só os números ou com pontuação, tanto faz.', ''),
]
for i, (t, estilo) in enumerate(texto, start=1):
    c = ins.cell(row=i, column=1, value=t)
    c.alignment = Alignment(wrap_text=True, vertical='top')
    if estilo == 'titulo':
        c.font = Font(bold=True, size=14)
    elif estilo == 'secao':
        c.font = Font(bold=True, color='1F5F8B')
ins.column_dimensions['A'].width = 130


def aba(nome, colunas, linhas, texto_cols=()):
    ws = wb.create_sheet(nome)
    for j, (titulo, largura) in enumerate(colunas, start=1):
        c = ws.cell(row=1, column=j, value=titulo)
        c.fill, c.font = GRAFITE, CAB
        ws.column_dimensions[c.column_letter].width = largura
    ws.freeze_panes = 'A2'
    for i, linha in enumerate(linhas, start=2):
        for j, v in enumerate(linha, start=1):
            ws.cell(row=i, column=j, value=v)
    for col in texto_cols:
        for r in range(2, 501):
            ws[f'{col}{r}'].number_format = '@'
    return ws


def lista(ws, col, formula):
    dv = DataValidation(type='list', formula1=formula, allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f'{col}2:{col}500')


aba('Empresas', [('Nome curto', 14), ('Razão social', 44), ('CNPJ', 22)], [
    ('ALN', 'A. L. N. Serviços e Construções Ltda.', None),
    ('Passos', 'Construtora Passos', None),
], texto_cols='C')

ct = aba('Contas bancárias', [('Empresa', 12), ('Banco', 20), ('Agência', 10), ('Conta', 16), ('Nome da conta', 20)], [
    ('ALN', 'Banco do Brasil'), ('ALN', 'Inter'),
    ('Passos', 'Banco do Brasil'), ('Passos', 'Itaú'), ('Passos', 'Inter'), ('Passos', 'Nubank'),
], texto_cols='CD')
lista(ct, 'A', "='Empresas'!$A$2:$A$50")

CENTROS = [
    ('ESC RMG', 'Obra', 'Ativo', None, 'ESCRITÓRIOS DA RMG'), ('RAG ÁGUA', 'Obra', 'Ativo', None, None), ('RMG ÁGUA', 'Obra', 'Ativo', None, 'CAIXA RMG'),
    ('PARNAMIRIM', 'Obra', 'Ativo', None, None), ('SMS', 'Obra', 'Ativo', None, None), ('CBTU', 'Obra', 'Ativo', None, None),
    ('USF ROCAS', 'Obra', 'Ativo', None, None), ('FUNPEC', 'Obra', 'Ativo', None, 'CAIXA FUNPEC'),
    ('CODERN', 'Obra', 'Parado', None, 'CODERN 2026'), ('ECOVILLE', 'Obra', 'Ativo', None, None), ('GRANJA', 'Obra', 'Ativo', None, None),
    ('Administração', 'Administração', 'Ativo', None, 'ADM; ADMINISTRATIVO'), ('Estoque/Galpão', 'Estoque/Galpão', 'Ativo', None, 'GALPÃO; ESTOQUE'),
]
cc = aba('Centros de custo', [('Centro de custo', 22), ('Tipo', 16), ('Situação', 11), ('Empresa do contrato', 18), ('Outros nomes', 40)], CENTROS)
lista(cc, 'B', '"Obra,Administração,Estoque/Galpão"')
lista(cc, 'C', '"Ativo,Parado"')
lista(cc, 'D', "='Empresas'!$A$2:$A$50")

FRENTES = [
    ('CAERN SEDE', 'ESC RMG'), ('ESC LAGOA DE VELHOS', 'ESC RMG'), ('ESC PEDRA GRANDE', 'ESC RMG'), ('ESC RIACHUELO', 'ESC RMG'), ('ESC SÃO BENTO DO NORTE', 'ESC RMG'),
    ('RAG CANDELARIA', 'RAG ÁGUA'), ('RAG CANGUARETAMA', 'RAG ÁGUA'), ('RAG NISIA FLORESTA', 'RAG ÁGUA'),
    ('RMG MACAIBA', 'RMG ÁGUA'), ('RMG PEDRA GRANDE', 'RMG ÁGUA'), ('RMG PUREZA', 'RMG ÁGUA'), ('RMG SÃO PEDRO DO POTENGI', 'RMG ÁGUA'),
    ('CAERN PARNAMIRIM', 'PARNAMIRIM'), ('SMS', 'SMS'), ('CBTU', 'CBTU'), ('USF ROCAS', 'USF ROCAS'), ('FUNPEC', 'FUNPEC'),
    ('CODERN 2026', 'CODERN'), ('ECOVILLE', 'ECOVILLE'), ('GRANJA', 'GRANJA'), ('ADM', 'Administração'),
]
fr = aba('Frentes de serviço', [('Frente de serviço', 30), ('Centro de custo', 26)], FRENTES)
lista(fr, 'B', "='Centros de custo'!$A$2:$A$200")

fo = aba('Fornecedores', [('Nome', 30), ('CPF ou CNPJ', 20), ('Chave Pix', 30), ('Forma de pagamento', 18), ('Dia de fechamento', 16), ('Outros nomes', 26), ('Observação', 30)], [
    ('Aço Potiguar', '05948553000275', '05948553000275', 'Pix', None, None, 'Exemplo do pedido pelo WhatsApp'),
], texto_cols='BC')
lista(fo, 'D', '"Pix,Boleto,Fatura semanal"')
lista(fo, 'E', '"Segunda,Terça,Quarta,Quinta,Sexta,Sábado,Domingo"')

TIPOS = [
    ('Material', ''), ('Material estoque', ''), ('Serviço', ''), ('Terceirizado', ''), ('Salário', 'Folha'), ('Encargos', 'Encargos da folha'),
    ('Administrativo', 'ADM'), ('Combustível', ''), ('Alimentação', ''), ('Vale alimentação', ''), ('Vale transporte', ''), ('Alojamento', ''),
    ('Locação de equipamento', ''), ('Manutenção de veículo', 'Manutenção veículo'), ('Manutenção de equipamento', 'Manutenção equipamento'),
    ('Ferramenta', ''), ('Transporte', ''), ('Imposto', ''), ('Despesa geral', ''), ('Outros', ''),
]
aba('Tipos de despesa', [('Tipo de despesa', 28), ('Outros nomes', 40)], [(n, a or None) for n, a in TIPOS])

fx = aba('Custos fixos', [('Centro de custo', 22), ('Descrição', 24), ('Tipo de despesa', 20), ('Valor mensal (R$)', 16), ('Desde (mm/aaaa)', 15), ('Até (mm/aaaa)', 14)], [
    ('RMG ÁGUA', 'Despesa geral', 'Despesa geral', 20000, '08/2026', None),
    ('PARNAMIRIM', 'Despesa geral', 'Despesa geral', 10000, '08/2026', None),
], texto_cols='EF')
fx['E3'].fill = AZUL
for r in range(2, 501):
    fx[f'D{r}'].number_format = '#,##0.00'
lista(fx, 'A', "='Centros de custo'!$A$2:$A$200")
lista(fx, 'C', "='Tipos de despesa'!$A$2:$A$200")

ec = aba('Encargos', [('Nome', 24), ('Percentual (%)', 15), ('A partir de (mm/aaaa)', 20), ('A quem se aplica', 70)], [
    ('Encargos da folha', 37.77, None, 'Percentual geral da planilha de presença (serventes, profissionais, produção e salários fixos)'),
    ('Encargos especiais', 67.05, None, 'Percentual maior usado em caso individual na planilha de presença'),
], texto_cols='C')

wb.save(f'{RAIZ}/modelos/Cadastros_Financeiro.xlsx')
print(f'{len(CENTROS)} centros, {len(FRENTES)} frentes, {len(TIPOS)} tipos')

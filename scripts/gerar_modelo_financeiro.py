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
    ('3. Centros de custo — cada contrato pertence a UMA empresa. Tipo: Obra, Administração (rateado entre as obras) ou Estoque/Galpão.', ''),
    ('   Outros nomes: grafias usadas nos caixas e planilhas, separadas por ponto e vírgula (ex.: CAIXA RMG; RMG AGUA 2). Acentos e maiúsculas já são ignorados.', ''),
    ('4. Frentes de serviço — cada frente e o centro de custo a que pertence. Frente com o mesmo nome que já existe no estoque é só ligada ao centro.', ''),
    ('5. Fornecedores — CPF ou CNPJ, chave Pix e forma de pagamento (Pix, Boleto ou Fatura semanal). Dia de fechamento só para fatura semanal.', ''),
    ('6. Tipos de despesa — a lista já vem pronta; acrescente ou complete os outros nomes.', ''),
    ('', ''),
    ('CONFIRA ANTES DE IMPORTAR', 'secao'),
    ('• A coluna Empresa dos centros de obra está em branco: escolha ALN ou Passos em cada um (obrigatório).', ''),
    ('• Centros e frentes vieram da lista de presença de outubro (agrupamento da tabela de contratos) e do caixa FUNPEC. Corrija o que estiver diferente.', ''),
    ('• CAERN SEDE está em ESC RMG porque é assim que a planilha de presença soma. CODERN 2026, ECOVILLE e GRANJA não entram em nenhum contrato lá e ficaram de fora.', ''),
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
    ('ESC RMG', None, 'Obra', None), ('RAG ÁGUA', None, 'Obra', None), ('RMG ÁGUA', None, 'Obra', 'CAIXA RMG'),
    ('PARNAMIRIM', None, 'Obra', None), ('SMS', None, 'Obra', None), ('CBTU', None, 'Obra', None),
    ('USF ROCAS', None, 'Obra', None), ('FUNPEC', None, 'Obra', 'CAIXA FUNPEC'),
    ('Administração ALN', 'ALN', 'Administração', 'ADM'), ('Administração Passos', 'Passos', 'Administração', None),
    ('Estoque/Galpão ALN', 'ALN', 'Estoque/Galpão', None), ('Estoque/Galpão Passos', 'Passos', 'Estoque/Galpão', None),
]
cc = aba('Centros de custo', [('Centro de custo', 26), ('Empresa', 12), ('Tipo', 16), ('Outros nomes', 40)], CENTROS)
for r in range(2, 2 + 8):
    cc[f'B{r}'].fill = AZUL
lista(cc, 'B', "='Empresas'!$A$2:$A$50")
lista(cc, 'C', '"Obra,Administração,Estoque/Galpão"')

FRENTES = [
    ('CAERN SEDE', 'ESC RMG'), ('ESC LAGOA DE VELHOS', 'ESC RMG'), ('ESC PEDRA GRANDE', 'ESC RMG'), ('ESC RIACHUELO', 'ESC RMG'), ('ESC SÃO BENTO DO NORTE', 'ESC RMG'),
    ('RAG CANDELARIA', 'RAG ÁGUA'), ('RAG CANGUARETAMA', 'RAG ÁGUA'), ('RAG NISIA FLORESTA', 'RAG ÁGUA'),
    ('RMG MACAIBA', 'RMG ÁGUA'), ('RMG PEDRA GRANDE', 'RMG ÁGUA'), ('RMG PUREZA', 'RMG ÁGUA'), ('RMG SÃO PEDRO DO POTENGI', 'RMG ÁGUA'),
    ('CAERN PARNAMIRIM', 'PARNAMIRIM'), ('SMS', 'SMS'), ('CBTU', 'CBTU'), ('USF ROCAS', 'USF ROCAS'), ('FUNPEC', 'FUNPEC'),
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
    ('Ferramenta', ''), ('Transporte', ''), ('Imposto', ''), ('Outros', ''),
]
aba('Tipos de despesa', [('Tipo de despesa', 28), ('Outros nomes', 40)], [(n, a or None) for n, a in TIPOS])

wb.save(f'{RAIZ}/modelos/Cadastros_Financeiro.xlsx')
print(f'{len(CENTROS)} centros, {len(FRENTES)} frentes, {len(TIPOS)} tipos')

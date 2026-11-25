"""Gera modelos/Funcionarios_EPI.xlsx e modelos/Itens_EPI.xlsx (planilhas que o app importa em Mais → Importar EPI).
Os cabeçalhos devem ser iguais aos de src/importacao/epi.ts (há teste conferindo)."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = sys.argv[1] if len(sys.argv) > 1 else '.'
GRAFITE = PatternFill('solid', fgColor='333333')
CAB = Font(bold=True, color='FFFFFF')


def instrucoes(wb, linhas):
    ws = wb.active
    ws.title = 'Instruções'
    for i, (t, estilo) in enumerate(linhas, start=1):
        c = ws.cell(row=i, column=1, value=t)
        c.alignment = Alignment(wrap_text=True, vertical='top')
        if estilo == 'titulo':
            c.font = Font(bold=True, size=14)
        elif estilo == 'secao':
            c.font = Font(bold=True, color='1F5F8B')
    ws.column_dimensions['A'].width = 130


def aba(wb, nome, colunas, linhas=(), texto_cols=()):
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
        for r in range(2, 1001):
            ws[f'{col}{r}'].number_format = '@'
    return ws


def lista(ws, col, formula):
    dv = DataValidation(type='list', formula1=formula, allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f'{col}2:{col}1000')


# ---------- Funcionários de EPI ----------
wb = Workbook()
instrucoes(wb, [
    ('FUNCIONÁRIOS QUE RECEBEM EPI', 'titulo'),
    ('Preencha a aba "Funcionários EPI" e importe no app: Mais → Importar EPI. O app confere tudo antes de gravar e mostra os erros com aba e linha.', ''),
    ('Quem recebe EPI é um grupo separado de quem retira material do galpão: estes funcionários só aparecem na aba EPI.', ''),
    ('', ''),
    ('COLUNAS', 'secao'),
    ('• Nome (obrigatório).', ''),
    ('• CPF — opcional, com ou sem pontuação. Evita duplicar homônimos; se informado, é conferido.', ''),
    ('• Função — ex.: servente, pedreiro, eletricista.', ''),
    ('• Calçado, Camisa e Luva — tamanhos usuais. O app só SUGERE ao entregar o EPI: na entrega pode ir outro tamanho, e o cadastro pode ser mudado a qualquer momento.', ''),
    ('• Situação — Ativo (padrão) ou Inativo.', ''),
    ('', ''),
    ('QUEM JÁ ESTÁ NO APP', 'secao'),
    ('Quem já está cadastrado como funcionário de EPI (mesmo CPF ou mesmo nome) não é duplicado: só são completados CPF, função e tamanhos que estiverem preenchidos aqui.', ''),
    ('Não mude o nome da aba nem os cabeçalhos (linha 1). Exemplo de linha: Nome = José Almeida · CPF = 123.456.789-09 · Função = Servente · Calçado = 41 · Camisa = G · Luva = G · Situação = Ativo.', ''),
])
ws = aba(wb, 'Funcionários EPI', [('Nome', 32), ('CPF', 18), ('Função', 22), ('Calçado', 11), ('Camisa', 11), ('Luva', 11), ('Situação', 12)], [], texto_cols='BDEF')
lista(ws, 'G', '"Ativo,Inativo"')
wb.save(f'{RAIZ}/modelos/Funcionarios_EPI.xlsx')

# ---------- Itens de EPI ----------
wb = Workbook()
instrucoes(wb, [
    ('ITENS DE EPI', 'titulo'),
    ('Preencha a aba "Itens EPI" e importe no app: Mais → Importar EPI. O app confere tudo antes de gravar e mostra os erros com aba e linha.', ''),
    ('Os itens de EPI são separados dos materiais do galpão: aparecem só na aba EPI (entrega, compra, estoque e inventário).', ''),
    ('', ''),
    ('COLUNAS', 'secao'),
    ('• Item (obrigatório) e Unidade (obrigatória para item novo: par, un, pç…).', ''),
    ('• Nº do CA — Certificado de Aprovação padrão do item; vem preenchido na entrega e pode ser trocado.', ''),
    ('• Vida útil (dias) — dias até a troca. Na entrega o app sugere a data de troca (data da entrega + vida útil). Ex.: bota 180.', ''),
    ('• Tamanhos disponíveis — separe com ponto e vírgula. Ex.: 38; 39; 40; 41  ou  P; M; G; GG. Viram botões na hora da entrega.', ''),
    ('• Tamanho do funcionário — Calçado, Camisa ou Luva: qual tamanho do cadastro do funcionário serve para este item (o app sugere esse tamanho). Deixe em branco para capacete, óculos etc.', ''),
    ('• Estoque mínimo — o app avisa quando o saldo chega nele.', ''),
    ('• Saldo inicial e Custo unitário (R$) — quantidade que já está no estoque de EPI hoje. O custo é opcional (item sem valor fica só catalogado).', ''),
    ('', ''),
    ('QUEM JÁ ESTÁ NO APP', 'secao'),
    ('Item com o mesmo nome não é duplicado: só são completados os campos preenchidos aqui. Saldo inicial só vale para item sem saldo no app; para corrigir depois use o Inventário da aba EPI.', ''),
    ('Os itens vêm só com nome, unidade e tipo de tamanho: CA, vida útil e quantidades dependem de cada compra e ficam em branco para você preencher.', ''),
    ('Não mude o nome da aba nem os cabeçalhos (linha 1).', ''),
])
ITENS = [
    ('Bota de segurança', 'par', None, None, None, 'Calçado'),
    ('Botina de couro', 'par', None, None, None, 'Calçado'),
    ('Capacete', 'un', None, None, None, None),
    ('Luva de vaqueta', 'par', None, None, None, 'Luva'),
    ('Luva de látex', 'par', None, None, None, 'Luva'),
    ('Óculos de proteção', 'un', None, None, None, None),
    ('Protetor auricular', 'un', None, None, None, None),
    ('Máscara respiratória', 'un', None, None, None, None),
    ('Camisa de uniforme', 'un', None, None, None, 'Camisa'),
    ('Cinto de segurança', 'un', None, None, None, None),
]
ws = aba(wb, 'Itens EPI', [('Item', 30), ('Unidade', 10), ('Nº do CA', 12), ('Vida útil (dias)', 16), ('Tamanhos disponíveis', 28),
                          ('Tamanho do funcionário', 22), ('Estoque mínimo', 15), ('Saldo inicial', 13), ('Custo unitário (R$)', 18)],
         [(n, u, ca, v, t, tt) for n, u, ca, v, t, tt in ITENS], texto_cols='CE')
lista(ws, 'F', '"Calçado,Camisa,Luva"')
for r in range(2, 1001):
    ws[f'I{r}'].number_format = '#,##0.00'
wb.save(f'{RAIZ}/modelos/Itens_EPI.xlsx')
print('ok')

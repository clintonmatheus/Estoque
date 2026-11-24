"""Gera modelos/Levantamento_Estoque.xlsx (planilha que a equipe preenche e o app importa).
Os cabeçalhos devem ser iguais aos de src/importacao/levantamento.ts (há teste conferindo)."""
import re
import sys
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

RAIZ = sys.argv[1] if len(sys.argv) > 1 else '.'
GRAFITE = PatternFill('solid', fgColor='333333')
AZUL = PatternFill('solid', fgColor='E3EEF6')
CAB = Font(bold=True, color='FFFFFF')

itens = []
for linha in open(f'{RAIZ}/src/domain/itensIniciais.ts', encoding='utf-8'):
    m = re.search(r'nome: "([^"]+)", unidade: "([^"]+)"(?:.*?custoReferencia: ([\d.]+))?', linha)
    if m:
        itens.append((m.group(1), m.group(2), float(m.group(3)) if m.group(3) else None))

wb = Workbook()
ins = wb.active
ins.title = 'Instruções'
texto = [
    ('LEVANTAMENTO GERAL — ESTOQUE DO GALPÃO', 'titulo'),
    ('Preencha as abas e depois importe no app: Mais → Importar planilha. O app confere tudo antes de gravar e mostra os erros com o número da linha.', ''),
    ('Não mude o nome das abas nem dos cabeçalhos (linha 1). Pode deixar abas vazias. Não apague esta aba.', ''),
    ('', ''),
    ('ORDEM SUGERIDA', 'secao'),
    ('1. Frentes de serviço — cada obra/frente e o contrato (centro de custo) a que pertence. Frentes já cadastradas no app podem ficar de fora.', ''),
    ('2. Funcionários — mestres, encarregados e quem retira material. Só o nome. Quem já está no app pode ficar de fora.', ''),
    ('3. Materiais — a lista já vem com os itens do galpão. Preencha a quantidade contada e confira o custo. Itens novos: escreva no fim da lista com a unidade.', ''),
    ('4. Equipamentos — ferramentas e equipamentos locados, com quem está cada um e em qual obra.', ''),
    ('', ''),
    ('MATERIAIS', 'secao'),
    ('• Quantidade no galpão: o que foi contado, na unidade do item (revestimento em PEÇAS, não caixas).', ''),
    ('• Custo unitário: valor de uma unidade, usado no custo PEPS. Obrigatório quando há quantidade.', ''),
    ('• Item que já tem saldo no app não é importado (use o Inventário do app para corrigir).', ''),
    ('• Linhas com quantidade vazia ou zero só cadastram o item (ou atualizam o estoque mínimo/categoria).', ''),
    ('', ''),
    ('EQUIPAMENTOS', 'secao'),
    ('• Tipo: Ferramenta (própria) ou Locado. Controle: Individual (cada peça tem cadastro, ex.: Furadeira 03) ou Quantidade (ex.: 120 escoras).', ''),
    ('• Individual: uma linha por unidade, cada uma com um Código diferente (01, 02...). Quantidade fica vazia ou 1.', ''),
    ('• Quantidade: se as peças estão espalhadas, repita o Nome em várias linhas, uma para cada lugar (ex.: 40 no galpão, 60 com João na obra Riachuelo). Os dados da locação ficam na primeira linha.', ''),
    ('• Onde está: Galpão ou Obra. Se for Obra, preencha Com quem (funcionário) e Frente de serviço, escritos igual às outras abas ou ao app.', ''),
    ('• Devolver até: só para ferramenta individual que está em obra (opcional).', ''),
    ('• Locados: Locadora é obrigatória. Valor por peça e Período (Dia ou Mês), início, fim previsto e a obra em que a locadora cobra são opcionais, mas ajudam nos alertas.', ''),
    ('• Datas no formato dd/mm/aaaa.', ''),
    ('', ''),
    ('EXEMPLOS (aba Equipamentos)', 'secao'),
    ('FURADEIRA DE IMPACTO | 03 | Ferramenta | Individual | | Obra | João | Riachuelo | 30/11/2026', ''),
    ('ESCORA METÁLICA | | Locado | Quantidade | 40 | Galpão | | | | Agaé Locação | 1234 | 2,50 | Mês | 01/10/2026 | 31/12/2026 | Riachuelo', ''),
    ('ESCORA METÁLICA | | Locado | Quantidade | 60 | Obra | João | Riachuelo', ''),
]
for i, (t, estilo) in enumerate(texto, start=1):
    c = ins.cell(row=i, column=1, value=t)
    c.alignment = Alignment(wrap_text=True, vertical='top')
    if estilo == 'titulo': c.font = Font(bold=True, size=14)
    if estilo == 'secao': c.font = Font(bold=True, color='1F5F8B')
ins.column_dimensions['A'].width = 120

def aba(nome, colunas):
    ws = wb.create_sheet(nome)
    for j, (titulo, largura, dica) in enumerate(colunas, start=1):
        c = ws.cell(row=1, column=j, value=titulo)
        c.font, c.fill = CAB, GRAFITE
        c.alignment = Alignment(wrap_text=True, vertical='center')
        if dica: c.comment = Comment(dica, 'Estoque')
        ws.column_dimensions[c.column_letter].width = largura
    ws.freeze_panes = 'A2'
    ws.row_dimensions[1].height = 32
    return ws

def lista(ws, coluna, valores, linhas=1000):
    dv = DataValidation(type='list', formula1=valores, allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    dv.add(f'{coluna}2:{coluna}{linhas}')

def datas(ws, coluna, linhas=1000):
    for r in range(2, linhas + 1): ws[f'{coluna}{r}'].number_format = 'dd/mm/yyyy'

fr = aba('Frentes de serviço', [('Frente de serviço', 34, 'Ex.: Riachuelo'), ('Centro de custo (contrato)', 40, 'Contrato ao qual a frente pertence. Ex.: Escritórios da RMG')])
fu = aba('Funcionários', [('Nome', 40, 'Como aparece no app (ex.: João Silva)')])
ma = aba('Materiais', [
    ('Item', 52, 'Nome do item. Itens novos: escreva no fim da lista.'), ('Unidade', 10, 'Ex.: un, lata, pç, kg, m'),
    ('Categoria', 24, 'Opcional. Vazio: o app sugere pelo nome.'), ('Estoque mínimo', 14, 'Opcional. Abaixo disso o app avisa.'),
    ('Quantidade no galpão', 14, 'Quantidade contada, na unidade do item.'), ('Custo unitário (R$)', 16, 'Valor de uma unidade. Obrigatório se houver quantidade.'),
])
for i, (nome, unidade, custo) in enumerate(itens, start=2):
    ma.cell(row=i, column=1, value=nome)
    ma.cell(row=i, column=2, value=unidade)
    if custo is not None: ma.cell(row=i, column=6, value=custo)
for r in range(2, 1001):
    ma[f'F{r}'].number_format = '"R$" #,##0.00'
    ma[f'E{r}'].fill = AZUL
lista(ma, 'C', '"Pintura,Elétrica,Hidráulica e louças,Ferragens,Revestimentos e acabamento,Outros"')

eq = aba('Equipamentos', [
    ('Nome', 34, 'Ex.: Furadeira de impacto, Escora metálica'), ('Código', 9, 'Número da unidade (individuais). Ex.: 03'),
    ('Tipo', 12, 'Ferramenta ou Locado'), ('Controle', 12, 'Individual ou Quantidade'), ('Quantidade', 11, 'Peças neste lugar (controle por quantidade)'),
    ('Onde está', 11, 'Galpão ou Obra'), ('Com quem', 24, 'Funcionário (se estiver em obra)'), ('Frente de serviço', 22, 'Obra/frente (se estiver em obra)'),
    ('Devolver até', 13, 'Opcional: ferramenta individual em obra'), ('Locadora', 22, 'Obrigatória para Locado'), ('Nº do contrato', 13, ''),
    ('Valor por peça (R$)', 13, 'Opcional'), ('Período', 9, 'Dia ou Mês'), ('Início da locação', 13, ''), ('Fim previsto', 13, ''),
    ('Obra cobrada', 22, 'Frente em que a locadora cobra este equipamento'), ('Observação', 30, ''),
])
lista(eq, 'C', '"Ferramenta,Locado"')
lista(eq, 'D', '"Individual,Quantidade"')
lista(eq, 'F', '"Galpão,Obra"')
lista(eq, 'M', '"Dia,Mês"')
lista(eq, 'G', "='Funcionários'!$A$2:$A$500")
lista(eq, 'H', "='Frentes de serviço'!$A$2:$A$500")
lista(eq, 'P', "='Frentes de serviço'!$A$2:$A$500")
for col in 'INO': datas(eq, col)
for r in range(2, 1001): eq[f'L{r}'].number_format = '"R$" #,##0.00'

wb.save(f'{RAIZ}/modelos/Levantamento_Estoque.xlsx')
print(f'{len(itens)} itens na aba Materiais')

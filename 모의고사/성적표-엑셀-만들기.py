# 모의고사 성적표 엑셀을 만드는 스크립트입니다.
# (선생님은 이 파일을 쓰지 않습니다. 엑셀의 회차설정 시트만 고치면 됩니다)
# -*- coding: utf-8 -*-
"""모의고사 성적표 엑셀 만들기 (A안)"""
import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter as CL
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule
from openpyxl.worksheet.pagebreak import Break

exec(open('30차-정답.py', encoding='utf-8').read())

MAXS = 60                 # 학생 수 상한 (답안입력 3행 ~ 62행)
R1, R2 = 3, 2 + MAXS      # 학생 데이터 시작/끝 행

# ---------- 색·글꼴 ----------
DEEP   = "5B21B6"   # 진보라
PRI    = "7C3AED"   # 연보라(강조)
LIGHT  = "EDE9FE"   # 아주 옅은 보라
CARD   = "F5F3FF"
LINE   = "C4B5FD"
GRAY   = "6B7280"
WARN   = "FEF3C7"

def F(sz=11, b=False, c="1F2937"): return Font(name="맑은 고딕", size=sz, bold=b, color=c)
def FILL(c): return PatternFill("solid", fgColor=c)
thin = Side(style="thin", color=LINE)
BOX  = Border(left=thin, right=thin, top=thin, bottom=thin)
C  = Alignment(horizontal="center", vertical="center")
CW = Alignment(horizontal="center", vertical="center", wrap_text=True)
L  = Alignment(horizontal="left",   vertical="center")
LW = Alignment(horizontal="left",   vertical="center", wrap_text=True)

def put(ws, r, c, v, font=None, fill=None, align=None, border=None, fmt=None):
    cell = ws.cell(r, c, v)
    if font:  cell.font = font
    if fill:  cell.fill = FILL(fill)
    if align: cell.alignment = align
    if border:cell.border = border
    if fmt:   cell.number_format = fmt
    return cell

def merge(ws, r1, c1, r2, c2):
    ws.merge_cells(start_row=r1, start_column=c1, end_row=r2, end_column=c2)

def boxrange(ws, r1, c1, r2, c2):
    for r in range(r1, r2 + 1):
        for c in range(c1, c2 + 1):
            ws.cell(r, c).border = BOX

wb = Workbook()

# ============================================================ 사용법
ws = wb.active; ws.title = "사용법"
ws.sheet_view.showGridLines = False
ws.column_dimensions["A"].width = 3
ws.column_dimensions["B"].width = 104
put(ws, 2, 2, "모의고사 성적표 (30차 심화모의고사)", F(20, True, DEEP), align=L)
guide = [
 ("", ""),
 ("h", "이 파일 하나로 한 회차가 끝납니다"),
 ("p", "회차마다 새 파일을 만들지 마시고, 이 파일을 복사해서 이름만 바꿔 쓰십시오.\n"
       "(예: 모의고사-성적표-31차.xlsx)"),
 ("", ""),
 ("h", "1단계 · 회차설정 시트  — 회차마다 여기만 고칩니다"),
 ("p", "· 시험 이름, 시행일, 등급컷을 적습니다.\n"
       "· 영역 표: 어느 문항이 어느 영역인지 적습니다. (예: 독서론 1~3)\n"
       "· 문항별 정답·배점: 답지를 보고 그대로 옮겨 적습니다.\n"
       "· 다 적으면 맨 위 '확인' 칸에 '정상입니다'가 뜹니다. 빨간 글씨가 뜨면 배점 합계나\n"
       "  영역 표의 시작·끝 번호를 다시 보십시오. (이 확인이 지난 시트의 118% 오류를 막아 줍니다)\n"
       "· 30차 정답·배점·영역·등급컷·시행일은 이미 채워 넣었습니다."),
 ("", ""),
 ("h", "2단계 · 답안입력 시트  — 학생 OMR을 옮겨 적습니다"),
 ("p", "· 한 줄에 학생 한 명입니다. 이름 / 학년 / 선택과목을 적고 1~45번 답을 적습니다.\n"
       "· 빠른 방법: '한 번에 입력' 칸에 45자리를 이어서 붙여 넣으면 됩니다.\n"
       "  (예: 434255332…  45글자) 이 칸이 채워져 있으면 옆의 낱칸은 비워 두어도 됩니다.\n"
       "· 선택과목에 따라 35~45번은 알아서 다른 정답표로 채점됩니다.\n"
       "· 맨 오른쪽에 점수와 등급이 바로 나옵니다."),
 ("", ""),
 ("h", "3단계 · 성적표 시트  — 한 명씩 보고 인쇄합니다"),
 ("p", "· 맨 위 이름 칸을 누르면 학생 목록이 펼쳐집니다. 고르면 성적표가 그 학생 것으로 바뀝니다.\n"
       "· 그대로 인쇄하면 A4 한 장입니다."),
 ("", ""),
 ("h", "4단계 · 성적표(전원) 시트  — 한 번에 모두 인쇄합니다"),
 ("p", "· 답안입력에 적은 학생들의 성적표가 위에서부터 차례로 들어 있습니다.\n"
       "· 학생마다 쪽이 나뉘어 있어서, 그냥 인쇄하면 전원 성적표가 한 번에 나옵니다.\n"
       "· 학생이 없는 자리는 빈 쪽이 되니, 인쇄할 쪽 범위만 정해 주시면 됩니다."),
 ("", ""),
 ("h", "5단계 · 분석 시트  — 반 전체를 봅니다"),
 ("p", "· 응시 인원, 평균, 등급 분포\n"
       "· 문항별 정답률 (어느 문항이 많이 틀렸는지)\n"
       "· 공통과목 영역별 반 평균 성취도"),
 ("", ""),
 ("h", "고치면 안 되는 것"),
 ("p", "· '자동계산'과 '전체채점' 시트는 계산용입니다. 열어 보셔도 되지만 고치지 마십시오.\n"
       "· 회차설정 시트에서 줄을 새로 끼워 넣거나 지우지 마십시오. 칸의 값만 고쳐 쓰십시오.\n"
       "  (자리가 밀리면 다른 시트가 엉뚱한 칸을 보게 됩니다)\n"
       "· 영역 표는 '공통'을 먼저, 그다음에 선택과목 영역을 적습니다."),
 ("", ""),
 ("h", "다음 단계"),
 ("p", "이 파일은 이번 주를 넘기기 위한 것입니다.\n"
       "학생이 휴대폰으로 답을 직접 넣고 성적표가 바로 나오는 앱(B안)을 이어서 만듭니다."),
]
r = 4
for kind, text in guide:
    if kind == "h":
        put(ws, r, 2, text, F(13, True, PRI), fill=LIGHT, align=L); ws.row_dimensions[r].height = 26
    elif kind == "p":
        put(ws, r, 2, text, F(11), align=LW)
        ws.row_dimensions[r].height = 15 * (text.count("\n") + 1) + 6
    else:
        ws.row_dimensions[r].height = 6
    r += 1

# ============================================================ 회차설정
cfg = wb.create_sheet("회차설정")
cfg.sheet_view.showGridLines = False
for col, w in zip("ABCDEFGHIJK", [16, 16, 12, 12, 16, 12, 12, 4, 12, 12, 12]):
    cfg.column_dimensions[col].width = w
put(cfg, 1, 1, "회차 설정 — 회차마다 이 시트만 고치면 됩니다", F(16, True, DEEP), align=L)
merge(cfg, 1, 1, 1, 6)

put(cfg, 2, 1, "시험 이름", F(11, True), fill=LIGHT, align=C, border=BOX)
put(cfg, 2, 2, "30차 심화모의고사", F(12), align=L, border=BOX); merge(cfg, 2, 2, 2, 5)
put(cfg, 3, 1, "시행일", F(11, True), fill=LIGHT, align=C, border=BOX)
put(cfg, 3, 2, datetime.date(2026, 9, 12), F(12), align=L, border=BOX, fmt="yyyy-mm-dd")
merge(cfg, 3, 2, 3, 5)
cfg["B3"].fill = FILL(WARN)
put(cfg, 3, 6, "← 회차가 바뀌면 시험 본 날짜를 고쳐 주세요", F(10, False, GRAY), align=L)

put(cfg, 4, 1, "확인", F(11, True), fill=LIGHT, align=C, border=BOX)
put(cfg, 4, 2,
    '=IF(AND(SUM($C$32:$C$65)+SUM($G$32:$G$42)=100,SUM($C$32:$C$65)+SUM($K$32:$K$42)=100,'
    'MIN(자동계산!$F$4:$F$48)=1,MAX(자동계산!$F$4:$F$48)=1,'
    'MIN(자동계산!$G$4:$G$48)=1,MAX(자동계산!$G$4:$G$48)=1),'
    '"정상입니다 — 배점 합계 100점, 영역 표가 45문항을 빠짐없이 덮습니다",'
    '"확인이 필요합니다 — 배점 합계가 100점인지, 영역 표의 시작·끝 번호가 겹치거나 빠지지 않았는지 보세요")',
    F(11, True), align=L, border=BOX)
merge(cfg, 4, 2, 4, 8)
cfg.conditional_formatting.add("B4", CellIsRule(
    operator="beginsWith", formula=['"확인"'], font=Font(name="맑은 고딕", bold=True, color="B91C1C"),
    fill=FILL("FEE2E2")))
cfg.conditional_formatting.add("B4", CellIsRule(
    operator="beginsWith", formula=['"정상"'], font=Font(name="맑은 고딕", bold=True, color="166534"),
    fill=FILL("DCFCE7")))

# 등급컷
put(cfg, 6, 1, "■ 등급컷  (이 점수 이상이면 그 등급입니다)", F(12, True, PRI), align=L); merge(cfg, 6, 1, 6, 5)
for c, t in enumerate(["선택과목", "1등급", "2등급", "3등급", "4등급"], start=1):
    put(cfg, 7, c, t, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
for i, (name, cuts) in enumerate([("화법과 작문", [95, 88, 77, 64]), ("언어와 매체", [92, 85, 74, 62])]):
    put(cfg, 8 + i, 1, name, F(11), align=C, border=BOX)
    for j, v in enumerate(cuts):
        put(cfg, 8 + i, 2 + j, v, F(11), fill=WARN, align=C, border=BOX)
put(cfg, 8, 6, "← 30차 등급컷입니다. 회차가 바뀌면 이 네 칸을 고쳐 주세요", F(10, False, "B45309"), align=L)
merge(cfg, 8, 6, 9, 9)

# 영역 표
put(cfg, 11, 1, "■ 영역 표  — 어느 문항이 어느 영역인지 (공통을 먼저, 그다음 선택과목)",
    F(12, True, PRI), align=L); merge(cfg, 11, 1, 11, 7)
for c, t in enumerate(["분류", "영역", "시작번호", "끝번호", "대상", "화작순번", "언매순번"], start=1):
    put(cfg, 12, c, t, F(11, True, "FFFFFF"), fill=PRI if c <= 5 else GRAY, align=C, border=BOX)
for i in range(15):
    r = 13 + i
    vals = SETS[i] if i < len(SETS) else (None, None, None, None, None)
    for c, v in enumerate(vals, start=1):
        put(cfg, r, c, v, F(11), align=C if c != 2 else C, border=BOX)
    put(cfg, r, 6, f'=IF(OR($E{r}="공통",$E{r}="화법과 작문"),'
                   f'COUNTIF($E$13:$E{r},"공통")+COUNTIF($E$13:$E{r},"화법과 작문"),"")',
        F(10, False, GRAY), fill=CARD, align=C, border=BOX)
    put(cfg, r, 7, f'=IF(OR($E{r}="공통",$E{r}="언어와 매체"),'
                   f'COUNTIF($E$13:$E{r},"공통")+COUNTIF($E$13:$E{r},"언어와 매체"),"")',
        F(10, False, GRAY), fill=CARD, align=C, border=BOX)
put(cfg, 12, 9, "대상 칸에는 셋 중 하나를 적습니다:\n공통 / 화법과 작문 / 언어와 매체\n\n"
                "회색 두 칸은 자동입니다.\n고치지 마세요.", F(10, False, GRAY), fill=CARD, align=LW, border=BOX)
merge(cfg, 12, 9, 17, 11)
dv_dae = DataValidation(type="list", formula1='"공통,화법과 작문,언어와 매체"', allow_blank=True)
cfg.add_data_validation(dv_dae); dv_dae.add(f"E13:E27")

# 문항별 정답·배점
put(cfg, 29, 1, "■ 문항별 정답·배점  — 답지를 보고 그대로 옮겨 적습니다", F(12, True, PRI), align=L)
merge(cfg, 29, 1, 29, 11)
put(cfg, 30, 1, "공통과목 (1~34번)", F(11, True, "FFFFFF"), fill=DEEP, align=C, border=BOX); merge(cfg, 30, 1, 30, 3)
put(cfg, 30, 5, "선택과목 · 화법과 작문 (35~45번)", F(11, True, "FFFFFF"), fill=DEEP, align=C, border=BOX); merge(cfg, 30, 5, 30, 7)
put(cfg, 30, 9, "선택과목 · 언어와 매체 (35~45번)", F(11, True, "FFFFFF"), fill=DEEP, align=C, border=BOX); merge(cfg, 30, 9, 30, 11)
# 헤더는 31행, 데이터는 32행부터가 되지 않도록: 헤더를 30행 그룹 아래 31행에 두고 데이터 32~
# → 참조식과 맞추기 위해 헤더 없이 데이터 31행부터 시작하고, 머리글은 30행 그룹명 아래 칸에 표기
for base, cols in ((1, "ABC"), (5, "EFG"), (9, "IJK")):
    pass
HEADROW = 31
for c0, label in ((1, "공통"), (5, "화작"), (9, "언매")):
    for j, t in enumerate(["번호", "정답", "배점"]):
        put(cfg, HEADROW, c0 + j, t, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
# 데이터: 공통 32~65, 선택 32~42  → 참조식도 이에 맞춤
DATA0 = HEADROW + 1                      # 32
for q, (a, p) in enumerate(COMMON, start=1):
    r = DATA0 + q - 1
    put(cfg, r, 1, q, F(11), fill=CARD, align=C, border=BOX)
    put(cfg, r, 2, a, F(11, True), align=C, border=BOX)
    put(cfg, r, 3, p, F(11), align=C, border=BOX)
for q, ((a1, p1), (a2, p2)) in enumerate(zip(HWAJAK, EONMAE), start=35):
    r = DATA0 + q - 35
    put(cfg, r, 5, q, F(11), fill=CARD, align=C, border=BOX)
    put(cfg, r, 6, a1, F(11, True), align=C, border=BOX)
    put(cfg, r, 7, p1, F(11), align=C, border=BOX)
    put(cfg, r, 9, q, F(11), fill=CARD, align=C, border=BOX)
    put(cfg, r, 10, a2, F(11, True), align=C, border=BOX)
    put(cfg, r, 11, p2, F(11), align=C, border=BOX)
COMMON_LAST = DATA0 + 33          # 65
SEL_LAST    = DATA0 + 10          # 42
put(cfg, COMMON_LAST + 1, 1, "배점 합계", F(11, True), fill=LIGHT, align=C, border=BOX); merge(cfg, COMMON_LAST+1, 1, COMMON_LAST+1, 2)
put(cfg, COMMON_LAST + 1, 3, f"=SUM(C{DATA0}:C{COMMON_LAST})", F(11, True), fill=LIGHT, align=C, border=BOX)
put(cfg, SEL_LAST + 1, 5, "배점 합계", F(11, True), fill=LIGHT, align=C, border=BOX); merge(cfg, SEL_LAST+1, 5, SEL_LAST+1, 6)
put(cfg, SEL_LAST + 1, 7, f"=SUM(G{DATA0}:G{SEL_LAST})", F(11, True), fill=LIGHT, align=C, border=BOX)
put(cfg, SEL_LAST + 1, 9, "배점 합계", F(11, True), fill=LIGHT, align=C, border=BOX); merge(cfg, SEL_LAST+1, 9, SEL_LAST+1, 10)
put(cfg, SEL_LAST + 1, 11, f"=SUM(K{DATA0}:K{SEL_LAST})", F(11, True), fill=LIGHT, align=C, border=BOX)
dv_ans = DataValidation(type="whole", operator="between", formula1=1, formula2=5, allow_blank=True)
cfg.add_data_validation(dv_ans)
dv_ans.add(f"B{DATA0}:B{COMMON_LAST}"); dv_ans.add(f"F{DATA0}:F{SEL_LAST}"); dv_ans.add(f"J{DATA0}:J{SEL_LAST}")
cfg.freeze_panes = "A31"

# ---------- 회차설정 참조 도우미 ----------
def ref_ans(q, sub):     # 정답 셀 (절대참조)
    if q <= 34: return f"회차설정!$B${31 + q}"
    col = "$F$" if sub == "화작" else "$J$"
    return f"회차설정!{col}{q - 3}"
def ref_pt(q, sub):      # 배점 셀
    if q <= 34: return f"회차설정!$C${31 + q}"
    col = "$G$" if sub == "화작" else "$K$"
    return f"회차설정!{col}{q - 3}"

# ============================================================ 자동계산
au = wb.create_sheet("자동계산")
au.sheet_view.showGridLines = False
for col, w in zip("ABCDEFG", [8, 12, 10, 12, 10, 12, 12]):
    au.column_dimensions[col].width = w
put(au, 1, 1, "자동 계산용 시트입니다. 고치지 마세요.", F(13, True, "B91C1C"), align=L); merge(au, 1, 1, 1, 7)
put(au, 2, 1, "회차설정 시트의 값을 문항 순서대로 모아 둔 표입니다.", F(10, False, GRAY), align=L); merge(au, 2, 1, 2, 7)
for c, t in enumerate(["번호", "정답(화작)", "배점(화작)", "정답(언매)", "배점(언매)",
                       "덮음(화작)", "덮음(언매)"], start=1):
    put(au, 3, c, t, F(10, True, "FFFFFF"), fill=GRAY, align=CW, border=BOX)
for q in range(1, 46):
    r = 3 + q
    put(au, r, 1, q, F(10), align=C, border=BOX)
    put(au, r, 2, f"={ref_ans(q,'화작')}", F(10), align=C, border=BOX)
    put(au, r, 3, f"={ref_pt(q,'화작')}",  F(10), align=C, border=BOX)
    put(au, r, 4, f"={ref_ans(q,'언매')}", F(10), align=C, border=BOX)
    put(au, r, 5, f"={ref_pt(q,'언매')}",  F(10), align=C, border=BOX)
    for c, dae in ((6, "화법과 작문"), (7, "언어와 매체")):
        put(au, r, c,
            f'=SUMPRODUCT(((회차설정!$E$13:$E$27="공통")+(회차설정!$E$13:$E$27="{dae}"))'
            f'*(회차설정!$C$13:$C$27<=$A{r})*(회차설정!$D$13:$D$27>=$A{r}))',
            F(10), align=C, border=BOX)
au.freeze_panes = "A4"

# ============================================================ 답안입력
AI_Q0 = 5                       # 1번 문항이 들어가는 열 (E)
inp = wb.create_sheet("답안입력")
inp.sheet_view.showGridLines = False
put(inp, 1, 1, "학생 답안 입력  —  한 줄에 학생 한 명", F(16, True, DEEP), align=L); merge(inp, 1, 1, 1, 4)
put(inp, 1, 6,
    "빠른 방법: '한 번에 입력' 칸에 45자리를 이어 붙여 넣으세요 (예 434255332…). "
    "그 칸이 채워져 있으면 옆의 낱칸은 비워 두어도 됩니다.",
    F(10, False, "B45309"), fill=WARN, align=L)
merge(inp, 1, 6, 1, 20)
heads = ["이름", "학년", "선택과목", "한 번에 입력 (45자리)"]
for c, t in enumerate(heads, start=1):
    put(inp, 2, c, t, F(11, True, "FFFFFF"), fill=PRI, align=CW, border=BOX)
for q in range(1, 46):
    put(inp, 2, AI_Q0 + q - 1, q, F(10, True, "FFFFFF"), fill=DEEP, align=C, border=BOX)
TOT_C, GRD_C = AI_Q0 + 45, AI_Q0 + 46          # AX, AY
put(inp, 2, TOT_C, "점수", F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
put(inp, 2, GRD_C, "등급", F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
for i in range(MAXS):
    r = R1 + i
    for c in range(1, GRD_C + 1):
        put(inp, r, c, None, F(10), align=C, border=BOX)
    inp.cell(r, 4).alignment = L
    put(inp, r, TOT_C, f'=IF($A{r}="","",전체채점!$C{r})', F(11, True), fill=CARD, align=C, border=BOX)
    put(inp, r, GRD_C, f'=IF($A{r}="","",전체채점!$D{r})', F(11, True), fill=CARD, align=C, border=BOX)
inp.column_dimensions["A"].width = 12
inp.column_dimensions["B"].width = 7
inp.column_dimensions["C"].width = 14
inp.column_dimensions["D"].width = 30
for q in range(45):
    inp.column_dimensions[CL(AI_Q0 + q)].width = 3.6
inp.column_dimensions[CL(TOT_C)].width = 7
inp.column_dimensions[CL(GRD_C)].width = 8
dv_sub = DataValidation(type="list", formula1='"화법과 작문,언어와 매체"', allow_blank=True)
inp.add_data_validation(dv_sub); dv_sub.add(f"C{R1}:C{R2}")
dv_15 = DataValidation(type="whole", operator="between", formula1=1, formula2=5, allow_blank=True,
                       errorTitle="답 확인", error="1에서 5 사이의 숫자만 넣을 수 있습니다.")
inp.add_data_validation(dv_15)
dv_15.add(f"{CL(AI_Q0)}{R1}:{CL(AI_Q0+44)}{R2}")
inp.freeze_panes = f"{CL(AI_Q0)}{R1}"

# ============================================================ 전체채점
GR_A0 = 5            # 답안 1번 열 (E)
GR_P0 = 50           # 득점 1번 열 (AX)
gr = wb.create_sheet("전체채점")
gr.sheet_view.showGridLines = False
put(gr, 1, 1, "자동 계산용 시트입니다. 고치지 마세요.", F(13, True, "B91C1C"), align=L); merge(gr, 1, 1, 1, 4)
for c, t in enumerate(["이름", "선택과목", "점수", "등급"], start=1):
    put(gr, 2, c, t, F(11, True, "FFFFFF"), fill=GRAY, align=C, border=BOX)
for q in range(1, 46):
    put(gr, 2, GR_A0 + q - 1, f"답{q}", F(9, True, "FFFFFF"), fill=GRAY, align=C)
    put(gr, 2, GR_P0 + q - 1, f"점{q}", F(9, True, "FFFFFF"), fill=DEEP, align=C)
def cut(sub_cell, col):    # 등급컷 셀 선택
    return f'IF({sub_cell}="언어와 매체",회차설정!${col}$9,회차설정!${col}$8)'
for i in range(MAXS):
    r = R1 + i
    put(gr, r, 1, f'=IF(답안입력!A{r}="","",답안입력!A{r})', F(10), align=C)
    put(gr, r, 2, f'=IF($A{r}="","",답안입력!C{r})', F(10), align=C)
    for q in range(1, 46):
        ac = CL(GR_A0 + q - 1); pc = CL(GR_P0 + q - 1)
        icol = CL(AI_Q0 + q - 1)
        put(gr, r, GR_A0 + q - 1,
            f'=IF($A{r}="","",IF(LEN(답안입력!$D{r})>={q},VALUE(MID(답안입력!$D{r},{q},1)),'
            f'IF(답안입력!{icol}{r}="","",답안입력!{icol}{r})))', F(9), align=C)
        au_r = 3 + q
        ans = f'IF($B{r}="언어와 매체",자동계산!$D${au_r},자동계산!$B${au_r})'
        pts = f'IF($B{r}="언어와 매체",자동계산!$E${au_r},자동계산!$C${au_r})'
        put(gr, r, GR_P0 + q - 1,
            f'=IF($A{r}="","",IF({ac}{r}="",0,IF({ac}{r}={ans},{pts},0)))', F(9), align=C)
    put(gr, r, 3, f'=IF($A{r}="","",SUM({CL(GR_P0)}{r}:{CL(GR_P0+44)}{r}))', F(10, True), align=C)
    sc = f"$B{r}"
    put(gr, r, 4,
        f'=IF($A{r}="","",IF($C{r}>={cut(sc,"B")},"1등급",IF($C{r}>={cut(sc,"C")},"2등급",'
        f'IF($C{r}>={cut(sc,"D")},"3등급",IF($C{r}>={cut(sc,"E")},"4등급","등급 외")))))', F(10), align=C)
gr.freeze_panes = "E3"

# ============================================================ 성적표 만들기
BLOCK_H = 41          # 학생 한 명이 차지하는 줄 수 (쪽 나눔 포함)
HC, SC_ = 18, 19      # 도우미 칸이 들어갈 열 (R, S) — 인쇄 범위 밖

def build_report(ws, top, srow_formula, name_dropdown=False):
    hr = top + 2
    RH   = f"$R${hr}"
    SUB  = f"$R${hr+1}"
    CUTS = [f"$R${hr+2+i}" for i in range(4)]
    SET_ = [f"$S${hr+i}" for i in range(12)]

    # --- 도우미 칸 (인쇄 범위 밖) ---
    put(ws, hr, HC, srow_formula, F(9, False, GRAY))
    put(ws, hr+1, HC, f'=IF({RH}="","",INDEX(전체채점!$B${R1}:$B${R2},{RH}))', F(9, False, GRAY))
    for i, col in enumerate("BCDE"):
        put(ws, hr+2+i, HC, f'=IF({SUB}="언어와 매체",회차설정!${col}$9,회차설정!${col}$8)', F(9, False, GRAY))
    for k in range(12):
        put(ws, hr+k, SC_,
            f'=IF({SUB}="","",IFERROR(IF({SUB}="언어와 매체",MATCH({k+1},회차설정!$G$13:$G$27,0),'
            f'MATCH({k+1},회차설정!$F$13:$F$27,0)),""))', F(9, False, GRAY))

    # --- 제목 ---
    put(ws, top, 1, f'=IF({RH}="","",회차설정!$B$2&" 성적표")', F(20, True, "FFFFFF"),
        fill=DEEP, align=C)
    merge(ws, top, 1, top, 16); ws.row_dimensions[top].height = 34

    # --- 1. 학생정보 ---
    put(ws, top+2, 1, "1. 학생정보", F(12, True, PRI), align=L)
    info = [("성명", 1, 3), ("선택과목", 4, 7), ("학년", 8, 11), ("시행일", 12, 16)]
    for t, c1, c2 in info:
        put(ws, top+3, c1, t, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
        merge(ws, top+3, c1, top+3, c2)
    vals = [f'=IF({RH}="","",INDEX(답안입력!$A${R1}:$A${R2},{RH}))',
            f'=IF({RH}="","",INDEX(답안입력!$C${R1}:$C${R2},{RH}))',
            f'=IF({RH}="","",INDEX(답안입력!$B${R1}:$B${R2},{RH}))',
            "=회차설정!$B$3"]
    for (t, c1, c2), v in zip(info, vals):
        cell = put(ws, top+4, c1, v, F(13, True), align=C, border=BOX)
        if t == "시행일": cell.number_format = "yyyy-mm-dd"
        merge(ws, top+4, c1, top+4, c2)
    ws.row_dimensions[top+4].height = 26
    if name_dropdown:
        ws.cell(top+4, 1).fill = FILL(WARN)

    # --- 2. 성적 ---
    put(ws, top+6, 1, "2. 성적", F(12, True, PRI), align=L)
    sc = [("점수 (100점 만점)", 1, 5), ("등급", 6, 8), ("등급컷", 9, 12), ("같은 선택과목 평균", 13, 16)]
    for t, c1, c2 in sc:
        put(ws, top+7, c1, t, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
        merge(ws, top+7, c1, top+7, c2)
    svals = [
        (f'=IF({RH}="","",INDEX(전체채점!$C${R1}:$C${R2},{RH}))', "0", F(24, True, DEEP)),
        (f'=IF({RH}="","",INDEX(전체채점!$D${R1}:$D${R2},{RH}))', "General", F(18, True, DEEP)),
        (f'=IF({RH}="","",{CUTS[0]}&"-"&{CUTS[1]}&"-"&{CUTS[2]}&"-"&{CUTS[3]})', "General", F(13)),
        (f'=IFERROR(AVERAGEIF(전체채점!$B${R1}:$B${R2},{SUB},전체채점!$C${R1}:$C${R2}),"")', "0.0", F(13)),
    ]
    for (t, c1, c2), (v, fmt, fnt) in zip(sc, svals):
        put(ws, top+8, c1, v, fnt, align=C, border=BOX, fmt=fmt)
        merge(ws, top+8, c1, top+8, c2)
    ws.row_dimensions[top+8].height = 34

    # --- 3. 영역분류별 성취도 ---
    put(ws, top+10, 1, "3. 영역분류별 성취도 분석", F(12, True, PRI), align=L)
    put(ws, top+10, 6,
        f'=IF(OR({RH}="",$E{top+24}=""),"",IF($E{top+24}=INDEX(전체채점!$C${R1}:$C${R2},{RH}),"",'
        f'"※ 회차설정의 영역 표를 확인하세요 — 영역 합계와 점수가 다릅니다"))',
        F(10, True, "B91C1C"), align=L)
    merge(ws, top+10, 6, top+10, 16)
    hd = [("분류", 1, 1), ("영역", 2, 3), ("배점", 4, 4), ("득점", 5, 5),
          ("성취도(%)", 6, 7), ("", 8, 16)]
    for t, c1, c2 in hd:
        put(ws, top+11, c1, t, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
        if c2 > c1: merge(ws, top+11, c1, top+11, c2)
    A = "자동계산!$A$4:$A$48"
    for k in range(12):
        r = top + 12 + k
        S = SET_[k]
        st = f"INDEX(회차설정!$C$13:$C$27,{S})"
        en = f"INDEX(회차설정!$D$13:$D$27,{S})"
        put(ws, r, 1, f'=IF({S}="","",INDEX(회차설정!$A$13:$A$27,{S}))', F(11), align=C, border=BOX)
        put(ws, r, 2, f'=IF({S}="","",INDEX(회차설정!$B$13:$B$27,{S}))', F(11), align=C, border=BOX)
        merge(ws, r, 2, r, 3)
        put(ws, r, 4,
            f'=IF({S}="","",IF({SUB}="언어와 매체",'
            f'SUMPRODUCT(({A}>={st})*({A}<={en})*자동계산!$E$4:$E$48),'
            f'SUMPRODUCT(({A}>={st})*({A}<={en})*자동계산!$C$4:$C$48)))', F(11), align=C, border=BOX)
        put(ws, r, 5,
            f'=IF(OR({S}="",{RH}=""),"",'
            f'SUM(OFFSET(전체채점!${CL(GR_P0-1)}$2,{RH},{st},1,{en}-{st}+1)))', F(11), align=C, border=BOX)
        put(ws, r, 6, f'=IF(OR({S}="",$D{r}=0,$D{r}="",$E{r}=""),"",$E{r}/$D{r}*100)',
            F(11, True), align=C, border=BOX, fmt="0.0")
        merge(ws, r, 6, r, 7)
        put(ws, r, 8, f'=IF($F{r}="","",REPT("■",ROUND($F{r}/5,0)))', F(11, False, PRI), align=L, border=BOX)
        merge(ws, r, 8, r, 16)
    rs = top + 24
    put(ws, rs, 1, f'=IF({RH}="","","합계")', F(11, True), fill=LIGHT, align=C, border=BOX)
    merge(ws, rs, 1, rs, 3)
    put(ws, rs, 4, f'=IF({RH}="","",SUM(D{top+12}:D{top+23}))', F(11, True), fill=LIGHT,
        align=C, border=BOX)
    put(ws, rs, 5, f'=IF({RH}="","",SUM(E{top+12}:E{top+23}))', F(11, True), fill=LIGHT,
        align=C, border=BOX)
    put(ws, rs, 6, f'=IF(OR($D{rs}=0,$D{rs}=""),"",$E{rs}/$D{rs}*100)', F(11, True), fill=LIGHT,
        align=C, border=BOX, fmt="0.0"); merge(ws, rs, 6, rs, 7)
    put(ws, rs, 8, f'=IF($F{rs}="","",REPT("■",ROUND($F{rs}/5,0)))', F(11, False, DEEP),
        fill=LIGHT, align=L, border=BOX); merge(ws, rs, 8, rs, 16)

    # --- 4. 문항 채점표 ---
    put(ws, top+26, 1, "4. 문항 채점표", F(12, True, PRI), align=L)
    for b in range(3):
        r0 = top + 27 + 4 * b
        for j, t in enumerate(["문항 번호", "정답", "학생답안", "정오"]):
            put(ws, r0 + j, 1, t, F(10, True, "FFFFFF"), fill=PRI if j == 0 else GRAY,
                align=C, border=BOX)
        for j in range(15):
            q = b * 15 + j + 1
            c = 2 + j
            au_r = 3 + q
            put(ws, r0, c, q, F(10, True), fill=LIGHT, align=C, border=BOX)
            put(ws, r0+1, c, f'=IF({SUB}="","",IF({SUB}="언어와 매체",자동계산!$D${au_r},자동계산!$B${au_r}))',
                F(10), align=C, border=BOX)
            put(ws, r0+2, c, f'=IF({RH}="","",INDEX(전체채점!{CL(GR_A0+q-1)}${R1}:{CL(GR_A0+q-1)}${R2},{RH}))',
                F(10), align=C, border=BOX)
            put(ws, r0+3, c, f'=IF({RH}="","",INDEX(전체채점!{CL(GR_P0+q-1)}${R1}:{CL(GR_P0+q-1)}${R2},{RH}))',
                F(10), align=C, border=BOX)
        ws.conditional_formatting.add(
            f"B{r0+3}:P{r0+3}",
            CellIsRule(operator="equal", formula=["0"], fill=FILL("FEE2E2"),
                       font=Font(name="맑은 고딕", size=10, bold=True, color="B91C1C")))

def style_report_sheet(ws):
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 11
    for c in range(2, 17):
        ws.column_dimensions[CL(c)].width = 5.6
    ws.column_dimensions["B"].width = 5.6
    for c in (HC, SC_):
        ws.column_dimensions[CL(c)].width = 5
        ws.column_dimensions[CL(c)].hidden = True
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_margins.left = ws.page_margins.right = 0.3
    ws.page_margins.top = ws.page_margins.bottom = 0.4

# ---- 성적표 (한 명) ----
rp = wb.create_sheet("성적표")
build_report(rp, 1, f'=IFERROR(MATCH($A$5,답안입력!$A${R1}:$A${R2},0),"")', name_dropdown=True)
style_report_sheet(rp)
rp.page_setup.fitToHeight = 1
rp.print_area = "A1:P39"
dv_name = DataValidation(type="list", formula1=f"=답안입력!$A${R1}:$A${R2}", allow_blank=True)
rp.add_data_validation(dv_name); dv_name.add("A5")
put(rp, 41, 1, "※ 위 노란 칸(성명)을 누르면 학생 목록이 펼쳐집니다. 고르면 성적표가 그 학생 것으로 바뀝니다.",
    F(11, False, "B45309"), align=L)
merge(rp, 41, 1, 41, 16)

# ---- 성적표(전원) ----
al = wb.create_sheet("성적표(전원)")
for i in range(MAXS):
    top = 1 + BLOCK_H * i
    build_report(al, top, f'=IF(답안입력!$A${R1+i}="","",{i+1})')
    if i:
        al.row_breaks.append(Break(id=top - 1))
style_report_sheet(al)
al.page_setup.fitToHeight = 0
al.print_area = f"A1:P{BLOCK_H*MAXS}"

# ============================================================ 분석
an = wb.create_sheet("분석")
an.sheet_view.showGridLines = False
for col, w in zip("ABCDEFGH", [14, 14, 14, 14, 16, 16, 30, 6]):
    an.column_dimensions[col].width = w
an.column_dimensions["G"].width = 30
an.column_dimensions["H"].hidden = True
put(an, 1, 1, "반 전체 분석", F(18, True, DEEP), align=L); merge(an, 1, 1, 1, 7)
TC = f"전체채점!$C${R1}:$C${R2}"
TB = f"전체채점!$B${R1}:$B${R2}"
TD = f"전체채점!$D${R1}:$D${R2}"

put(an, 3, 1, "■ 요약", F(12, True, PRI), align=L); merge(an, 3, 1, 3, 3)
summ = [("응시 인원", f"=COUNT({TC})", "0\"명\""),
        ("평균 점수", f'=IFERROR(AVERAGE({TC}),"")', "0.0"),
        ("최고 점수", f'=IFERROR(MAX({TC}),"")', "0"),
        ("최저 점수", f'=IFERROR(MIN({TC}),"")', "0"),
        ("화법과 작문 평균", f'=IFERROR(AVERAGEIF({TB},"화법과 작문",{TC}),"")', "0.0"),
        ("언어와 매체 평균", f'=IFERROR(AVERAGEIF({TB},"언어와 매체",{TC}),"")', "0.0"),
        ("성적표(전원) 인쇄 쪽수", f"=COUNT({TC})", "\"1쪽 ~ \"0\"쪽\"")]
for i, (t, f_, fmt) in enumerate(summ):
    r = 4 + i
    put(an, r, 1, t, F(11, True), fill=LIGHT, align=C, border=BOX); merge(an, r, 1, r, 2)
    put(an, r, 3, f_, F(12, True, DEEP), align=C, border=BOX, fmt=fmt)

put(an, 12, 1, "■ 등급 분포", F(12, True, PRI), align=L); merge(an, 12, 1, 12, 5)
for i, g in enumerate(["1등급", "2등급", "3등급", "4등급", "등급 외"]):
    put(an, 13, 1 + i, g, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
    put(an, 14, 1 + i, f'=COUNTIF({TD},"{g}")', F(12, True), align=C, border=BOX, fmt="0\"명\"")

put(an, 15, 1, "■ 공통과목 영역별 반 평균 성취도", F(12, True, PRI), align=L); merge(an, 15, 1, 15, 7)
for c, t in enumerate(["분류", "영역", "문항", "배점", "반 평균 득점", "평균 성취도(%)", "막대"], start=1):
    put(an, 16, c, t, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
A = "자동계산!$A$4:$A$48"
for k in range(8):
    r = 17 + k
    put(an, r, 8, f'=IFERROR(MATCH({k+1},회차설정!$F$13:$F$27,0),"")', F(9, False, GRAY))
    S = f"$H{r}"
    st = f"INDEX(회차설정!$C$13:$C$27,{S})"
    en = f"INDEX(회차설정!$D$13:$D$27,{S})"
    ok = f'IF({S}="","",IF(INDEX(회차설정!$E$13:$E$27,{S})<>"공통","",'
    put(an, r, 1, f'={ok}INDEX(회차설정!$A$13:$A$27,{S})))', F(11), align=C, border=BOX)
    put(an, r, 2, f'={ok}INDEX(회차설정!$B$13:$B$27,{S})))', F(11), align=C, border=BOX)
    put(an, r, 3, f'={ok}{st}&"~"&{en}))', F(11), align=C, border=BOX)
    put(an, r, 4, f'=IF($A{r}="","",SUMPRODUCT(({A}>={st})*({A}<={en})*자동계산!$C$4:$C$48))',
        F(11), align=C, border=BOX)
    put(an, r, 5,
        f'=IF(OR($A{r}="",$C$4=0),"",'
        f'SUM(OFFSET(전체채점!${CL(GR_P0-1)}$2,1,{st},{MAXS},{en}-{st}+1))/$C$4)',
        F(11), align=C, border=BOX, fmt="0.0")
    put(an, r, 6, f'=IF(OR($A{r}="",$D{r}=0,$D{r}=""),"",$E{r}/$D{r}*100)',
        F(11, True), align=C, border=BOX, fmt="0.0")
    put(an, r, 7, f'=IF($F{r}="","",REPT("■",ROUND($F{r}/5,0)))', F(11, False, PRI), align=L, border=BOX)

put(an, 26, 1, "■ 문항별 정답률  (낮은 문항이 많이 틀린 문항입니다)", F(12, True, PRI), align=L)
merge(an, 26, 1, 26, 7)
for c, t in enumerate(["번호", "전체 정답률(%)", "화법과 작문(%)", "언어와 매체(%)", "", "", "막대"], start=1):
    put(an, 27, c, t, F(11, True, "FFFFFF"), fill=PRI, align=C, border=BOX)
merge(an, 27, 5, 27, 6)
for q in range(1, 46):
    r = 27 + q
    pc = CL(GR_P0 + q - 1)
    put(an, r, 1, q, F(10, True), fill=LIGHT, align=C, border=BOX)
    put(an, r, 2, f'=IFERROR(COUNTIF(전체채점!{pc}${R1}:{pc}${R2},">0")/$C$4*100,"")',
        F(10, True), align=C, border=BOX, fmt="0")
    if q >= 35:
        for c, dae in ((3, "화법과 작문"), (4, "언어와 매체")):
            put(an, r, c,
                f'=IFERROR(COUNTIFS({TB},"{dae}",전체채점!{pc}${R1}:{pc}${R2},">0")'
                f'/COUNTIF({TB},"{dae}")*100,"")', F(10), align=C, border=BOX, fmt="0")
    else:
        put(an, r, 3, "-", F(10, False, GRAY), align=C, border=BOX)
        put(an, r, 4, "-", F(10, False, GRAY), align=C, border=BOX)
    put(an, r, 5, None, border=BOX); put(an, r, 6, None, border=BOX)
    merge(an, r, 5, r, 6)
    put(an, r, 7, f'=IF($B{r}="","",REPT("■",ROUND($B{r}/5,0)))', F(10, False, PRI), align=L, border=BOX)
    an.conditional_formatting.add(f"B{r}", CellIsRule(
        operator="lessThan", formula=["50"], fill=FILL("FEE2E2"),
        font=Font(name="맑은 고딕", size=10, bold=True, color="B91C1C")))
an.freeze_panes = "A28"

order = ["사용법", "회차설정", "답안입력", "성적표", "성적표(전원)", "분석", "자동계산", "전체채점"]
wb._sheets = [wb[n] for n in order]
wb.active = 0
wb.calculation.fullCalcOnLoad = True
wb.save("모의고사-성적표-30차.xlsx")
print("만들었습니다")

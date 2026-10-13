import sqlite3
from collections import defaultdict
import datetime

conn = sqlite3.connect('/media/DCORREA/TradeAi/TRADEAI/db/custom.db')
cursor = conn.cursor()

cursor.execute('SELECT id, botConfigId, symbol, side, price, quantity, total, strategy, mode, pnl, timestamp FROM Trade ORDER BY timestamp ASC')
rows = cursor.fetchall()

total_trades = len(rows)
sells = [r for r in rows if r[3] == 'SELL']
buys = [r for r in rows if r[3] == 'BUY']

total_pnl = sum(r[9] for r in sells)
wins = [r for r in sells if r[9] > 0]
losses = [r for r in sells if r[9] < 0]
breakevens = [r for r in sells if r[9] == 0]

win_rate = (len(wins) / len(sells) * 100) if sells else 0
sum_win = sum(r[9] for r in wins)
sum_loss = sum(r[9] for r in losses)
avg_win = (sum_win / len(wins)) if wins else 0
avg_loss = (sum_loss / len(losses)) if losses else 0
payoff = abs(avg_win / avg_loss) if avg_loss != 0 else 0
profit_factor = (sum_win / abs(sum_loss)) if sum_loss != 0 else 0

print(f"Total trades no DB: {total_trades}")
print(f"Entradas (BUY): {len(buys)}")
print(f"Saídas (SELL): {len(sells)}")
print("=" * 60)
print(f"PnL Acumulado Total: ${total_pnl:.2f}")
print(f"Wins: {len(wins)} ({win_rate:.1f}%) | Losses: {len(losses)} ({len(losses)/len(sells)*100 if sells else 0:.1f}%) | Breakeven: {len(breakevens)}")
print(f"Ganho Total Bruto (Gross Profit): ${sum_win:.2f}")
print(f"Prejuízo Total Bruto (Gross Loss): ${sum_loss:.2f}")
print(f"Ganho Médio por Vitória: ${avg_win:.2f}")
print(f"Perda Média por Derrota: ${avg_loss:.2f}")
print(f"Payoff Ratio (Win/Loss size): {payoff:.2f}")
print(f"Profit Factor: {profit_factor:.2f}")
print("=" * 60)

# Por Símbolo
by_symbol = defaultdict(lambda: {'count': 0, 'pnl': 0.0, 'wins': 0, 'losses': 0})
for r in sells:
    sym = r[2]
    pnl = r[9]
    by_symbol[sym]['count'] += 1
    by_symbol[sym]['pnl'] += pnl
    if pnl > 0:
        by_symbol[sym]['wins'] += 1
    elif pnl < 0:
        by_symbol[sym]['losses'] += 1

print("\n--- DESEMPENHO POR SÍMBOLO ---")
sorted_syms = sorted(by_symbol.items(), key=lambda x: x[1]['pnl'])
for sym, d in sorted_syms:
    wr = (d['wins'] / d['count'] * 100) if d['count'] else 0
    print(f"{sym:12} | Trades: {d['count']:2} | PnL: ${d['pnl']:8.2f} | WinRate: {wr:5.1f}% (W:{d['wins']}/L:{d['losses']})")

# Por Motivo de Saída (Strategy column no SELL)
by_exit = defaultdict(lambda: {'count': 0, 'pnl': 0.0, 'wins': 0, 'losses': 0})
for r in sells:
    strat = r[7] or ''
    reason = 'OUTRO'
    if 'PARCIAL' in strat:
        reason = 'PARCIAL_TARGET (🎯)'
    elif '🛑' in strat or 'Stop' in strat or 'STOP' in strat:
        reason = 'STOP_LOSS (🛑)'
    elif '⏱️' in strat or 'Time' in strat or 'TEMPO' in strat:
        reason = 'TIME_STOP (⏱️)'
    elif '🎯' in strat or 'TARGET' in strat or 'Take Profit' in strat:
        reason = 'TAKE_PROFIT (🎯)'
    
    by_exit[reason]['count'] += 1
    by_exit[reason]['pnl'] += r[9]
    if r[9] > 0:
        by_exit[reason]['wins'] += 1
    elif r[9] < 0:
        by_exit[reason]['losses'] += 1

print("\n--- DESEMPENHO POR TIPO DE SAÍDA ---")
for reason, d in sorted(by_exit.items(), key=lambda x: x[1]['pnl']):
    wr = (d['wins'] / d['count'] * 100) if d['count'] else 0
    print(f"{reason:22} | Saídas: {d['count']:2} | PnL: ${d['pnl']:8.2f} | WinRate: {wr:5.1f}% (W:{d['wins']}/L:{d['losses']})")

# Ver detalhes das perdas recentes
print("\n--- ÚLTIMAS 25 SAÍDAS (SELL) ---")
for r in sells[-25:]:
    ts = datetime.datetime.fromtimestamp(r[10]/1000.0 if r[10] > 10000000000 else r[10]).strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {r[2]:10} | Qty: {r[5]:10.2f} | Prc: {r[4]:10.4f} | Total: ${r[6]:7.2f} | PnL: ${r[9]:6.2f} | Strat: {r[7][:45]}")

import 'package:flutter/material.dart';

class PullToRefreshList<T> extends StatelessWidget {
  const PullToRefreshList({
    Key? key,
    required this.items,
    required this.onRefresh,
    required this.itemBuilder,
    this.emptyPlaceholder = const Center(child: Text('Nenhum dado disponível')),
  }) : super(key: key);

  final List<T> items;
  final Future<void> Function() onRefresh;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final Widget emptyPlaceholder;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return RefreshIndicator(
        onRefresh: onRefresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: MediaQuery.of(context).size.height * 0.4,
            ),
            emptyPlaceholder,
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      backgroundColor: const Color(0xFF1E1E1E),
      color: Colors.greenAccent,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: items.length,
        // Using const keying and optimized building for 60fps scrolling
        itemBuilder: (context, index) {
          final item = items[index];
          return itemBuilder(context, item);
        },
      ),
    );
  }
}

// Example representation of a static performance-optimized list tile
class TradeHistoryItem extends StatelessWidget {
  // Marked as const to prevent re-building when Riverpod state triggers updates elsewhere
  const TradeHistoryItem({
    Key? key,
    required this.symbol,
    required this.side,
    required this.price,
    required this.quantity,
    required this.timestamp,
  }) : super(key: key);

  final String symbol;
  final String side;
  final double price;
  final double quantity;
  final String timestamp;

  @override
  Widget build(BuildContext context) {
    final bool isBuy = side.toUpperCase() == 'BUY';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white12),
      ),
      child: ListTile(
        leading: Icon(
          isBuy ? Icons.arrow_downward : Icons.arrow_upward,
          color: isBuy ? Colors.green : Colors.red,
        ),
        title: Text(
          symbol,
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        subtitle: Text('Qtd: $quantity | Hora: $timestamp'),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '\$${price.toStringAsFixed(2)}',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 2),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isBuy ? Colors.green.withOpacity(0.15) : Colors.red.withOpacity(0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                side,
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.bold,
                  color: isBuy ? Colors.green : Colors.red,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

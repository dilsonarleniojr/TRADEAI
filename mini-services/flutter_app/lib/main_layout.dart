import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

// Global state provider for paper trading environment
final isPaperTradingProvider = StateProvider<bool>((ref) => true);

class MainLayout extends ConsumerWidget {
  const MainLayout({Key? key, required this.child}) : super(key: key);

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPaperTrading = ref.watch(isPaperTradingProvider);

    // Theme values depending on environment
    final Color primaryColor = isPaperTrading ? Colors.amber.shade800 : const Color(0xFF00C853);
    final Color appBarBgColor = isPaperTrading ? Colors.amber.shade900 : const Color(0xFF1B5E20);
    final Color scaffoldBgColor = const Color(0xFF121212);

    return Theme(
      data: ThemeData.dark().copyWith(
        primaryColor: primaryColor,
        scaffoldBackgroundColor: scaffoldBgColor,
        appBarTheme: AppBarTheme(
          backgroundColor: appBarBgColor,
          elevation: 4.0,
        ),
      ),
      child: Scaffold(
        appBar: AppBar(
          title: Row(
            children: [
              const Icon(Icons.analytics_outlined, color: Colors.white),
              const SizedBox(width: 8),
              const Text(
                'TRADEAI',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.2,
                ),
              ),
              const Spacer(),
              // Environment display badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: isPaperTrading ? Colors.black38 : Colors.green.shade900,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: isPaperTrading ? Colors.amberAccent : Colors.greenAccent,
                    width: 1.5,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(
                      radius: 4,
                      backgroundColor: isPaperTrading ? Colors.amberAccent : Colors.greenAccent,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      isPaperTrading ? 'SIMULAÇÃO' : 'REAL (BINANCE)',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: isPaperTrading ? Colors.amberAccent : Colors.greenAccent,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(40.0),
            child: Container(
              color: Colors.black26,
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              height: 40.0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.between,
                children: [
                  Text(
                    isPaperTrading ? '⚠️ Ambiente Simulado (Paper Mode)' : '🔒 Conectado à API Binance Live',
                    style: const TextStyle(
                      fontSize: 11,
                      color: Colors.white70,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Row(
                    children: [
                      const Text(
                        'Paper Trading',
                        style: TextStyle(fontSize: 11, color: Colors.white),
                      ),
                      const SizedBox(width: 4),
                      Switch(
                        value: isPaperTrading,
                        onChanged: (val) {
                          ref.read(isPaperTradingProvider.notifier).state = val;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              content: Text(
                                val 
                                    ? '🟢 Ambiente alterado para MODO SIMULAÇÃO' 
                                    : '🔵 Ambiente alterado para MODO REAL (LIVE)'
                              ),
                              backgroundColor: val ? Colors.amber.shade900 : Colors.green.shade900,
                              duration: const Duration(seconds: 2),
                            ),
                          );
                        },
                        activeColor: Colors.amberAccent,
                        activeTrackColor: Colors.amber.shade400,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        body: SafeArea(child: child),
      ),
    );
  }
}

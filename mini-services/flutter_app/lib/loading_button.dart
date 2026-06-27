import 'package:flutter/material.dart';

class AsyncLoadingButton extends StatefulWidget {
  const AsyncLoadingButton({
    Key? key,
    required this.label,
    required this.onPressed,
    required this.stopLoss,
    required this.orderRiskPercentage,
    this.style,
  }) : super(key: key);

  final String label;
  final Future<void> Function() onPressed;
  final double? stopLoss;
  final double orderRiskPercentage; // Risk relative to capital (e.g. 0.03 for 3%)
  final ButtonStyle? style;

  @override
  State<AsyncLoadingButton> createState() => _AsyncLoadingButtonState();
}

class _AsyncLoadingButtonState extends State<AsyncLoadingButton> {
  bool _isLoading = false;

  Future<void> _handlePress() async {
    // Pilar 5: UI Circuit Breaker - Stop Loss check
    if (widget.stopLoss == null || widget.stopLoss! <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('❌ Operação Bloqueada: Stop Loss obrigatório não preenchido.'),
          backgroundColor: Colors.redAccent,
        ),
      );
      return;
    }

    // Pilar 5: UI Circuit Breaker - Risk Limit check
    if (widget.orderRiskPercentage > 0.05) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '❌ Risco Excedido: O risco da operação (${(widget.orderRiskPercentage * 100).toStringAsFixed(1)}%) ultrapassa o limite de 5% do capital.'
          ),
          backgroundColor: Colors.redAccent,
        ),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      await widget.onPressed();
      
      // Pilar 2: Success SnackBar
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Ordem Executada com Sucesso!'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      // Pilar 2: Failure SnackBar with exact error reason
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Falha na Operação: ${e.toString()}'),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return ElevatedButton(
      style: widget.style ?? ElevatedButton.styleFrom(
        minimumSize: const Size(double.infinity, 50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
      onPressed: _isLoading ? null : _handlePress,
      child: _isLoading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
              ),
            )
          : Text(
              widget.label,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.1,
              ),
            ),
    );
  }
}

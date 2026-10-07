import pytest
import logging
from scripts.ai_signal_gatekeeper import (
    SYSTEM_PROMPT_STRICT_HFT,
    AISignalPayload,
    prepare_enriched_ai_payload,
    parse_strict_ai_response,
    apply_backend_risk_gatekeeper,
)


def test_system_prompt_strictly_prohibits_free_text():
    assert "PROIBIÇÃO ABSOLUTA" in SYSTEM_PROMPT_STRICT_HFT
    assert "Não gere saudações" in SYSTEM_PROMPT_STRICT_HFT
    assert '"signal": "BUY" | "SELL" | "HOLD"' in SYSTEM_PROMPT_STRICT_HFT
    assert '"confidence_score": <inteiro de 0 a 100>' in SYSTEM_PROMPT_STRICT_HFT
    assert '"risk_reward_ratio":' in SYSTEM_PROMPT_STRICT_HFT
    assert '"key_driver":' in SYSTEM_PROMPT_STRICT_HFT
    assert '"risk_warning":' in SYSTEM_PROMPT_STRICT_HFT


def test_prepare_enriched_ai_payload():
    enriched = prepare_enriched_ai_payload(
        symbol="BTCUSDT",
        price=85000.0,
        volume=100.0,
        quote_volume=8450000.0,  # VWAP = 84500.0
        high_24h=86000.0,
        low_24h=84000.0,
        order_flow_imbalance=0.25,
        buyer_percent=62.5,
        seller_percent=37.5,
        funding_rate_percent=0.015,
    )

    metrics = enriched["metrics"]
    assert metrics["vwap"] == 84500.0
    assert metrics["vwap_distance_percent"] > 0
    assert metrics["order_flow_imbalance"] == 0.25
    assert metrics["buyer_percent"] == 62.5
    assert "Compradores agressivos" in metrics["liquidity_controller"]
    assert "DADOS DE MERCADO E MICROESTRUTURA PARA BTCUSDT" in enriched["user_prompt"]
    assert "Distância para VWAP:" in enriched["user_prompt"]
    assert "Funding Rate 8h:" in enriched["user_prompt"]


def test_parse_strict_ai_response():
    raw_json = """
    {
      "signal": "BUY",
      "confidence_score": 88,
      "risk_reward_ratio": 2.75,
      "key_driver": "Rompimento de VWAP com volume institucional acima das médias móveis",
      "risk_warning": "Liquidez espessa na resistência imediatamente acima do topo histórico",
      "stop_loss": 84000.0,
      "take_profit": 87750.0
    }
    """
    payload = parse_strict_ai_response(raw_json, current_price=85000.0)
    assert payload.signal == "BUY"
    assert payload.confidence_score == 88
    assert payload.risk_reward_ratio == 2.75
    # Garantir que key_driver e risk_warning têm no máximo 10 palavras
    assert len(payload.key_driver.split()) <= 10
    assert len(payload.risk_warning.split()) <= 10
    assert payload.stop_loss == 84000.0
    assert payload.take_profit == 87750.0


def test_backend_risk_gatekeeper_vetoes_unfavorable_rr(caplog):
    caplog.set_level(logging.WARNING)

    # Payload com R:R = 1.4 (< 2.0 mínimo)
    unfavorable_payload = AISignalPayload(
        signal="BUY",
        confidence_score=90,
        risk_reward_ratio=1.40,
        key_driver="Sinal forte mas com stop muito distante",
        risk_warning="Resistência próxima",
        stop_loss=84000.0,
        take_profit=86400.0,
    )

    result = apply_backend_risk_gatekeeper(unfavorable_payload, min_rr_ratio=2.0)

    # Deve sobrepor a decisão da IA e forçar HOLD
    assert result.signal == "HOLD"
    assert result.vetoed is True
    assert "Operação vetada pela matriz de risco: Assimetria desfavorável" in result.veto_reason
    assert "Operação vetada pela matriz de risco: Assimetria desfavorável" in caplog.text


def test_backend_risk_gatekeeper_allows_favorable_rr(caplog):
    caplog.set_level(logging.WARNING)

    # Payload com R:R = 2.5 (>= 2.0)
    favorable_payload = AISignalPayload(
        signal="BUY",
        confidence_score=85,
        risk_reward_ratio=2.50,
        key_driver="Rompimento de VWAP com volume",
        risk_warning="Resistência superior distante",
        stop_loss=84000.0,
        take_profit=87500.0,
    )

    result = apply_backend_risk_gatekeeper(favorable_payload, min_rr_ratio=2.0)

    # Mantém o sinal de compra
    assert result.signal == "BUY"
    assert result.vetoed is False
    assert result.veto_reason is None

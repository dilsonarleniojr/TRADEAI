from __future__ import annotations

import dataclasses
from typing import Any, Dict, List, Optional, Union
import numpy as np


@dataclasses.dataclass
class ConformalPredictionInterval:
    point: float
    lower: float
    upper: float
    interval_width: float
    confidence_level: float = 95.0
    is_calibrated: bool = True


class ConformalPredictor:
    """
    Split Conformal Predictor para séries temporais financeiras.
    Garante cobertura estatística de (1 - alpha) sob pressuposto de intercambialidade local.
    """
    def __init__(self, alpha: float = 0.05):
        """
        :param alpha: Nível de significância (default 0.05 -> cobertura garantida de 95%)
        """
        if not 0.0 < alpha < 1.0:
            raise ValueError("Alpha deve estar entre 0.0 e 1.0")
        self.alpha = alpha
        self.calibrated_q: Optional[float] = None
        self.calibration_size: int = 0

    @property
    def q_hat(self) -> float:
        return self.calibrated_q if self.calibrated_q is not None else 0.0

    def calibrate(
        self,
        actuals_or_residuals: List[float],
        predictions: Optional[List[float]] = None,
    ) -> float:
        """
        Calibra o quantile de não-conformidade usando o conjunto de calibração hold-out.
        Pode receber lista de resíduos |y - y_hat| ou (actuals, predictions).
        """
        if predictions is not None:
            if len(actuals_or_residuals) != len(predictions) or len(actuals_or_residuals) < 5:
                raise ValueError("Conjunto de calibração deve ter tamanho idêntico e pelo menos 5 amostras.")
            y_true = np.array(actuals_or_residuals, dtype=np.float64)
            y_hat = np.array(predictions, dtype=np.float64)
            residuals = np.abs(y_true - y_hat)
        else:
            if len(actuals_or_residuals) == 0:
                raise ValueError("Resíduos não podem estar vazios.")
            residuals = np.abs(np.array(actuals_or_residuals, dtype=np.float64))

        n = len(residuals)
        self.calibration_size = n

        # Quantile finito com correção de amostra (n + 1) * (1 - alpha) / n
        quantile_level = min(1.0, np.ceil((n + 1) * (1 - self.alpha)) / n)
        self.calibrated_q = float(np.quantile(residuals, quantile_level, method="higher"))
        return self.calibrated_q

    def predict_interval(
        self, point_predictions: Union[float, List[float]]
    ) -> Union[ConformalPredictionInterval, List[ConformalPredictionInterval]]:
        """
        Retorna intervalos de confiança calibrados para uma ou múltiplas previsões pontuais.
        """
        q_val = self.calibrated_q if self.calibrated_q is not None else 0.0
        is_single = isinstance(point_predictions, (int, float))
        points = [float(point_predictions)] if is_single else [float(p) for p in point_predictions]

        intervals: List[ConformalPredictionInterval] = []
        for pt in points:
            margin = q_val if self.calibrated_q is not None else pt * 0.015
            lower = max(0.0, pt - margin)
            upper = pt + margin
            intervals.append(
                ConformalPredictionInterval(
                    point=round(pt, 4),
                    lower=round(lower, 4),
                    upper=round(upper, 4),
                    interval_width=round(upper - lower, 4),
                    confidence_level=round((1.0 - self.alpha) * 100, 1),
                    is_calibrated=self.calibrated_q is not None,
                )
            )

        return intervals[0] if is_single else intervals

import re

class FactScorer:
    def __init__(self, threshold=0.7):
        self.threshold = threshold
        self.clickbait_keywords = {
            "urgente", "bomba", "confirmado", "revelado", "inacreditável", 
            "segredo", "você não vai acreditar", "choca o mundo", "assustador"
        }

    def _has_clickbait(self, text):
        cleaned = text.lower()
        for kw in self.clickbait_keywords:
            if kw in cleaned:
                return True
        return False

    def evaluate_event(self, event):
        """
        Calcula o score de confiabilidade de um Evento com base nas suas fontes de artigos.
        """
        articles = event.get("articles", [])
        if not articles:
            return 0.0

        # Base score on source count
        unique_sources = set(art["source"] for art in articles)
        n_sources = len(unique_sources)
        
        if n_sources == 1:
            base_score = 0.50
        elif n_sources == 2:
            base_score = 0.80
        else:
            base_score = 0.95

        # Cross-source claim overlap calculation
        overlap_score = 1.0
        if n_sources > 1:
            # Token overlap between titles of different sources
            token_sets = []
            for art in articles:
                tokens = set(re.findall(r'\w+', art["title"].lower()))
                token_sets.append(tokens)
            
            # Average Jaccard overlap between all pairs
            overlaps = []
            for i in range(len(token_sets)):
                for j in range(i + 1, len(token_sets)):
                    intersection = token_sets[i] & token_sets[j]
                    union = token_sets[i] | token_sets[j]
                    if union:
                        overlaps.append(len(intersection) / len(union))
            
            if overlaps:
                overlap_score = sum(overlaps) / len(overlaps)
            else:
                overlap_score = 0.0

        # Clickbait penalty
        penalty = 0.0
        for art in articles:
            if self._has_clickbait(art["title"]):
                penalty += 0.15
        
        # Calculate final score
        final_score = (base_score * 0.6) + (overlap_score * 0.4) - penalty
        final_score = max(0.0, min(1.0, final_score))
        
        # Rule execution: threshold gate
        event["confidenceScore"] = final_score
        if final_score < self.threshold:
            event["status"] = "PENDING_REVIEW"
        else:
            event["status"] = "PUBLISHED"

        return final_score

if __name__ == "__main__":
    scorer = FactScorer()
    
    # Test 1: Clickbait and single source
    test_event_1 = {
        "title": "BOMBA! Bitcoin vai subir 1000% amanhã!",
        "articles": [
            {"source": "PortalClick", "title": "BOMBA! Bitcoin vai subir 1000% amanhã!"}
        ]
    }
    
    # Test 2: Multi-source consensus
    test_event_2 = {
        "title": "Fed debate regulação sobre Stablecoins",
        "articles": [
            {"source": "CoinDesk", "title": "Membros do Fed discutem regulação sobre Stablecoins"},
            {"source": "Reuters", "title": "Regulação de Stablecoins é discutida por diretores do Fed"}
        ]
    }

    print("Event 1 Score:", scorer.evaluate_event(test_event_1), "| Status:", test_event_1["status"])
    print("Event 2 Score:", scorer.evaluate_event(test_event_2), "| Status:", test_event_2["status"])

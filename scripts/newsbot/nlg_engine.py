import re

class NLGEngine:
    def __init__(self):
        pass

    def synthesize_event_report(self, event):
        """
        Gera o texto final estruturado (Título, Resumo, Corpo) baseado nas fontes do Evento.
        Verifica a aderência factual das frases geradas.
        """
        articles = event.get("articles", [])
        if not articles:
            return event

        # Rule-based synthesis template (fallback to high-fidelity summarization)
        # Extract main sentences
        all_sentences = []
        for art in articles:
            # Simple sentence splitting
            sentences = re.split(r'(?<=[.!?]) +', art["content"])
            all_sentences.extend([s.strip() for s in sentences if len(s.strip()) > 10])

        # De-duplicate sentences by Jaccard similarity to prevent repetition
        unique_sentences = []
        for s in all_sentences:
            is_dup = False
            s_words = set(s.lower().split())
            for us in unique_sentences:
                us_words = set(us.lower().split())
                intersection = s_words & us_words
                union = s_words | us_words
                if union and (len(intersection) / len(union)) > 0.6:
                    is_dup = True
                    break
            if not is_dup:
                unique_sentences.append(s)

        # Structure presentation template
        title = event.get("title", articles[0]["title"])
        summary = unique_sentences[0] if len(unique_sentences) > 0 else "Nenhum detalhe adicional disponível."
        
        # Build body paragraphs
        body_parts = unique_sentences[1:4] if len(unique_sentences) > 1 else unique_sentences
        body = " ".join(body_parts) if body_parts else summary

        # RAG Fact-Verification (Self-Check)
        # Verify that all words in the output body appear somewhere in source articles
        source_vocabulary = set()
        for art in articles:
            words = re.findall(r'\w+', (art["title"] + " " + art["content"]).lower())
            source_vocabulary.update(words)

        body_words = re.findall(r'\w+', body.lower())
        unsupported_count = sum(1 for w in body_words if w not in source_vocabulary and len(w) > 3)

        # Hallucination score
        hallucination_rate = unsupported_count / len(body_words) if body_words else 0.0
        
        if hallucination_rate > 0.15:
            # Flag for safety review if too many unsupported words are found
            event["status"] = "PENDING_REVIEW"

        event["title"] = title
        event["summary"] = f"**Resumo:** {summary}\n\n**Corpo:** {body}"
        event["hallucinationRate"] = hallucination_rate

        return event

if __name__ == "__main__":
    nlg = NLGEngine()
    test_event = {
        "title": "Bitcoin atinge nova máxima",
        "articles": [
            {
                "source": "CoinDesk", 
                "title": "Bitcoin atinge nova máxima", 
                "content": "Bitcoin ultrapassou os 80 mil dólares pela primeira vez. O interesse institucional impulsionou o mercado hoje."
            }
        ]
    }
    
    reported_event = nlg.synthesize_event_report(test_event)
    print("Título:", reported_event["title"])
    print("Resumo/Corpo:\n", reported_event["summary"])
    print("Taxa de Alucinação:", reported_event["hallucinationRate"])

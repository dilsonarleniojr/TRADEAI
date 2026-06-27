import math
import re

class NewsDeduplicator:
    def __init__(self, threshold=0.4):
        self.threshold = threshold

    def _tokenize(self, text):
        # Clean and tokenize text
        text = text.lower()
        words = re.findall(r'\w+', text)
        # Filter stopwords
        stopwords = {"a", "o", "que", "em", "de", "do", "da", "para", "com", "um", "uma", "os", "as", "the", "and", "of", "to", "in"}
        return [w for w in words if w not in stopwords and len(w) > 2]

    def _get_tf_idf_vector(self, tokens, vocabulary, idf):
        vector = {}
        for token in tokens:
            if token in vocabulary:
                tf = tokens.count(token)
                vector[token] = tf * idf.get(token, 1.0)
        return vector

    def _cosine_similarity(self, vec1, vec2):
        intersection = set(vec1.keys()) & set(vec2.keys())
        if not intersection:
            return 0.0
            
        numerator = sum([vec1[x] * vec2[x] for x in intersection])
        
        sum1 = sum([val**2 for val in vec1.values()])
        sum2 = sum([val**2 for val in vec2.values()])
        denominator = math.sqrt(sum1) * math.sqrt(sum2)
        
        if not denominator:
            return 0.0
        return numerator / denominator

    def cluster_articles(self, articles):
        """
        Agrupa artigos semanticamente idênticos ou muito próximos em Clusters/Eventos.
        Retorna uma lista de dicionários contendo o evento de notícia unificado e seus artigos originais associados.
        """
        if not articles:
            return []

        # Build vocabulary & IDF
        docs_tokens = [self._tokenize(art["title"] + " " + art["content"]) for art in articles]
        vocabulary = set(word for doc in docs_tokens for word in doc)
        
        # Calculate IDF
        idf = {}
        n_docs = len(articles)
        for term in vocabulary:
            doc_freq = sum(1 for doc in docs_tokens if term in doc)
            idf[term] = math.log((1 + n_docs) / (1 + doc_freq)) + 1.0

        # Create vectors
        vectors = [self._get_tf_idf_vector(tokens, vocabulary, idf) for tokens in docs_tokens]
        
        clusters = [] # List of list of article indices
        
        for i, vec in enumerate(vectors):
            assigned = False
            for cluster in clusters:
                # Compare against the representative (first item) of the cluster
                rep_idx = cluster[0]
                similarity = self._cosine_similarity(vec, vectors[rep_idx])
                if similarity >= self.threshold:
                    cluster.append(i)
                    assigned = True
                    break
            if not assigned:
                clusters.append([i])

        # Form output events
        events = []
        for cluster in clusters:
            primary_article = articles[cluster[0]]
            # Create a combined unified event
            event = {
                "title": primary_article["title"],
                "summary": primary_article["content"],
                "category": "Market",
                "confidenceScore": 0.8,
                "status": "PUBLISHED",
                "articles": [articles[idx] for idx in cluster]
            }
            events.append(event)
            
        return events

if __name__ == "__main__":
    # Mini test
    deduper = NewsDeduplicator(threshold=0.3)
    test_articles = [
        {"title": "Membros do Fed discutem regulação sobre Stablecoins e CBDC", "content": "Debate no Federal Reserve.", "publishedAt": "2026-06-07T04:00:00Z", "source": "A"},
        {"title": "Fed debate regras de regulação para stablecoins e moeda digital", "content": "Discussão de membros do Fed.", "publishedAt": "2026-06-07T04:01:00Z", "source": "B"},
        {"title": "Bitcoin sobe forte atingindo nova máxima", "content": "Preço do BTC em alta.", "publishedAt": "2026-06-07T04:02:00Z", "source": "C"}
    ]
    clusters = deduper.cluster_articles(test_articles)
    import json
    print(json.dumps(clusters, indent=2, ensure_ascii=False))

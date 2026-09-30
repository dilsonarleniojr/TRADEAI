import os
import sys
import sqlite3
import uuid
import datetime

# Adiciona o diretório scripts ao path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from newsbot.ingestor import NewsIngestor
from newsbot.deduplicator import NewsDeduplicator
from newsbot.fact_scoring import FactScorer
from newsbot.nlg_engine import NLGEngine

DB_PATH = "/home/dcorrea/AntigravityApp/TRADEAI/TRADEAI/db/custom.db"

def run_pipeline():
    print("🚀 Running Newsbot Daemon Pipeline...")
    
    # 1. Ingest
    ingestor = NewsIngestor()
    articles = ingestor.ingest_all()
    print(f"📥 Coletados {len(articles)} artigos.")

    # 2. Deduplicate / Cluster
    deduper = NewsDeduplicator(threshold=0.35)
    events = deduper.cluster_articles(articles)
    print(f"🧩 Agrupados em {len(events)} eventos únicos.")

    # 3 & 4. Fact-Score, NLG Synthesis & Multimodal Processing
    scorer = FactScorer(threshold=0.6)
    nlg = NLGEngine()
    from newsbot.multimodal_pipeline import MultimodalPipeline
    multimodal = MultimodalPipeline()

    processed_events = []
    for ev in events:
        scorer.evaluate_event(ev)
        nlg.synthesize_event_report(ev)
        ev["id"] = str(uuid.uuid4())
        multimodal.process_multimodal_event(ev)
        processed_events.append(ev)

    # 5. Database Write (SQLite)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    now_ms = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
    
    try:
        # Clear old news items to keep DB clean during paper sandbox
        cursor.execute("DELETE FROM NewsArticle")
        cursor.execute("DELETE FROM NewsEvent")
        
        for ev in processed_events:
            event_id = ev["id"]
            
            # Insert NewsEvent with audioUrl, subtitleUrl, videoUrl
            cursor.execute(
                """
                INSERT INTO NewsEvent (id, title, summary, confidenceScore, status, category, audioUrl, subtitleUrl, videoUrl, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    ev["title"],
                    ev["summary"],
                    ev["confidenceScore"],
                    ev["status"],
                    ev["category"],
                    ev.get("audioUrl"),
                    ev.get("subtitleUrl"),
                    ev.get("videoUrl"),
                    now_ms,
                    now_ms
                )
            )
            
            # Insert NewsArticles belonging to this event
            for art in ev["articles"]:
                art_id = str(uuid.uuid4())
                cursor.execute(
                    """
                    INSERT INTO NewsArticle (id, eventId, source, sourceUrl, title, content, publishedAt, factScore, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        art_id,
                        event_id,
                        art["source"],
                        art["sourceUrl"],
                        art["title"],
                        art["content"],
                        art["publishedAt"],
                        ev["confidenceScore"], # Use event score as default article fact score
                        now_ms
                    )
                )
        
        conn.commit()
        print("💾 Database successfully updated with fresh validated news!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Database update failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    run_pipeline()

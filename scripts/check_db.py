import sqlite3

DB_PATH = "/home/dcorrea/AntigravityApp/TRADEAI/TRADEAI/db/custom.db"

def check_other_tables():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check Trade table
    try:
        cursor.execute("SELECT id, timestamp FROM Trade LIMIT 3")
        print("Trade timestamps:", cursor.fetchall())
    except Exception as e:
        print("Error checking Trade:", e)
        
    # Check WatchlistItem
    try:
        cursor.execute("SELECT id, symbol, createdAt FROM WatchlistItem LIMIT 3")
        print("Watchlist createdAt:", cursor.fetchall())
    except Exception as e:
        print("Error checking WatchlistItem:", e)
        
    # Check PriceAlert
    try:
        cursor.execute("SELECT id, createdAt, updatedAt FROM PriceAlert LIMIT 3")
        print("PriceAlert timestamps:", cursor.fetchall())
    except Exception as e:
        print("Error checking PriceAlert:", e)
        
    conn.close()

if __name__ == "__main__":
    check_other_tables()

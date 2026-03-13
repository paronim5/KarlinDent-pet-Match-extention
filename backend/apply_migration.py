import psycopg2
import os
import sys

# Add the current directory to sys.path so we can import config
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import config

def apply_migration(sql_file_path):
    print(f"Applying migration: {sql_file_path}")
    conn = None
    try:
        conn = psycopg2.connect(dsn=config.database_dsn)
        cur = conn.cursor()
        
        with open(sql_file_path, 'r') as f:
            sql = f.read()
            
        cur.execute(sql)
        conn.commit()
        print("Migration applied successfully.")
        
    except Exception as e:
        print(f"Error applying migration: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python apply_migration.py <path_to_sql_file>")
        sys.exit(1)
    
    apply_migration(sys.argv[1])

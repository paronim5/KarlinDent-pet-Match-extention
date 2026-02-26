import psycopg2
import time
import sys

from .config import config


def init_db_pool(minconn: int = 1, maxconn: int = 10) -> None:
    return None


def get_connection():
    max_retries = 5
    retry_delay = 2
    last_exception = None

    for attempt in range(max_retries):
        try:
            return psycopg2.connect(dsn=config.database_dsn)
        except psycopg2.OperationalError as e:
            last_exception = e
            print(f"Database connection attempt {attempt + 1}/{max_retries} failed. Retrying in {retry_delay}s...", file=sys.stderr)
            time.sleep(retry_delay)
    
    print("Could not connect to database after several attempts.", file=sys.stderr)
    raise last_exception


def release_connection(conn) -> None:
    if conn:
        conn.close()


def close_pool() -> None:
    return None

import psycopg2

from .config import config


def init_db_pool(minconn: int = 1, maxconn: int = 10) -> None:
    return None


def get_connection():
    return psycopg2.connect(dsn=config.database_dsn)


def release_connection(conn) -> None:
    conn.close()


def close_pool() -> None:
    return None

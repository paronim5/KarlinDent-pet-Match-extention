import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change")
    DB_HOST = os.environ.get("DB_HOST", "db")
    DB_PORT = int(os.environ.get("DB_PORT", "5432"))
    DB_NAME = os.environ.get("DB_NAME", "policlinic")
    DB_USER = os.environ.get("DB_USER", "policlinic")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "policlinic")
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
    DOCTOR_COMMISSION_RATE = float(os.environ.get("DOCTOR_COMMISSION_RATE", "0.3"))

    @property
    def database_dsn(self) -> str:
        return (
            f"dbname={self.DB_NAME} user={self.DB_USER} "
            f"password={self.DB_PASSWORD} host={self.DB_HOST} port={self.DB_PORT}"
        )


config = Config()

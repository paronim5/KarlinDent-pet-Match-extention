FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend code into /app/backend so it becomes a package "backend"
COPY . /app/backend

EXPOSE 5000

ENV DB_HOST=db
ENV DB_PORT=5432
ENV DB_NAME=policlinic
ENV DB_USER=policlinic
ENV DB_PASSWORD=policlinic

# Run as a module so relative imports (.config, .db, etc.) work
CMD ["python", "-m", "backend.app"]
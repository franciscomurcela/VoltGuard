FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py celery_config.py worker.py ./
COPY api.yaml ./

# Non-root user
RUN adduser --disabled-password --gecos '' appuser
USER appuser

EXPOSE 8085

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8085"]
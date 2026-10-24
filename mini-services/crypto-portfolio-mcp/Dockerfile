FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MCP_TRANSPORT=sse \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8003

COPY pyproject.toml README.md main.py ./

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir "ccxt>=4.4.72" "matplotlib>=3.10.1" "mcp[cli]>=1.6.0,<2" "uvicorn"

EXPOSE 8003

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/sse').read(1)" || exit 1

CMD ["python3", "main.py"]

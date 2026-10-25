# 1. Build the React app.
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2. Run the Django API, which also serves the built app from the same origin.
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1 \
    PATH="/app/backend/.venv/bin:$PATH" DJANGO_DEBUG=false
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
COPY --from=frontend /app/frontend/dist /app/frontend/dist
RUN useradd --create-home app
USER app
EXPOSE 8000
# One process so the in-memory weather cache is shared; threads cover concurrent requests.
CMD ["sh", "-c", "gunicorn config.wsgi --bind 0.0.0.0:${PORT:-8000} --workers 1 --threads 8 --timeout 60"]

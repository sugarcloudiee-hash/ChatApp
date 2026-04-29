# Build stage for frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm ci --prefer-offline --no-audit
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Python runtime stage
FROM python:3.11-slim
WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir gunicorn eventlet

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend from build stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy environment files (optional)
COPY .env* ./

EXPOSE 5050
CMD ["gunicorn", "-w", "1", "-k", "eventlet", "-b", "0.0.0.0:5050", "--timeout", "120", "backend.app:app"]

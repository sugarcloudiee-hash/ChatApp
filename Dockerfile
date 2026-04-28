# Build stage for frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Python runtime stage
FROM python:3.11-slim
WORKDIR /app

# Install gunicorn and python dependencies
COPY requirements.txt ./backend/
COPY backend/requirements.txt ./backend_reqs.txt
RUN pip install --no-cache-dir -r backend/requirements.txt && \
    pip install --no-cache-dir -r backend_reqs.txt && \
    pip install --no-cache-dir gunicorn eventlet

# Copy backend
COPY backend/ ./backend/

# Copy built frontend from build stage
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Copy config files
COPY .env* ./
COPY supabase_schema.sql ./

EXPOSE 5050
CMD ["gunicorn", "-w", "1", "-k", "eventlet", "-b", "0.0.0.0:5050", "backend.app:app"]

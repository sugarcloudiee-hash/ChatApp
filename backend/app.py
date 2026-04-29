from gevent import monkey
monkey.patch_all()

import psycogreen.gevent
psycogreen.gevent.patch_psycopg()

# ... all your other imports (Flask, SocketIO, etc.) go down here
import logging
import os
import subprocess
import signal
import sys
import time

# Set up logging first
logging.basicConfig(
    level=getattr(logging, os.environ.get('LOG_LEVEL', 'INFO').upper(), logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logging.getLogger('hpack').setLevel(logging.WARNING)

# Global variable to track Redis process
redis_process = None

def start_redis_server():
    """Start Redis server via Docker or as a local process."""
    global redis_process
    try:
        logger.info("🔴 Starting Redis server via Docker...")
        
        # Check if Docker is available
        try:
            subprocess.run(
                ["docker", "version"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=5
            )
        except FileNotFoundError:
            logger.warning("⚠ Docker not found in PATH")
            logger.warning("  Install Docker: https://www.docker.com/products/docker-desktop")
            return False
        except Exception as e:
            logger.warning("⚠ Docker Desktop is not running!")
            logger.warning("  Start Docker Desktop from your Applications menu or system tray")
            logger.warning(f"  Error: {str(e)[:80]}")
            return False
        
        # Try to start existing container first
        logger.info("Checking for existing Redis container...")
        result = subprocess.run(
            ["docker", "start", "chatapp-redis"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=5,
            text=True
        )
        
        if result.returncode == 0:
            logger.info(f"Started existing Redis container")
            time.sleep(5)  # Wait for container to be ready
            return True
        elif "No such container" in result.stderr:
            logger.info("No existing container, creating new one...")
            # Container doesn't exist, create it
            result = subprocess.run(
                ["docker", "run", "-d", "--name", "chatapp-redis", "-p", "6379:6379", "redis:latest"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=60,
                text=True
            )
            
            if result.returncode == 0:
                container_id = result.stdout.strip()
                logger.info(f"✓ Redis container created: {container_id[:12]}")
                time.sleep(6)  # Wait longer for new container to start
                logger.info("✓ Redis is ready for connections")
                return True
            else:
                error_msg = result.stderr.strip()
                logger.warning(f"⚠ Failed to create container: {error_msg}")
                return False
        else:
            logger.warning(f"⚠ Unexpected error: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.warning("⚠ Docker command timed out - Docker Desktop may not be running")
        return False
    except Exception as e:
        logger.warning(f"⚠ Error starting Redis: {e}")
        return False

def cleanup_redis(signum=None, frame=None):
    """Clean up Redis process on exit."""
    global redis_process
    if redis_process and redis_process.poll() is None:
        logger.info("Shutting down Redis server...")
        try:
            if sys.platform == "win32":
                redis_process.send_signal(signal.CTRL_C_EVENT)
            else:
                redis_process.terminate()
            redis_process.wait(timeout=2)
        except:
            redis_process.kill()

# Start Redis BEFORE importing Flask extensions
if __name__ == "__main__":
    start_redis_server()
    signal.signal(signal.SIGINT, cleanup_redis)
    signal.signal(signal.SIGTERM, cleanup_redis)

# NOW import Flask and extensions (after Redis is running)
from flask import Flask, request

from auth import register_auth
from config import APP_SECRET, DATABASE_URI, FRONTEND_DIR
from extensions import init_extensions, db, socketio
from models import ensure_direct_message_columns, ensure_user_email_column
from routes import register_routes
import sockets  # noqa: F401  # Register Socket.IO event handlers

logger.info("Backend application starting up...")

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path="",
)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URI
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_pre_ping": True,
    "pool_recycle": 300,
}
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024
app.config["SECRET_KEY"] = APP_SECRET
app.config["JSON_SORT_KEYS"] = False

init_extensions(app)
register_auth(app)
register_routes(app)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,X-Session-Token,X-Room-Key"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

@app.route("/", defaults={"path": ""}, methods=["OPTIONS"])
@app.route("/<path:path>", methods=["OPTIONS"])
def handle_options(path=""):
    return "", 204

@app.before_request
def log_request_info():
    logger.debug(f">>> REQUEST: {request.method} {request.path}")
    logger.debug(f"    From: {request.remote_addr}")
    if request.args:
        logger.debug(f"    Query: {dict(request.args)}")
    if request.form:
        logger.debug(f"    Form: {dict(request.form)}")

with app.app_context():
    db.create_all()
    ensure_user_email_column()
    ensure_direct_message_columns()

if __name__ == "__main__":
    port = int(os.environ.get('PORT', 5050))
    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )

import logging
import os
import sys
from pathlib import Path

# These must be at the very top before any other imports
from gevent import monkey
monkey.patch_all()

import psycogreen.gevent
psycogreen.gevent.patch_psycopg()

from flask import Flask, jsonify
from flask_cors import CORS

# Ensure backend module is importable
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.auth import register_auth
from backend.config import APP_SECRET, DATABASE_URI, PORT
from backend.extensions import init_extensions, db, socketio
from backend.routes import register_routes
import backend.sockets

# Setup Logging
logging.basicConfig(
    level=getattr(logging, os.environ.get('LOG_LEVEL', 'INFO').upper(), logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask App
app = Flask(__name__)
app.config["SECRET_KEY"] = APP_SECRET
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URI
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Enable CORS
CORS(app,
     resources={r"/*": {
         "origins": [
             "http://localhost:5173",
             "http://127.0.0.1:5173",
             "http://localhost:5050",
             "http://127.0.0.1:5050"
         ]
     }},
     supports_credentials=True)

# Initialize Extensions
init_extensions(app)
register_auth(app)
register_routes(app)


# Health check endpoint
@app.route('/api/health')
def health_check():
    return jsonify({
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": __import__('datetime').datetime.utcnow().isoformat() + "Z"
    })


# Global Error Handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "API route not found"}), 404


@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {str(e)}")
    return jsonify({"error": "Internal server error"}), 500


@app.errorhandler(401)
def unauthorized(e):
    return jsonify({"error": "Unauthorized"}), 401


# Database initialization
with app.app_context():
    db.create_all()
    logger.info("Database tables created and verified")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", PORT))
    logger.info(f"Starting API Server on port {port}...")
    logger.info(f"Socket.IO Server ready for connections")

    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=os.environ.get("FLASK_DEBUG") == "1",
        use_reloader=os.environ.get("FLASK_DEBUG") == "1"
    )
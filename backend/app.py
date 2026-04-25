import logging
import os

from flask import Flask, request

from auth import register_auth
from config import APP_SECRET, DATABASE_URI, FRONTEND_DIR
from extensions import init_extensions, db, socketio
from models import ensure_user_email_column
from routes import register_routes
import sockets  # noqa: F401  # Register Socket.IO event handlers

logging.basicConfig(
    level=getattr(logging, os.environ.get('LOG_LEVEL', 'INFO').upper(), logging.INFO),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('httpcore').setLevel(logging.WARNING)
logging.getLogger('hpack').setLevel(logging.WARNING)
logger.info("Backend application starting up...")

app = Flask(
    __name__,
    static_folder=str(FRONTEND_DIR),
    static_url_path="",
)
app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URI
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

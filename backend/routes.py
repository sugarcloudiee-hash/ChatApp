import uuid
from pathlib import Path

from flask import jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from auth import _current_user
from config import FRONTEND_DIR, UPLOAD_DIR
from extensions import db
from utils import _allowed_file, _make_file_token, _verify_file_token, _extract_room_key


def register_routes(app):
    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/me")
    def me():
        user = _current_user()
        return jsonify({"user": user.to_dict()})

    @app.get("/favicon.ico")
    def favicon():
        return "", 204

    @app.post("/session")
    def create_session():
        user = _current_user()
        return jsonify({"user": user.to_dict()}), 200

    @app.post("/upload")
    def upload():
        user = _current_user()
        if not user:
            return jsonify({"error": "Unauthorized"}), 401

        room_key = _extract_room_key()
        if not room_key:
            return jsonify({"error": "Missing room invite key"}), 400

        if "file" not in request.files:
            return jsonify({"error": "Missing file field 'file'"}), 400

        f = request.files["file"]
        if not f.filename:
            return jsonify({"error": "Empty filename"}), 400

        original_name = secure_filename(f.filename)
        if not _allowed_file(original_name, f.mimetype):
            return jsonify({"error": "File type not allowed"}), 400

        ext = Path(original_name).suffix
        unique_name = f"{uuid.uuid4().hex}{ext}"
        save_path = UPLOAD_DIR / unique_name
        f.save(save_path)

        token = _make_file_token(unique_name)
        return jsonify(
            {
                "file_url": f"/download/{token}",
                "original_name": original_name,
            }
        )

    @app.get("/download/<token>")
    def download(token: str):
        try:
            filename = _verify_file_token(token)
        except Exception:
            return jsonify({"error": "Invalid or expired download token"}), 403

        return send_from_directory(str(UPLOAD_DIR), filename, as_attachment=True)

    @app.get("/<path:path>")
    def frontend_assets(path: str):
        asset_path = Path(app.static_folder) / path
        if asset_path.exists() and asset_path.is_file():
            return send_from_directory(app.static_folder, path)
        return send_from_directory(app.static_folder, "index.html")

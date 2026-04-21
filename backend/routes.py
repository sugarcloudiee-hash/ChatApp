import json
import re
import uuid
from pathlib import Path

import requests
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

    @app.get("/youtube-search")
    def youtube_search():
        query = str(request.args.get("q") or "").strip()
        if not query:
            return jsonify({"items": []}), 200

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        try:
            response = requests.get(
                "https://www.youtube.com/results",
                params={"search_query": query},
                headers=headers,
                timeout=10,
            )
            html = response.text
        except Exception:
            return jsonify({"items": []}), 200

        def extract_initial_data(text):
            patterns = [r"var ytInitialData\s*=\s*", r"window\[\"ytInitialData\"\]\s*=\s*"]
            for pattern in patterns:
                match = re.search(pattern, text)
                if not match:
                    continue
                start = match.end()
                brace_count = 0
                in_string = False
                escape = False
                for idx, ch in enumerate(text[start:], start):
                    if ch == "\\" and not escape:
                        escape = True
                        continue
                    if ch == '"' and not escape:
                        in_string = not in_string
                    if in_string:
                        escape = False
                        continue
                    if ch == "{":
                        brace_count += 1
                    elif ch == "}":
                        brace_count -= 1
                        if brace_count == 0:
                            return text[start:idx + 1]
                    escape = False
            return None

        json_text = extract_initial_data(html)
        if not json_text:
            return jsonify({"items": []}), 200

        try:
            data = json.loads(json_text)
        except Exception:
            return jsonify({"items": []}), 200

        def collect_videos(node, found):
            if isinstance(node, dict):
                if "videoRenderer" in node:
                    found.append(node["videoRenderer"])
                for child in node.values():
                    collect_videos(child, found)
            elif isinstance(node, list):
                for child in node:
                    collect_videos(child, found)

        renderers = []
        collect_videos(data, renderers)

        items = []
        for renderer in renderers:
            video_id = renderer.get("videoId")
            if not video_id:
                continue
            title_runs = renderer.get("title", {}).get("runs", [])
            title = "".join([run.get("text", "") for run in title_runs])
            thumbnails = renderer.get("thumbnail", {}).get("thumbnails", [])
            thumbnail = thumbnails[-1].get("url") if thumbnails else ""
            channel_runs = renderer.get("ownerText", {}).get("runs", [])
            channel = "".join([run.get("text", "") for run in channel_runs])
            duration = renderer.get("lengthText", {}).get("simpleText", "")
            items.append(
                {
                    "id": video_id,
                    "title": title,
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                    "thumbnail": thumbnail,
                    "channel": channel,
                    "duration": duration,
                }
            )
            if len(items) >= 10:
                break

        seen = set()
        unique_items = []
        for item in items:
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            unique_items.append(item)

        return jsonify({"items": unique_items}), 200

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

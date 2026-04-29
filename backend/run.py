#!/usr/bin/env python
"""
Startup script that launches Redis server and then the Flask app.
"""
import subprocess
import sys
import time
import os
import signal
from pathlib import Path

# Import the app
from app import app, socketio

# Track spawned processes
spawned_processes = []

def start_redis():
    """Start Redis server. Handles both direct redis-server and docker/WSL scenarios."""
    try:
        # Try to start redis-server directly (works if Redis is in PATH)
        print("🔴 Starting Redis server...")
        redis_process = subprocess.Popen(
            ["redis-server"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0
        )
        spawned_processes.append(redis_process)
        time.sleep(1)  # Give Redis time to start
        
        if redis_process.poll() is None:  # Process is still running
            print("✓ Redis server started successfully")
            return True
        else:
            print("⚠ Redis server failed to start. Trying alternative methods...")
            return False
            
    except FileNotFoundError:
        print("⚠ redis-server not found in PATH")
        print("\nOptions to run Redis on Windows:")
        print("1. Using WSL (Windows Subsystem for Linux):")
        print("   - Open WSL terminal and run: redis-server")
        print("   - Or add to .env: REDIS_URL=redis://localhost:6379")
        print("\n2. Using Docker:")
        print("   - Run: docker run -d -p 6379:6379 redis:latest")
        print("\n3. Download Redis for Windows:")
        print("   - See: https://github.com/microsoftarchive/redis/releases")
        return False
    except Exception as e:
        print(f"⚠ Error starting Redis: {e}")
        return False

def cleanup(signum=None, frame=None):
    """Clean up spawned processes on exit."""
    print("\n\n🛑 Shutting down...")
    for process in spawned_processes:
        try:
            if sys.platform == "win32":
                process.send_signal(signal.CTRL_C_EVENT)
            else:
                process.terminate()
        except:
            pass
    
    # Wait for processes to terminate
    for process in spawned_processes:
        try:
            process.wait(timeout=2)
        except:
            process.kill()
    
    sys.exit(0)

if __name__ == "__main__":
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)
    
    # Try to start Redis
    redis_available = start_redis()
    
    if not redis_available:
        print("\n⚠ Running without Redis server. Cache features won't work.")
        print("  Set REDIS_URL in .env if you have Redis running elsewhere.\n")
    
    # Start Flask app
    print("\n🚀 Starting Flask server...\n")
    port = int(os.environ.get('PORT', 5050))
    
    try:
        socketio.run(
            app,
            host="0.0.0.0",
            port=port,
            debug=False,
            use_reloader=False,
            allow_unsafe_werkzeug=True,
        )
    except KeyboardInterrupt:
        cleanup()

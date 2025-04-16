import os

socketio_config = {
    "ping_timeout": 120,
    "ping_interval": 20,
    "async_mode": "eventlet",
    "cors_allowed_origins": "*"
}

if os.getenv("RENDER", "false").lower() == "true":
    HOST, PORT, DEBUG_MODE = "0.0.0.0", int(os.environ.get("PORT", 10000)), False
else:
    HOST, PORT, DEBUG_MODE = "192.168.1.2", 5000, True

import os
import socket

def get_local_ip():
    """Tenta descobrir o IP local da máquina."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# Configurações base do Socket.IO
BASE_SOCKETIO_CONFIG = {
    "ping_timeout": 120,
    "ping_interval": 20,
    "async_mode": "eventlet",
    "cors_allowed_origins": "*",
    "logger": False,            # desativa logs do socketio
    "engineio_logger": False    # desativa logs do engineio
}


def get_server_config():
    """Obtém todas as configurações baseadas no ambiente"""
    is_production = os.getenv("RENDER", "false").lower() == "true"
    
    if is_production:
        return {
            "HOST": "0.0.0.0",
            "PORT": int(os.environ.get("PORT", 10000)),
            "DEBUG_MODE": False,
            "IS_PRODUCTION": True,
            "SERVER_URL": "https://ouca-junto.onrender.com",
            "SOCKETIO_CONFIG": {
                **BASE_SOCKETIO_CONFIG,
                "cors_allowed_origins": ["https://ouca-junto.onrender.com"],
                "logger": False,
                "engineio_logger": False
            }
        }
    else:
        local_ip = get_local_ip()
        return {
            "HOST": local_ip,
            "PORT": 5000,
            "DEBUG_MODE": True,
            "IS_PRODUCTION": False,
            "SERVER_URL": f"http://{local_ip}:5000",
            "SOCKETIO_CONFIG": {
                **BASE_SOCKETIO_CONFIG,
                "cors_allowed_origins": "*"
            }
        }

# Exporta as configurações
config = get_server_config()
HOST = config['HOST']
PORT = config['PORT']
DEBUG_MODE = config['DEBUG_MODE']
SOCKETIO_CONFIG = config['SOCKETIO_CONFIG']
SERVER_URL = config['SERVER_URL']
IS_PRODUCTION = config['IS_PRODUCTION']
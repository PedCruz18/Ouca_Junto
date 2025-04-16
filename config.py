import os
import socket

# Configurações base do Socket.IO
BASE_SOCKETIO_CONFIG = {
    "ping_timeout": 120,
    "ping_interval": 20,
    "async_mode": "eventlet",
    "cors_allowed_origins": "*",
    "logger": True,
    "engineio_logger": True
}

def get_local_ip():
    """Obtém o IP local da máquina"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # não precisa ser acessível, só força o sistema a descobrir o IP da máquina
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip

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

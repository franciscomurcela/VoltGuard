#!/usr/bin/env python3

import os
import logging

from pathlib import Path
from dotenv import load_dotenv

# Load .env from the notifications-service root, regardless of cwd
_env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=_env_path, override=True)

import connexion
from flask import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST, REGISTRY

from swagger_server import encoder
from swagger_server.db import get_db
from swagger_server.vault_loader import load_vault_secrets

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


def main():
    get_db()

    load_vault_secrets()
    app = connexion.App(__name__, specification_dir='./swagger/')
    app.app.json_encoder = encoder.JSONEncoder
    app.add_api(
        'swagger.yaml',
        arguments={'title': 'Notifications API (Multichannel Gateway)'},
        pythonic_params=True
    )

    # Expose /metrics via Flask
    @app.app.route('/metrics')
    def metrics():
        return Response(generate_latest(REGISTRY), mimetype=CONTENT_TYPE_LATEST)

    port = int(os.environ.get('SERVER_PORT', 8083))
    host = os.environ.get('SERVER_HOST', '0.0.0.0')
    auth_set = bool(os.environ.get('AUTH_TOKEN', ''))
    logger.info(f"Starting Notifications Service on {host}:{port} | AUTH_TOKEN set={auth_set}")
    app.run(host=host, port=port)


if __name__ == '__main__':
    main()

.PHONY: up down restart logs certs

up:
	@if [ ! -f kong/certs/cert.pem ]; then \
		echo "==> Certificates not found. Running setup..."; \
		./scripts/setup-certs.sh; \
		echo "==> Please restart Firefox now, then press Enter to continue."; \
		read _; \
	fi
	sudo docker compose up -d

down:
	sudo docker compose down

restart:
	sudo docker compose restart

logs:
	sudo docker compose logs -f

#!/usr/bin/env bash
# 观澜量化系统 - 一键部署脚本 (Ubuntu/Debian)
# 用法: chmod +x deploy.sh && ./deploy.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="guanlan"
PYTHON="${PYTHON:-python3}"

echo "========================================"
echo "  Guanlan Quant System - Deploy"
echo "  APP_DIR: $APP_DIR"
echo "========================================"

# Step 1: Pull latest code
cd "$APP_DIR"
if [ -d .git ]; then
  echo "[1/5] Pulling latest code..."
  git pull
elif [ -z "$(ls -A . 2>/dev/null)" ]; then
  echo "[1/5] Cloning repository..."
  git clone git@github.com:shipitswq/guanlan_03.git .
else
  echo "[1/5] Non-empty dir without .git, cloning to temp then copying..."
  cd /tmp && git clone git@github.com:shipitswq/guanlan_03.git deploy_tmp
  cd "$APP_DIR"
  cp -a /tmp/deploy_tmp/. "$APP_DIR/"
  rm -rf /tmp/deploy_tmp
fi

# Step 2: Backend dependencies
echo "[2/5] Installing backend dependencies..."
cd "$APP_DIR/backend"
if [ ! -d "venv" ]; then
  $PYTHON -m venv venv
fi
source venv/bin/activate
python -m pip install --upgrade pip -q
python -m pip install -r requirements.txt -q
deactivate

# Step 3: Build frontend
echo "[3/5] Installing frontend dependencies and building..."
cd "$APP_DIR/frontend"
if ! command -v node &>/dev/null; then
  echo "  -> Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt-get install -y nodejs
fi
npm install --silent
npm run build

# Step 4: Register systemd service
echo "[4/5] Registering systemd service..."
sudo tee /etc/systemd/system/$APP_NAME.service > /dev/null <<EOF
[Unit]
Description=Guanlan Quant System
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$APP_DIR/backend
ExecStart=$APP_DIR/backend/venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable $APP_NAME

# Step 5: Start service
echo "[5/5] Starting service..."
sudo systemctl restart $APP_NAME

# Check
sleep 3
if sudo systemctl is-active --quiet $APP_NAME; then
  echo ""
  echo "========================================"
  echo "  Deploy successful!"
  echo "  Visit: http://$(curl -s ifconfig.me):8000"
  echo "  Logs: sudo journalctl -u $APP_NAME -f"
  echo "========================================"
else
  echo "  Service failed to start. Check: sudo journalctl -u $APP_NAME -e"
fi

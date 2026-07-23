#!/usr/bin/env bash
# ============================================
# 观澜量化系统 — 一键部署脚本 (Ubuntu/Debian)
# 用法: chmod +x deploy.sh && ./deploy.sh
# ============================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="guanlan"
PYTHON="${PYTHON:-python3}"

echo "========================================"
echo "  观澜量化系统 部署脚本"
echo "  APP_DIR: $APP_DIR"
echo "========================================"

# ── 1. 拉取最新代码 ──
cd "$APP_DIR"
if [ -d .git ]; then
  echo "[1/5] 拉取最新代码..."
  git pull
else
  echo "[1/5] 克隆仓库..."
  git clone git@github.com:shipitswq/guanlan_03.git .
fi

# ── 2. 后端依赖 ──
echo "[2/5] 安装后端依赖..."
cd "$APP_DIR/backend"
if [ ! -d "venv" ]; then
  $PYTHON -m venv venv
fi
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate

# ── 3. 前端构建 ──
echo "[3/5] 安装前端依赖并构建..."
cd "$APP_DIR/frontend"
if ! command -v node &>/dev/null; then
  echo "  -> 安装 Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
  sudo apt-get install -y nodejs
fi
npm install --silent
npm run build

# ── 4. 安装系统服务 ──
echo "[4/5] 注册 systemd 服务..."
sudo tee /etc/systemd/system/$APP_NAME.service > /dev/null <<EOF
[Unit]
Description=观澜量化系统
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

# ── 5. 启动 ──
echo "[5/5] 启动服务..."
sudo systemctl restart $APP_NAME

# ── 检查 ──
sleep 3
if sudo systemctl is-active --quiet $APP_NAME; then
  echo ""
  echo "========================================"
  echo "  ✅ 部署成功！"
  echo "  访问: http://$(curl -s ifconfig.me):8000"
  echo "  查看日志: sudo journalctl -u $APP_NAME -f"
  echo "========================================"
else
  echo "  ❌ 服务启动失败，查看日志: sudo journalctl -u $APP_NAME -e"
fi

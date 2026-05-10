#!/usr/bin/env bash
# infrastructure/ec2/user-data.sh
# AWS EC2 user-data — runs ONCE on first boot as root.
# Installs Docker + the compose plugin, certbot, the firewall, and the project
# layout. Application deploy happens separately via SSH (see scripts/deploy.sh).

set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

# ── System packages ────────────────────────────────────────────────
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  ufw \
  certbot \
  git \
  jq \
  unattended-upgrades

# ── Docker (official APT repo) ─────────────────────────────────────
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable
EOF

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable docker for the ubuntu user
usermod -aG docker ubuntu
systemctl enable --now docker

# ── Firewall ───────────────────────────────────────────────────────
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# ── Unattended security updates ────────────────────────────────────
echo 'APT::Periodic::Update-Package-Lists "1";' >  /etc/apt/apt.conf.d/20auto-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";' >> /etc/apt/apt.conf.d/20auto-upgrades

# ── Project layout ─────────────────────────────────────────────────
mkdir -p /opt/leaderboard
chown ubuntu:ubuntu /opt/leaderboard

# ── Marker so we can verify completion ─────────────────────────────
echo "user-data complete at $(date -u +%FT%TZ)" > /var/log/leaderboard-bootstrap.log

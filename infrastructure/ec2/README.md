# EC2 provisioning — one-time setup

Manual checklist for spinning up the production host. Do this once.

## 1. AWS resources

- [ ] EC2 instance: **Ubuntu 22.04 LTS**, **t3.small** (2 vCPU, 2 GB), 20 GB gp3 root volume, in your preferred region.
- [ ] Security group: inbound TCP **22**, **80**, **443** from `0.0.0.0/0`; all outbound allowed.
- [ ] Elastic IP associated with the instance (so the IP doesn't change on reboot).
- [ ] An SSH key pair you own. The private key is referenced as `~/.ssh/leaderboard-ec2.pem` in the deploy scripts.
- [ ] Set the instance's **User data** to the contents of `infrastructure/ec2/user-data.sh` at launch time.

## 2. Domain

- [ ] Register a domain or pick a free option:
  - **Cheapest path:** any registrar (Cloudflare, Namecheap, etc.) — ~$10/year.
  - **Free path:** [duckdns.org](https://www.duckdns.org/) — free dynamic DNS, supports Let's Encrypt.
  - **Zero-setup path:** [`<ip-with-dashes>.nip.io`](https://nip.io/) — works without DNS records, but Let's Encrypt rate-limits nip.io heavily; not recommended for case demos.
- [ ] Create an **A record** for `leaderboard.<your-domain>` pointing to the elastic IP.
- [ ] Verify with `dig +short leaderboard.<your-domain>` — must return the EIP.

## 3. First SSH

```bash
ssh -i ~/.ssh/leaderboard-ec2.pem ubuntu@leaderboard.<your-domain>
```

Verify on the instance:

```bash
docker --version
docker compose version
certbot --version
cat /var/log/leaderboard-bootstrap.log
```

If `leaderboard-bootstrap.log` is missing, user-data didn't run. Re-attach the script and reboot the instance, or run `sudo bash /var/lib/cloud/instance/scripts/part-001` manually.

## 4. Continue with the deploy plan (Task 9 onwards)

The next steps — clone the repo, fill `.env.production`, bring up the HTTP-only stack, issue the first Let's Encrypt cert, switch to HTTPS — are documented inline in `docs/superpowers/plans/2026-05-09-leaderboard-deploy-and-docs.md`. From your laptop, ongoing deploys are `make prod-deploy` (or `infrastructure/scripts/deploy.sh` directly).

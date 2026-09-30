# Deploying OFFSTAGE (Sutradhar) to one EC2 instance

One Ubuntu instance runs everything with Docker Compose: Postgres with pgvector, the web app, the
worker, Mailpit and Caddy (HTTPS). The same `docker-compose.yml` runs on a laptop.

```
browser ── https ──> Caddy :443 ──> app :3000 (Next.js)
                                      │
                         Postgres :5432 (localhost only) <── worker (agents, outbox, Telegram polling)
```

## Current deployment

| | |
|---|---|
| URL | https://your-host.sslip.io (permanent: Elastic IP `203.0.113.10`, `eipalloc-0123456789abcdef0`) |
| Instance | `i-0123456789abcdef0`, `t3.medium`, Ubuntu 24.04, ap-south-1, 30 GB gp3 (encrypted) |
| Security group | `sg-0123456789abcdef0` (`offstage-web`): 22 from one laptop IP, 80 and 443 open |
| Key pair | `offstage-deploy` (ed25519), private key at `~/.ssh/offstage-deploy.pem` on Vedant's laptop |
| Tags | Every resource has `Project=offstage` |
| AWS profile | `offstage-deploy` (EC2 only). The app's own key (`offstage-app`, in `.env`) is for Bedrock and SES and cannot touch EC2. |

## What you need

| Item | Notes |
|---|---|
| AWS credentials that can launch EC2 | The CLI profile `offstage-deploy`, used only with `--profile offstage-deploy`. Never copy its keys into `.env` or any file. |
| One instance | Ubuntu 24.04, `t3.medium` (2 vCPU, 4 GB), 30 GB gp3, region `ap-south-1`. The deploy script adds 4 GB of swap for the Next.js build. |
| Security group | Inbound 22 from your IP only, 80 and 443 from anywhere. Nothing else: Postgres and Mailpit bind to localhost. |
| Key pair | For SSH. Keep the `.pem` outside the repo. |
| A host name | Let's Encrypt does not issue certificates for `*.compute.amazonaws.com`, so use the free `sslip.io` name for the instance's IP: `your-host.sslip.io` for the Elastic IP `203.0.113.10`. |
| Turnstile | Cloudflare's official test keys (site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`) pass on any host name. Real keys need the host name on the widget. |
| Email | `EMAIL_DRIVER=smtp` through Amazon SES. The account is out of the SES sandbox (50,000 a day) and `example.org` is verified with DKIM, so any recipient works with `EMAIL_FROM=OFFSTAGE <offstage@example.org>`. |

## 1. Launch the instance

Run from Git Bash or any shell with the AWS CLI. `MSYS_NO_PATHCONV=1` on the one command that
passes `/dev/sda1` stops Git Bash on Windows from rewriting it into a Windows path.

```bash
P="--profile offstage-deploy --region ap-south-1"
TAG='{Key=Project,Value=offstage}'
# The profile has no SSM access, so find the newest Ubuntu 24.04 image from Canonical directly.
AMI=$(aws ec2 describe-images $P --owners 099720109477 \
  --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" "Name=state,Values=available" \
  --query "sort_by(Images,&CreationDate)[-1].ImageId" --output text)
aws ec2 create-key-pair $P --key-name offstage-deploy --key-type ed25519 \
  --tag-specifications "ResourceType=key-pair,Tags=[$TAG]" --query KeyMaterial --output text > ~/.ssh/offstage-deploy.pem
sed -i 's/\r$//' ~/.ssh/offstage-deploy.pem && chmod 600 ~/.ssh/offstage-deploy.pem   # Windows adds CRLF; ssh rejects it
VPC=$(aws ec2 describe-vpcs $P --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text)
SG=$(aws ec2 create-security-group $P --group-name offstage-web --description "OFFSTAGE web and SSH" --vpc-id $VPC \
  --tag-specifications "ResourceType=security-group,Tags=[$TAG,{Key=Name,Value=offstage-web}]" --query GroupId --output text)
aws ec2 authorize-security-group-ingress $P --group-id $SG --ip-permissions \
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$(curl -s https://checkip.amazonaws.com)/32}]" \
  "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]" \
  "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]"
MSYS_NO_PATHCONV=1 aws ec2 run-instances $P --image-id $AMI --instance-type t3.medium --key-name offstage-deploy \
  --security-group-ids $SG --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}' \
  --tag-specifications "ResourceType=instance,Tags=[$TAG,{Key=Name,Value=offstage}]" "ResourceType=volume,Tags=[$TAG,{Key=Name,Value=offstage}]" \
  --query 'Instances[0].InstanceId' --output text
```

Public IP: `aws ec2 describe-instances $P --filters Name=tag:Project,Values=offstage --query 'Reservations[].Instances[].PublicIpAddress' --output text`.

## 2. Write the cloud `.env`

Copy `.env` to `.env.cloud` (ignored by git) and change:

```bash
DOMAIN=your-host.sslip.io
APP_URL=https://your-host.sslip.io
TRUST_PROXY=true
POSTGRES_PASSWORD=<long random string>
DB_PORT=127.0.0.1:5432                          # Postgres only on the host's loopback
MAILPIT_SMTP_PORT=127.0.0.1:1025
MAILPIT_WEB_PORT=127.0.0.1:8025
AI_PROFILE=demo                                 # Groq and Bedrock; there is no Ollama on the server
DEMO_MODE=true                                  # persona switcher for the judges; false for a real event
EMAIL_DRIVER=smtp
EMAIL_FROM=OFFSTAGE <offstage@example.org>
# SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS: the output of `pnpm ses:smtp-password`
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# First boot: leave these empty so the server neither polls the Telegram bot (the laptop worker
# may still be polling it) nor sends real WhatsApp, SMS or Telegram messages.
TELEGRAM_BOT_TOKEN=
DEMO_REAL_RECIPIENTS=
# Demo inbox (DEMO_MODE only): OTP emails to seeded personas and allowlisted emails also go to the
# server's Mailpit, and the OTP screen links to them. Personas (@sutradhar.test) never go to SES.
MAILPIT_SMTP_HOST=mailpit
MAILPIT_URL=http://mailpit:8025
# Only this server polls the Telegram bot. Laptops keep the default (off) and still send.
TELEGRAM_POLLING=on
# Real WhatsApp and Telegram to DEMO_REAL_RECIPIENTS only when on. Leave off and switch it on from
# the console (Demo scenarios, owner only) just before the demo; demo:reset turns it back off.
REAL_SENDS=off
```

Keep the same `AUTH_SECRET`, `PII_ENCRYPTION_KEY` and ticket keys as the database you seed, or
generate new ones with `pnpm keys` before the first `--seed` (the seed encrypts with them).

## 3. Deploy

```bash
HOST=ubuntu@203.0.113.10 KEY=~/.ssh/offstage-deploy.pem ENV_FILE=.env.cloud scripts/deploy/deploy.sh --seed
```

The script ships the current commit (the repo is private, so the host never clones it), installs
Docker on first run, builds the image, runs migrations, with `--seed` resets the demo world (which
also indexes the KB and sets the demo clock), then starts the app, the worker and Caddy and waits
for `https://<DOMAIN>/api/health`. Later deploys: the same command without `--seed` keeps the data.

## 4. Channels

- **Telegram**: a worker long-polls the bot only with `TELEGRAM_POLLING=on`, and Telegram allows one
  poller per bot token, so only the server sets it. Every other worker (laptops) keeps the default
  `off`; sending needs only the token, so laptops still deliver outbound Telegram. The worker logs
  `telegram polling: on` or `off` at start; a second poller shows in the server's log as
  `telegram getUpdates 409`. Links (a person's chat id, encrypted with `PII_ENCRYPTION_KEY`) survive
  `demo:reset`; a chat linked on a laptop can be copied into the server's `telegram_links` when both
  use the same key, or the person sends `/start` to the bot again.
- **Real sends**: with `REAL_SENDS` off, every outbox message, allowlisted or not, goes to the mock
  driver and the worker logs `real sends off`. The owner switches it on in the console (Demo
  scenarios panel; the header then shows REAL SENDS ON). `demo:reset` returns it to the `.env`
  default. The Message delivery table explains failures, for example "Twilio daily cap reached,
  resets in 5 hours".
- **WhatsApp**: Twilio has no API for the sandbox's inbound URL, so set it in the Console:
  Messaging, Try it out, Send a WhatsApp message, Sandbox settings, "When a message comes in" =
  `https://your-host.sslip.io/api/channels/twilio/whatsapp`, method POST, Save. The route
  checks Twilio's signature against `APP_URL`, so `APP_URL` must be exactly that https address.
  Only numbers in `DEMO_REAL_RECIPIENTS` get replies, and each phone must have joined the sandbox
  in the last 72 hours. A trial account is capped at 50 messages a day (error 63038).

## 5. Operate

```bash
ssh -i ~/.ssh/offstage-deploy.pem ubuntu@203.0.113.10
cd /opt/sutradhar
sudo docker compose --profile cloud ps
sudo docker compose --profile cloud logs -f --tail 100 app worker
sudo docker compose --profile cloud run --rm --no-deps app pnpm demo:reset   # fresh demo world
sudo docker compose --profile cloud run --rm --no-deps app pnpm demo:trigger speaker_cancel
sudo docker compose exec db pg_dump -U sutradhar sutradhar | gzip > backup.sql.gz
```

## 6. Stop and start to save credits

A stopped instance costs nothing for compute; the 30 GB disk (about USD 0.09 a day) and the Elastic IP
(about USD 0.12 a day) are still billed, and the data survives. Compose restarts every container when the instance boots.

```bash
P="--profile offstage-deploy --region ap-south-1"
ID=$(aws ec2 describe-instances $P --filters Name=tag:Project,Values=offstage Name=instance-state-name,Values=running,stopped \
  --query 'Reservations[].Instances[].InstanceId' --output text)
aws ec2 stop-instances $P --instance-ids $ID      # after a demo
aws ec2 start-instances $P --instance-ids $ID     # before the next one
aws ec2 wait instance-running $P --instance-ids $ID
aws ec2 describe-instances $P --instance-ids $ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
```

The Elastic IP `203.0.113.10` stays attached across stops, so the URL, the certificate and the
Twilio webhook do not change. After a start, only allow SSH from your current IP if it changed:

```bash
SG=$(aws ec2 describe-security-groups $P --group-names offstage-web --query 'SecurityGroups[0].GroupId' --output text)
aws ec2 authorize-security-group-ingress $P --group-id $SG --protocol tcp --port 22 --cidr "$(curl -s https://checkip.amazonaws.com)/32"
```

## 7. Tear down

Everything was created with `Project=offstage`. After the event:

```bash
P="--profile offstage-deploy --region ap-south-1"
ID=$(aws ec2 describe-instances $P --filters Name=tag:Project,Values=offstage \
  --query 'Reservations[].Instances[?State.Name!=`terminated`].InstanceId' --output text)
aws ec2 terminate-instances $P --instance-ids $ID            # the disk is deleted with it
aws ec2 wait instance-terminated $P --instance-ids $ID
aws ec2 delete-security-group $P --group-name offstage-web
aws ec2 delete-key-pair $P --key-name offstage-deploy && rm -f ~/.ssh/offstage-deploy.pem
# The Elastic IP keeps billing until it is released:
aws ec2 describe-addresses $P --filters Name=tag:Project,Values=offstage --query 'Addresses[].AllocationId' --output text   | xargs -r -n1 aws ec2 release-address $P --allocation-id
```

Then point the Twilio sandbox webhook back (or clear it), and restart the laptop worker if you
still need Telegram. Check nothing is left: `aws resourcegroupstaggingapi get-resources $P
--tag-filters Key=Project,Values=offstage` (needs tagging permissions) or the EC2 console filtered
by the tag.

## Cost

On-demand prices in ap-south-1; check the AWS pricing calculator for current numbers.

| While running | Per hour | Per day |
|---|---|---|
| `t3.medium` | USD 0.0448 | USD 1.08 |
| Elastic IP (public IPv4) | USD 0.005 | USD 0.12 |
| 30 GB gp3 | | USD 0.09 |
| **Total** | | **about USD 1.29** |

Stopped: about USD 0.21 a day (the disk plus the Elastic IP, which is billed while stopped too).
Model, SES and Twilio usage are billed separately and are small for a demo.

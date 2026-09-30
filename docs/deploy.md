# Deploying Sutradhar to one EC2 instance

One Ubuntu instance runs everything with Docker Compose: Postgres with pgvector, the web app, the
worker, Mailpit and Caddy (HTTPS). The same `docker-compose.yml` runs on a laptop.

```
browser ── https ──> Caddy :443 ──> app :3000 (Next.js)
                                      │
                         Postgres :5432 (localhost only) <── worker (agents, outbox, Telegram polling)
```

## What you need

| Item | Notes |
|---|---|
| AWS credentials that can launch EC2 | The app's own IAM user (`offstage-app`) cannot. Use an admin or a deploy user with EC2 rights, only on your machine, never in `.env`. |
| One instance | Ubuntu 24.04, `t3.medium` (2 vCPU, 4 GB), 30 GB gp3, region `ap-south-1`. The deploy script adds 4 GB of swap for the Next.js build. |
| Security group | Inbound 22 from your IP only, 80 and 443 from anywhere. Nothing else: Postgres and Mailpit bind to localhost. |
| Key pair | For SSH. Keep the `.pem` outside the repo. |
| A host name | Let's Encrypt does not issue certificates for `*.compute.amazonaws.com`. Use the free `sslip.io` name for the instance's IP: `13-233-10-20.sslip.io` for `13.233.10.20`. An Elastic IP keeps the name stable across stops; AWS bills every public IPv4 address, Elastic or not, at about USD 0.005 an hour. |
| Turnstile | Add the host name to the Turnstile widget's allowed hostnames in the Cloudflare dashboard, or registration fails the human check. |
| Email | `EMAIL_DRIVER=smtp` through Amazon SES (the account has production access). `EMAIL_FROM` must be an SES-verified identity. |

## 1. Launch the instance

With your deploy credentials (not the app's):

```bash
export AWS_REGION=ap-south-1
AMI=$(aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text)
aws ec2 create-key-pair --key-name sutradhar --query KeyMaterial --output text > ~/.ssh/sutradhar.pem && chmod 600 ~/.ssh/sutradhar.pem
SG=$(aws ec2 create-security-group --group-name sutradhar-web --description "Sutradhar web" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 --cidr "$(curl -s https://checkip.amazonaws.com)/32"
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 run-instances --image-id $AMI --instance-type t3.medium --key-name sutradhar \
  --security-group-ids $SG --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=sutradhar}]' \
  --query 'Instances[0].InstanceId' --output text
```

Note the public IP (`aws ec2 describe-instances --filters Name=tag:Name,Values=sutradhar --query 'Reservations[].Instances[].PublicIpAddress'`).

## 2. Write the cloud `.env`

Copy `.env` to `.env.cloud` (ignored by git) and change:

```bash
DOMAIN=13-233-10-20.sslip.io
APP_URL=https://13-233-10-20.sslip.io
TRUST_PROXY=true
POSTGRES_PASSWORD=<long random string>        # pnpm keys prints some
DB_PORT=127.0.0.1:5432                          # Postgres only on the host's loopback
MAILPIT_SMTP_PORT=127.0.0.1:1025
MAILPIT_WEB_PORT=127.0.0.1:8025
AI_PROFILE=demo                                 # Groq and Bedrock; there is no Ollama on the server
DEMO_MODE=true                                  # persona switcher for the judges; false for a real event
EMAIL_DRIVER=smtp
EMAIL_FROM=Sutradhar <no-reply@<verified domain>>
# SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS: paste the output of `pnpm ses:smtp-password`
```

Keep the same `AUTH_SECRET`, `PII_ENCRYPTION_KEY` and ticket keys as the database you seed, or
generate new ones with `pnpm keys` before the first `--seed` (the seed encrypts with them).

## 3. Deploy

```bash
HOST=ubuntu@<public ip> KEY=~/.ssh/sutradhar.pem ENV_FILE=.env.cloud scripts/deploy/deploy.sh --seed
```

The script ships the current commit (the repo is private, so the host never clones it), installs
Docker on first run, builds the image, runs migrations, with `--seed` resets the demo world and
indexes the KB, then starts the app, the worker and Caddy and waits for
`https://<DOMAIN>/api/health`. Later deploys: the same command without `--seed` keeps the data.

## 4. Channels

- **Telegram**: nothing to point anywhere. The worker long-polls the bot, so it works as soon as
  the worker runs. Do not run a second worker (for example on a laptop) with the same bot token,
  or the two will share updates.
- **WhatsApp**: in the Twilio console, Messaging, Try it out, WhatsApp sandbox settings, set "When a
  message comes in" to `https://<DOMAIN>/api/channels/twilio/whatsapp` (POST). The route checks
  Twilio's signature against `APP_URL`, so `APP_URL` must be exactly the public https address.
  Only numbers in `DEMO_REAL_RECIPIENTS` get replies.

## 5. Operate

```bash
ssh -i ~/.ssh/sutradhar.pem ubuntu@<ip>
cd /opt/sutradhar
sudo docker compose --profile cloud ps
sudo docker compose --profile cloud logs -f --tail 100 app worker
sudo docker compose --profile cloud run --rm --no-deps app pnpm demo:reset   # fresh demo world
sudo docker compose --profile cloud run --rm --no-deps app pnpm demo:trigger speaker_cancel
sudo docker compose exec db pg_dump -U sutradhar sutradhar | gzip > backup.sql.gz
```

## Cost and teardown

`t3.medium` in ap-south-1 is about USD 0.045 an hour (about USD 1.10 a day), plus the public IPv4
address (about USD 0.005 an hour) and 30 GB of gp3 (about USD 2.70 a month), on the AWS credits.
Check current prices in the AWS pricing calculator before launching. Stop the instance when not demoing; terminate it and
delete the security group and key pair after the event.

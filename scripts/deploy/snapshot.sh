#!/usr/bin/env bash
# Before-demo snapshot: a Postgres dump on the server (and a copy on this machine) plus an EBS
# snapshot of the server's disk, tagged Project=offstage. See docs/deploy.md, "Snapshot and restore".
#
#   HOST=ubuntu@203.0.113.10 KEY=~/.ssh/offstage-deploy.pem scripts/deploy/snapshot.sh [--wait]
#
# --wait blocks until the EBS snapshot is complete (a few minutes for 30 GB the first time).
set -euo pipefail

: "${HOST:?HOST=ubuntu@<public ip>}"
: "${KEY:?KEY=<path to the .pem key>}"
PROFILE="${AWS_PROFILE_DEPLOY:-offstage-deploy}"
REGION="${AWS_REGION:-ap-south-1}"
P=(--profile "$PROFILE" --region "$REGION")
TS=$(date -u +%Y%m%dT%H%M%SZ)
NAME="offstage-$TS"
SSH=(ssh -i "$KEY" -o BatchMode=yes "$HOST")

echo "== Postgres dump $NAME.dump"
# Outside /opt/sutradhar: every deploy replaces that folder.
"${SSH[@]}" "sudo mkdir -p /opt/sutradhar-backups && cd /opt/sutradhar && \
  sudo docker compose exec -T db pg_dump -U sutradhar -d sutradhar -Fc | sudo tee /opt/sutradhar-backups/$NAME.dump >/dev/null && \
  sudo ls -lh /opt/sutradhar-backups/$NAME.dump"
mkdir -p "$HOME/offstage-backups"
"${SSH[@]}" "sudo cat /opt/sutradhar-backups/$NAME.dump" > "$HOME/offstage-backups/$NAME.dump"
REMOTE_SUM=$("${SSH[@]}" "sudo sha256sum /opt/sutradhar-backups/$NAME.dump" | cut -d' ' -f1)
LOCAL_SUM=$(sha256sum "$HOME/offstage-backups/$NAME.dump" | cut -d' ' -f1)
[ "$REMOTE_SUM" = "$LOCAL_SUM" ] || { echo "local copy does not match the server's dump"; exit 1; }
echo "   copy on this machine: $HOME/offstage-backups/$NAME.dump (checksum matches)"

echo "== EBS snapshot"
VOL=$(aws ec2 describe-instances "${P[@]}" \
  --filters Name=tag:Project,Values=offstage Name=instance-state-name,Values=running,stopped \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text)
SNAP=$(aws ec2 create-snapshot "${P[@]}" --volume-id "$VOL" --description "OFFSTAGE before demo $TS" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Project,Value=offstage},{Key=Name,Value=$NAME}]" \
  --query SnapshotId --output text)
echo "   $SNAP of $VOL"
if [ "${1:-}" = "--wait" ]; then
  aws ec2 wait snapshot-completed "${P[@]}" --snapshot-ids "$SNAP"
  echo "   complete"
fi
echo
echo "Restore the database:  HOST=$HOST KEY=$KEY scripts/deploy/restore.sh $NAME.dump"
echo "Restore the whole disk: docs/deploy.md, \"Snapshot and restore\", with $SNAP"

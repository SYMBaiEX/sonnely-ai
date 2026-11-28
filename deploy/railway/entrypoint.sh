#!/bin/sh
set -eu

data_dir=/app/dist/data
node_uid=$(id -u node)
node_gid=$(id -g node)

mkdir -p "$data_dir"
data_owner=$(stat -c '%u:%g' "$data_dir")

if [ "$data_owner" != "$node_uid:$node_gid" ]; then
  chown -R --no-dereference "$node_uid:$node_gid" "$data_dir"
fi

exec setpriv "--reuid=$node_uid" "--regid=$node_gid" --clear-groups --no-new-privs "$@"

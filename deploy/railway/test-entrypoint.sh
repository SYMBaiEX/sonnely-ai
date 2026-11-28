#!/bin/sh
set -eu

fixture_dir=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$fixture_dir/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

bin="$tmp/bin"
ownership="$tmp/ownership"
log="$tmp/commands"
expected="$tmp/expected"
mkdir "$bin"
export FIXTURE_OWNERSHIP="$ownership"
export FIXTURE_LOG="$log"

cat > "$bin/mkdir" <<'EOF'
#!/bin/sh
printf 'mkdir %s\n' "$*" >> "$FIXTURE_LOG"
EOF

cat > "$bin/id" <<'EOF'
#!/bin/sh
case "${1-} ${2-}" in
  "-u node") printf '1000\n' ;;
  "-g node") printf '1000\n' ;;
  *) exit 1 ;;
esac
EOF

cat > "$bin/stat" <<'EOF'
#!/bin/sh
if [ "${1-}" != "-c" ] || [ "${2-}" != "%u:%g" ] || [ "${3-}" != "/app/dist/data" ]; then
  exit 1
fi
printf 'stat %s\n' "$*" >> "$FIXTURE_LOG"
cat "$FIXTURE_OWNERSHIP"
EOF

cat > "$bin/chown" <<'EOF'
#!/bin/sh
printf 'chown %s\n' "$*" >> "$FIXTURE_LOG"
printf '1000:1000\n' > "$FIXTURE_OWNERSHIP"
EOF

cat > "$bin/setpriv" <<'EOF'
#!/bin/sh
printf 'setpriv %s\n' "$*" >> "$FIXTURE_LOG"
while [ $# -gt 0 ]; do
  case "$1" in
    --reuid=*|--regid=*|--clear-groups|--no-new-privs) shift ;;
    *) break ;;
  esac
done
exec "$@"
EOF

cat > "$bin/node" <<'EOF'
#!/bin/sh
printf 'node %s\n' "$*" >> "$FIXTURE_LOG"
EOF

chmod +x "$bin"/*

original_path=$PATH
run_entrypoint() {
  PATH="$bin:$original_path" "$fixture_dir/entrypoint.sh" node dist/src/main.js
}

expect_commands() {
  diff -u "$expected" "$log"
}

printf '0:0\n' > "$ownership"
: > "$log"
run_entrypoint
cat > "$expected" <<'EOF'
mkdir -p /app/dist/data
stat -c %u:%g /app/dist/data
chown -R --no-dereference 1000:1000 /app/dist/data
setpriv --reuid=1000 --regid=1000 --clear-groups --no-new-privs node dist/src/main.js
node dist/src/main.js
EOF
expect_commands

: > "$log"
run_entrypoint
cat > "$expected" <<'EOF'
mkdir -p /app/dist/data
stat -c %u:%g /app/dist/data
setpriv --reuid=1000 --regid=1000 --clear-groups --no-new-privs node dist/src/main.js
node dist/src/main.js
EOF
expect_commands

printf '1000:0\n' > "$ownership"
: > "$log"
run_entrypoint
cat > "$expected" <<'EOF'
mkdir -p /app/dist/data
stat -c %u:%g /app/dist/data
chown -R --no-dereference 1000:1000 /app/dist/data
setpriv --reuid=1000 --regid=1000 --clear-groups --no-new-privs node dist/src/main.js
node dist/src/main.js
EOF
expect_commands

grep -F 'exec setpriv ' "$fixture_dir/entrypoint.sh" > /dev/null
grep -F 'COPY --chmod=555 deploy/railway/entrypoint.sh /usr/local/bin/railway-entrypoint' "$repo_root/Dockerfile" > /dev/null
grep -F 'ENTRYPOINT ["/usr/local/bin/railway-entrypoint"]' "$repo_root/Dockerfile" > /dev/null
grep -F 'CMD ["node", "dist/src/main.js"]' "$repo_root/Dockerfile" > /dev/null
bad_user=$(grep -E '^USER[[:space:]]+' "$repo_root/Dockerfile" | grep -Ev '^USER[[:space:]]+(root|0)([[:space:]]|$)' || true)
if [ -n "$bad_user" ]; then
  echo 'Dockerfile must start the entrypoint as root' >&2
  exit 1
fi

echo 'railway entrypoint fixture passed'

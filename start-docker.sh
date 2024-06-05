#! /usr/bin/env bash

docker load <$1
docker image ls -a

# get polyfill-cache full path
mount_point="$(pwd)/polyfill-cache"

# umount polyfill-cache dir
sudo umount "$mount_point"

docker compose down -v --remove-orphans
docker compose up -d

docker image prune -a -f

#!/bin/sh
# Container entrypoint for the all-in-one image.
#
# 1. Renders /etc/nginx/templates/*.template -> /etc/nginx/conf.d/*
#    (official nginx image helper; substitutes ONLY real environment
#    variables such as ${BACKEND_HOST}, nginx variables like $host are
#    left untouched).
# 2. Hands over to supervisord (see CMD), which runs the embedded stack
#    (PostgreSQL + Node backend) and nginx.
set -e

if [ -f /docker-entrypoint.d/20-envsubst-on-templates.sh ]; then
  sh /docker-entrypoint.d/20-envsubst-on-templates.sh
fi

exec "$@"

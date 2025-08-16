#!/bin/bash

if command -v docker compose &> /dev/null; then
    docker compose build --no-cache
    docker compose up -d
else
    docker-compose build --no-cache
    docker-compose up -d
fi
# Build worker + API binaries (deploy as separate services or one image, two commands).
FROM golang:1.22-alpine AS build

WORKDIR /app

RUN apk add --no-cache ca-certificates git

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/worker ./cmd/worker \
 && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/api ./cmd/api

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata wget \
 && adduser -D -H -u 10001 app

COPY --from=build /bin/worker /worker
COPY --from=build /bin/api /api

USER app

# Default process: monitoring worker (override to /api in compose or orchestrator).
ENTRYPOINT ["/worker"]

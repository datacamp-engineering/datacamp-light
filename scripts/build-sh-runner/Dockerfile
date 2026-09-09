FROM golang:1.22-alpine AS builder

WORKDIR /build

RUN apk add --no-cache git

COPY go.mod main.go ./
RUN go mod tidy
RUN GOOS=js GOARCH=wasm go build -ldflags="-s -w" -o sh-runner.wasm .
RUN cp /usr/local/go/misc/wasm/wasm_exec.js /build/wasm_exec.js

FROM alpine:latest
COPY --from=builder /build/sh-runner.wasm /dist/sh-runner.wasm
COPY --from=builder /build/wasm_exec.js /dist/wasm_exec.js
VOLUME /out
CMD ["sh", "-c", "cp /dist/* /out/"]

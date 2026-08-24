#!/usr/bin/env python3
"""
Drives the FSPIOP JWS loop against a running web-inbound and reports what it accepts and rejects.

This is the service-level counterpart to tests/integration/jws-vault-loop-test.ts. That test proves
the libraries agree; this proves the deployed services do — real HTTP, the guard installed globally,
the public key read from MySQL, and the signing key read from Vault by the service itself.

Prerequisites — see trust-manager-docs/implementation/status.md:

    # MySQL comes from the Mojaloop test harness; do not start a second one.
    docker compose -p pivotal-stack \
        -f docker/docker-compose.yml -f docker/docker-compose.shared-db.yml \
        --env-file docker/jws-loop.env.example --profile vault up -d vault web-inbound

    # the tenant must have a key in Vault, jws_sign_enabled=1 and a verify mode of `require`
    # in participant_key; its public key stays in MySQL.

Usage:
    python3 scripts/verify-jws-service-loop.py [--inbound URL] [--vault URL] [--fsp-id ID]
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

DATE = 'Sun, 24 Aug 2026 10:00:00 GMT'


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def read_signing_key(vault: str, token: str, prefix: str, fsp_id: str) -> str:
    request = urllib.request.Request(f'{vault}/v1/secret/data/{prefix}/{fsp_id}',
                                     headers={'X-Vault-Token': token})
    return json.load(urllib.request.urlopen(request))['data']['data']['privateKey']


def sign(private_pem: str, protected: str, payload: str) -> str:
    """Detached JWS over base64url(protectedHeader) + '.' + base64url(payload)."""
    signing_input = f'{b64(protected.encode())}.{b64(payload.encode())}'

    key_file = payload_file = None
    try:
        with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=False) as handle:
            handle.write(private_pem)
            key_file = handle.name
        with tempfile.NamedTemporaryFile('w', delete=False) as handle:
            handle.write(signing_input)
            payload_file = handle.name

        signature = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', key_file, payload_file],
                                   capture_output=True, check=True).stdout
    finally:
        for path in (key_file, payload_file):
            if path:
                os.unlink(path)

    return json.dumps({'signature': b64(signature), 'protectedHeader': b64(protected.encode())})


def put(url: str, payload: str, headers: dict, label: str, expected: int) -> bool:
    request = urllib.request.Request(url, data=payload.encode(), headers=headers, method='PUT')

    try:
        status, detail = urllib.request.urlopen(request).status, ''
    except urllib.error.HTTPError as error:
        status, detail = error.code, error.read().decode()[:120]

    ok = status == expected
    print(f'  {"PASS" if ok else "FAIL"}  {label:36} HTTP {status}  {detail}')
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--inbound', default='http://127.0.0.1:3201')
    parser.add_argument('--vault', default='http://127.0.0.1:8210')
    parser.add_argument('--vault-token', default='root-dev')
    parser.add_argument('--key-prefix', default='pivotal/jwskey')
    parser.add_argument('--fsp-id', default='wallet1')
    parser.add_argument('--destination', default='wallet2')
    parser.add_argument('--quote-id', default='q-service-loop')
    args = parser.parse_args()

    uri = f'/quotes/{args.quote_id}'
    payload = json.dumps({'transferAmount': {'currency': 'MMK', 'amount': '1000'},
                          'expiration': '2026-08-24T11:00:00.000Z'}, separators=(',', ':'))

    protected = json.dumps({
        'alg': 'RS256', 'FSPIOP-URI': uri, 'FSPIOP-HTTP-Method': 'PUT',
        'FSPIOP-Source': args.fsp_id, 'FSPIOP-Destination': args.destination, 'Date': DATE,
    }, separators=(',', ':'))

    signature = sign(read_signing_key(args.vault, args.vault_token, args.key_prefix, args.fsp_id),
                     protected, payload)

    base = {'Content-Type': 'application/vnd.interoperability.quotes+json;version=2.0',
            'Date': DATE, 'FSPIOP-Source': args.fsp_id, 'FSPIOP-Destination': args.destination}
    signed = {**base, 'FSPIOP-URI': uri, 'FSPIOP-HTTP-Method': 'PUT', 'FSPIOP-Signature': signature}
    url = f'{args.inbound}{uri}'

    print(f'\nweb-inbound at {args.inbound}, expecting FSPIOP_JWS_VERIFY_MODE=require\n')

    results = [
        put(url, payload, signed, 'correctly signed', 200),
        put(url, payload, base, 'unsigned  -> 3102', 417),
        # A valid signature must not transfer to another endpoint: that is what binding the
        # request metadata into the protected header exists to prevent.
        put(url, payload, {**signed, 'FSPIOP-URI': '/quotes/another-quote'},
            'replayed elsewhere -> 3105', 401),
        put(url, json.dumps({'transferAmount': {'currency': 'MMK', 'amount': '999999'}},
                            separators=(',', ':')), signed, 'tampered body -> 3105', 401),
    ]

    print(f'\n{sum(results)}/{len(results)} as expected\n')
    return 0 if all(results) else 1


if __name__ == '__main__':
    sys.exit(main())

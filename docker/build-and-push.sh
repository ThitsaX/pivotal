#!/usr/bin/env bash

set -euo pipefail

print_usage() {
  cat <<'USAGE'
Usage:
  ./docker/build-and-push.sh --namespace <namespace> --version <version> [options]

Options:
  -n, --namespace <namespace>   Registry namespace (Docker user or GH org/user).
  -u, --user <namespace>        Alias for --namespace (backward compatible).
  -r, --registry <registry>     Registry host (default: docker.io). Example: ghcr.io
  -v, --version <version>       Image version tag to publish (example: 1.0.0).
      --no-latest               Do not tag/push :latest.
      --no-build                Skip build and only push existing local images.
  -h, --help                    Show this help message.

Examples:
  ./docker/build-and-push.sh --namespace acme --version 1.0.0
  ./docker/build-and-push.sh --namespace acme --version 1.0.1 --no-latest
  ./docker/build-and-push.sh --registry ghcr.io --namespace acme --version 1.0.0
USAGE
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Error: '${cmd}' is required but not installed."
    exit 1
  fi
}

NAMESPACE=""
REGISTRY="docker.io"
VERSION=""
PUSH_LATEST="true"
DO_BUILD="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace|-u|--user)
      NAMESPACE="${2:-}"
      shift 2
      ;;
    -r|--registry)
      REGISTRY="${2:-}"
      shift 2
      ;;
    -v|--version)
      VERSION="${2:-}"
      shift 2
      ;;
    --no-latest)
      PUSH_LATEST="false"
      shift
      ;;
    --no-build)
      DO_BUILD="false"
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Error: unknown option '$1'"
      print_usage
      exit 1
      ;;
  esac
done

if [[ -z "${NAMESPACE}" || -z "${VERSION}" ]]; then
  echo "Error: --namespace (or --user) and --version are required."
  print_usage
  exit 1
fi

if [[ -z "${REGISTRY}" ]]; then
  echo "Error: --registry cannot be empty."
  exit 1
fi

require_cmd docker

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${REPO_ROOT}/package.json" ]]; then
  echo "Error: package.json not found. Run this script from within the repository."
  exit 1
fi

IMAGE_NAMES=(
  "pivotal-app-auditor"
  "pivotal-web-outbound"
  "pivotal-web-inbound"
  "pivotal-wallet1-connector"
  "pivotal-wallet2-connector"
  "pivotal-wallet3-connector"
)

DOCKERFILES=(
  "docker/app-auditor.Dockerfile"
  "docker/web-outbound.Dockerfile"
  "docker/web-inbound.Dockerfile"
  "docker/wallet1-connector.Dockerfile"
  "docker/wallet2-connector.Dockerfile"
  "docker/wallet3-connector.Dockerfile"
)

echo "Repository: ${REPO_ROOT}"
echo "Registry: ${REGISTRY}"
echo "Namespace: ${NAMESPACE}"
echo "Version: ${VERSION}"
echo "Build: ${DO_BUILD}"
echo "Push latest: ${PUSH_LATEST}"

for i in "${!IMAGE_NAMES[@]}"; do
  IMAGE_NAME="${IMAGE_NAMES[$i]}"
  DOCKERFILE="${DOCKERFILES[$i]}"

  LOCAL_IMAGE="${IMAGE_NAME}:local"
  VERSION_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${VERSION}"
  LATEST_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:latest"

  echo
  echo "=== ${IMAGE_NAME} ==="

  if [[ "${DO_BUILD}" == "true" ]]; then
    echo "Building ${LOCAL_IMAGE} from ${DOCKERFILE} ..."
    docker build \
      -f "${REPO_ROOT}/${DOCKERFILE}" \
      -t "${LOCAL_IMAGE}" \
      "${REPO_ROOT}"
  fi

  echo "Tagging ${LOCAL_IMAGE} -> ${VERSION_IMAGE}"
  docker tag "${LOCAL_IMAGE}" "${VERSION_IMAGE}"

  if [[ "${PUSH_LATEST}" == "true" ]]; then
    echo "Tagging ${LOCAL_IMAGE} -> ${LATEST_IMAGE}"
    docker tag "${LOCAL_IMAGE}" "${LATEST_IMAGE}"
  fi

  echo "Pushing ${VERSION_IMAGE}"
  docker push "${VERSION_IMAGE}"

  if [[ "${PUSH_LATEST}" == "true" ]]; then
    echo "Pushing ${LATEST_IMAGE}"
    docker push "${LATEST_IMAGE}"
  fi
done

echo
echo "Done. Published images under '${REGISTRY}/${NAMESPACE}' with version '${VERSION}'."

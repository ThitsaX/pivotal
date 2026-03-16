#!/usr/bin/env bash

set -euo pipefail

print_usage() {
  cat <<'USAGE'
Usage:
  ./docker/build-and-push.sh --user <dockerhub_user> --version <version> [options]

Options:
  -u, --user <dockerhub_user>   Docker Hub username/namespace.
  -v, --version <version>       Image version tag to publish (example: 1.0.0).
      --no-latest               Do not tag/push :latest.
      --no-build                Skip build and only push existing local images.
  -h, --help                    Show this help message.

Examples:
  ./docker/build-and-push.sh --user acme --version 1.0.0
  ./docker/build-and-push.sh --user acme --version 1.0.1 --no-latest
USAGE
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Error: '${cmd}' is required but not installed."
    exit 1
  fi
}

DOCKER_USER=""
VERSION=""
PUSH_LATEST="true"
DO_BUILD="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--user)
      DOCKER_USER="${2:-}"
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

if [[ -z "${DOCKER_USER}" || -z "${VERSION}" ]]; then
  echo "Error: --user and --version are required."
  print_usage
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
  "pivotal-web-outbound"
  "pivotal-web-inbound"
  "pivotal-wallet1-connector"
  "pivotal-wallet2-connector"
)

DOCKERFILES=(
  "docker/web-outbound.Dockerfile"
  "docker/web-inbound.Dockerfile"
  "docker/wallet1-connector.Dockerfile"
  "docker/wallet2-connector.Dockerfile"
)

echo "Repository: ${REPO_ROOT}"
echo "Docker user: ${DOCKER_USER}"
echo "Version: ${VERSION}"
echo "Build: ${DO_BUILD}"
echo "Push latest: ${PUSH_LATEST}"

for i in "${!IMAGE_NAMES[@]}"; do
  IMAGE_NAME="${IMAGE_NAMES[$i]}"
  DOCKERFILE="${DOCKERFILES[$i]}"

  LOCAL_IMAGE="${IMAGE_NAME}:local"
  VERSION_IMAGE="${DOCKER_USER}/${IMAGE_NAME}:${VERSION}"
  LATEST_IMAGE="${DOCKER_USER}/${IMAGE_NAME}:latest"

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
echo "Done. Published images under '${DOCKER_USER}' with version '${VERSION}'."

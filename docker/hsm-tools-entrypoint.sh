#!/bin/sh
# Points the CloudHSM CLI and PKCS#11 library at this environment's cluster, then waits.
#
# The address differs per environment and the certificate is created when the cluster is
# activated, so neither is in the image: CLOUDHSM_IP comes from the environment and
# customerCA.crt is mounted at /opt/cloudhsm/etc/customerCA.crt.
set -e

if [ -z "${CLOUDHSM_IP:-}" ]; then
    echo "CLOUDHSM_IP is not set. Set it to the IP address of one HSM in the cluster." >&2
    exit 1
fi

if [ ! -f /opt/cloudhsm/etc/customerCA.crt ]; then
    echo "/opt/cloudhsm/etc/customerCA.crt is missing. Mount the cluster's certificate there." >&2
    exit 1
fi

/opt/cloudhsm/bin/configure-cli -a "$CLOUDHSM_IP"
/opt/cloudhsm/bin/configure-pkcs11 -a "$CLOUDHSM_IP"
echo "CloudHSM CLI and PKCS#11 library configured for $CLOUDHSM_IP."

# exec, so the command is PID 1 and the pod stops promptly when scaled down.
exec "$@"

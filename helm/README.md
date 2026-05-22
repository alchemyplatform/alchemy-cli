### Computev2 project - Helm ###

This Helm structure is used to deploy an app using computev2 K8s clusters.

Docker is required to run the local chart validation tools.

## Prerequisites

Authenticate to GHCR before running any validation commands:

```bash
export GHCR_TOKEN="TOKEN"
echo "${GHCR_TOKEN}" | helm registry login ghcr.io -u alchemy-docker --password-stdin
```

## Reusable Docker Wrapper

Define this helper once in your shell to avoid repeating the full `docker run` command:

```bash
helm_validation() {
  local script="$1"
  shift

  docker run \
    --pull=always \
    --platform linux/arm64 \
    --env GHCR_TOKEN="${GHCR_TOKEN}" \
    --rm -v "$(pwd):/workspace" \
    ghcr.io/alchemy-docker/computev2-helm-validation:1.0.0 \
    "/usr/local/bin/computev2-helm-validation/${script}" "$@"
}
```

## Common Commands

Render all charts:

```bash
helm_validation helm_render.py
```

Render a single chart:

```bash
helm_validation helm_render.py --environment stg --region use1 --app rundler-alchemy-sepolia
```

Lint charts:

```bash
helm_validation helm_lint.py
```

Validate schema:

```bash
helm_validation helm_schema_validation.py
```

Validate local secrets:

```bash
helm_validation helm_local_secrets_validation.py
```

Validate global secrets:

```bash
helm_validation helm_global_secrets_validation.py
```

Validate environment variables:

```bash
helm_validation helm_env_variables_validation.py
```

Run OPA conftest:

```bash
helm_validation helm_opa_conftest.py
```

## ECR Tag Verification

This command also requires AWS credentials in your shell as it does rely on polling AWS resources:

```bash
docker run \
  --pull=always \
  --platform linux/arm64 \
  --env GHCR_TOKEN="${GHCR_TOKEN}" \
  --env AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}" \
  --env AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}" \
  --env AWS_SESSION_TOKEN="${AWS_SESSION_TOKEN}" \
  --rm -v "$(pwd):/workspace" \
  ghcr.io/alchemy-docker/computev2-helm-validation:1.0.0 \
  /usr/local/bin/computev2-helm-validation/ecr_image_check.py
```
